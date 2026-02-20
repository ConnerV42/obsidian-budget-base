import { Notice, Plugin, TFile } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import { h, render } from 'preact';
import { BudgetView } from './components/BudgetView';
import { parseBudgetMarkdown, BudgetData, serializeBudgetMarkdown } from './parser';
import { BudgetFlowSettings, DEFAULT_SETTINGS, BudgetFlowSettingTab } from './settings';
import { StateUpdate } from './writeQueue';
import {
  BudgetConflictState,
  BudgetPersistenceService,
  BudgetWriteConflict,
  ConflictResolutionStrategy,
  PersistedBudgetConflictsByPath
} from './services/budgetPersistence';
import { BudgetFileService } from './services/budgetFileService';
import { normalizeMobileUiScale } from './mobileUiScale';
import {
  consumeAutoSwitchBypass,
  isLeafOfViewType,
  selectReusableDashboardLeaf
} from './services/dashboardLeafRouting';
import {
  BUDGET_DASHBOARD_VIEW_TYPE,
  BudgetDashboardRenderContext,
  BudgetDashboardView,
  isBudgetDashboardView
} from './views/BudgetDashboardView';

type BudgetDataUpdate = StateUpdate<BudgetData>;

interface StoredPluginData {
  settings: Partial<BudgetFlowSettings>;
  conflictsByFilePath: PersistedBudgetConflictsByPath;
}

export default class BudgetFlowPlugin extends Plugin {
  settings: BudgetFlowSettings;
  private budgetPersistence!: BudgetPersistenceService;
  private budgetFileService!: BudgetFileService;
  private persistedConflictsByFilePath: PersistedBudgetConflictsByPath = {};
  private bypassedAutoSwitchFilePaths = new Set<string>();
  private nextMonthEligibleFilePaths = new Set<string>();
  private nextMonthCreationInFlight = new Set<string>();

  async onload() {
    console.log('Loading BudgetBase plugin');

    await this.loadSettings();
    this.addSettingTab(new BudgetFlowSettingTab(this.app, this));

    this.budgetPersistence = new BudgetPersistenceService({
      readFile: (file) => this.app.vault.cachedRead(file),
      writeFile: async (file, content) => {
        await this.app.vault.modify(file, content);
      },
      getFileByPath: (filePath) => {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        return file instanceof TFile ? file : null;
      },
      parseBudget: (content) => parseBudgetMarkdown(content),
      serializeBudget: (data) => serializeBudgetMarkdown(data),
      onSnapshotChange: (filePath) => {
        void this.refreshDashboardViewsForFilePath(filePath);
      },
      initialPersistedConflictsByPath: this.persistedConflictsByFilePath,
      onPersistedConflictsChange: (conflictsByPath) => {
        this.persistedConflictsByFilePath = conflictsByPath;
        void this.savePluginData();
      },
      onConflict: (file, _conflict) => {
        new Notice(
          `Budget sync conflict detected for ${file.basename}. Local edits were preserved in memory and writes were paused to prevent overwrite.`,
          7000
        );
      }
    });

    this.budgetFileService = new BudgetFileService(
      this.app,
      async (file) => this.isBudgetMarkdownFile(file)
    );

    this.registerView(
      BUDGET_DASHBOARD_VIEW_TYPE,
      (leaf) => new BudgetDashboardView(leaf, {
        onRender: async (context) => {
          await this.renderDashboardViewContext(context);
        },
        onClear: (container) => {
          this.clearDashboardContainer(container);
        },
        onOpenSourceNote: (file) => {
          void this.openBudgetSourceNoteForFile(file);
        },
        canCreateNextMonth: (file) => this.canCreateNextMonthFromFile(file),
        onCreateNextMonth: (file) => {
          void this.createNextMonthBudgetFromFile(file);
        }
      })
    );

    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        void this.handleFileOpen(file);
      })
    );

    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (!(file instanceof TFile)) {
          return;
        }
        void this.refreshDashboardViewsForFile(file);
      })
    );

    this.addRibbonIcon('wallet', 'Open Budget', () => {
      void this.openBudgetFile();
    });

    this.addCommand({
      id: 'create-budget',
      name: 'Create new budget',
      callback: () => {
        void this.createNewBudget();
      }
    });

    this.addCommand({
      id: 'open-budget-view',
      name: 'Open budget dashboard',
      callback: () => {
        void this.openBudgetFile();
      }
    });

    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile) {
      void this.handleFileOpen(activeFile);
    }
  }

  onunload() {
    console.log('Unloading BudgetBase plugin');
    this.app.workspace.detachLeavesOfType(BUDGET_DASHBOARD_VIEW_TYPE);
    this.nextMonthEligibleFilePaths.clear();
    this.nextMonthCreationInFlight.clear();
    if (this.budgetPersistence) {
      this.budgetPersistence.dispose();
    }
  }

  async loadSettings() {
    const loadedData = this.normalizeStoredPluginData(await this.loadData());
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData.settings);
    this.settings.mobileUiScale = normalizeMobileUiScale(this.settings.mobileUiScale);
    const parsedMobileEdgeIconY = Number(this.settings.mobileEdgeIconY);
    this.settings.mobileEdgeIconY = Number.isFinite(parsedMobileEdgeIconY) && parsedMobileEdgeIconY > 0
      ? Math.round(parsedMobileEdgeIconY)
      : undefined;
    this.persistedConflictsByFilePath = loadedData.conflictsByFilePath;
  }

  async saveSettings() {
    await this.savePluginData();
  }

  private async handleFileOpen(file: TFile | null) {
    if (!file) {
      return;
    }

    if (file.extension !== 'md') {
      return;
    }

    if (consumeAutoSwitchBypass(this.bypassedAutoSwitchFilePaths, file.path)) {
      return;
    }

    if (isLeafOfViewType(this.app.workspace.activeLeaf, BUDGET_DASHBOARD_VIEW_TYPE)) {
      return;
    }

    if (!(await this.isBudgetMarkdownFile(file))) {
      return;
    }

    await this.openDashboardForFile(file);
  }

  private async renderDashboardViewContext(
    context: BudgetDashboardRenderContext
  ) {
    const { container, file, isCurrent } = context;

    const content = await this.app.vault.cachedRead(file);
    if (!isCurrent()) {
      return;
    }

    const budgetData = parseBudgetMarkdown(content);
    if (!budgetData || budgetData.type !== 'budget') {
      this.setNextMonthEligibility(file.path, false);
      const restoredConflictData = this.budgetPersistence.getLatestDataFromConflict(file.path, content);
      if (!isCurrent()) {
        return;
      }

      if (!restoredConflictData) {
        this.budgetPersistence.clearState(file.path);
        this.renderNonBudgetFallback(container, file);
        return;
      }

      this.renderBudgetView(container, file, restoredConflictData);
      return;
    }

    const latestData = this.budgetPersistence.getLatestData(file.path, budgetData, content);
    if (!isCurrent()) {
      return;
    }

    this.setNextMonthEligibility(file.path, true);
    this.renderBudgetView(container, file, latestData);
  }

  private renderBudgetView(
    container: HTMLElement,
    file: TFile,
    data: BudgetData,
    conflictState: BudgetConflictState | null = this.budgetPersistence.getConflictState(file.path)
  ) {
    render(
      h(BudgetView, {
        data,
        conflictState,
        mobileUiScale: normalizeMobileUiScale(this.settings.mobileUiScale),
        mobileEdgeIconY: this.settings.mobileEdgeIconY,
        onUpdate: (update: BudgetDataUpdate) => {
          void this.budgetPersistence.updateBudgetFile(file, update);
        },
        onMobileUiScaleChange: (scale: number) => {
          const normalized = normalizeMobileUiScale(scale);
          if (normalized === this.settings.mobileUiScale) return;
          this.settings.mobileUiScale = normalized;
          void this.saveSettings();
        },
        onMobileEdgeIconYChange: (y: number) => {
          const normalized = Math.round(y);
          if (!Number.isFinite(normalized) || normalized <= 0) return;
          if (normalized === this.settings.mobileEdgeIconY) return;
          this.settings.mobileEdgeIconY = normalized;
          void this.saveSettings();
        },
        onResolveConflict: async (strategy: ConflictResolutionStrategy) => {
          await this.budgetPersistence.resolveConflict(file.path, strategy);
          await this.refreshDashboardViewsForFilePath(file.path);
        }
      }),
      container
    );
  }

  private clearDashboardContainer(container: HTMLElement) {
    render(null, container);
    container.replaceChildren();
  }

  private renderNonBudgetFallback(container: HTMLElement, file: TFile) {
    this.clearDashboardContainer(container);
    this.setNextMonthEligibility(file.path, false);

    const message = document.createElement('div');
    message.className = 'budgetbase-dashboard-empty';

    const heading = document.createElement('div');
    heading.className = 'budgetbase-dashboard-empty-title';
    heading.textContent = 'This note is no longer a budget file.';

    const detail = document.createElement('p');
    detail.className = 'budgetbase-dashboard-empty-detail';
    detail.textContent = `Open ${file.basename} as Markdown to edit or restore frontmatter type: budget.`;

    message.appendChild(heading);
    message.appendChild(detail);
    container.appendChild(message);
  }

  private async refreshDashboardViewsForFile(file: TFile) {
    await this.refreshDashboardViewsForFilePath(file.path);
  }

  private async refreshDashboardViewsForFilePath(filePath: string) {
    const leaves = this.app.workspace.getLeavesOfType(BUDGET_DASHBOARD_VIEW_TYPE);

    for (const leaf of leaves) {
      const view = leaf.view;
      if (!isBudgetDashboardView(view)) {
        continue;
      }
      if (!view.file || view.file.path !== filePath) {
        continue;
      }
      await view.refreshCurrentFile();
    }
  }

  private getOrCreateDashboardLeaf(): WorkspaceLeaf {
    const existingLeaves = this.app.workspace.getLeavesOfType(BUDGET_DASHBOARD_VIEW_TYPE);
    const reusableLeaf = selectReusableDashboardLeaf(existingLeaves);
    if (reusableLeaf) {
      return reusableLeaf;
    }

    return this.app.workspace.getLeaf(false);
  }

  private async openDashboardForFile(file: TFile) {
    const leaf = this.getOrCreateDashboardLeaf();
    await leaf.setViewState({
      type: BUDGET_DASHBOARD_VIEW_TYPE,
      state: { file: file.path },
      active: true
    });
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
  }

  private findDashboardLeafForFile(filePath: string): WorkspaceLeaf | null {
    const activeLeaf = this.app.workspace.activeLeaf;
    if (
      activeLeaf
      && isBudgetDashboardView(activeLeaf.view)
      && activeLeaf.view.file?.path === filePath
    ) {
      return activeLeaf;
    }

    const leaves = this.app.workspace.getLeavesOfType(BUDGET_DASHBOARD_VIEW_TYPE);
    for (const leaf of leaves) {
      const view = leaf.view;
      if (!isBudgetDashboardView(view) || view.file?.path !== filePath) {
        continue;
      }
      return leaf;
    }

    return null;
  }

  private async openBudgetSourceNoteForFile(file: TFile) {
    const leaf = this.findDashboardLeafForFile(file.path) ?? this.app.workspace.activeLeaf;
    if (!leaf) {
      new Notice(`Unable to open source note for ${file.basename}.`, 4000);
      return;
    }

    this.bypassedAutoSwitchFilePaths.add(file.path);

    try {
      await leaf.setViewState({
        type: 'markdown',
        state: { file: file.path },
        active: true
      });
      this.app.workspace.setActiveLeaf(leaf, { focus: true });
    } catch (error) {
      this.bypassedAutoSwitchFilePaths.delete(file.path);
      console.error('Failed to open budget source note:', error);
      new Notice(`Failed to open source note for ${file.basename}.`, 4000);
    }
  }

  private async createNextMonthBudgetFromFile(sourceFile: TFile) {
    if (this.nextMonthCreationInFlight.has(sourceFile.path)) {
      return;
    }

    this.nextMonthCreationInFlight.add(sourceFile.path);
    try {
      const sourceBudget = await this.resolveLatestBudgetSnapshotForFile(sourceFile);
      if (!sourceBudget) {
        new Notice(`Cannot create next month from ${sourceFile.basename}.`, 5000);
        return;
      }

      const { targetMonth, targetPath } = this.budgetFileService.resolveNextMonthTarget(
        sourceFile,
        sourceBudget.month
      );
      const existingTarget = this.budgetFileService.findFileByPath(targetPath);
      if (existingTarget) {
        await this.openDashboardForFile(existingTarget);
        new Notice(`Opened existing next-month budget: ${existingTarget.path}`, 5000);
        return;
      }

      const nextBudget = cloneBudgetDataForMonth(sourceBudget, targetMonth);
      const serialized = serializeBudgetMarkdown(nextBudget);
      const createdFile = await this.budgetFileService.createBudgetFileAtPath(targetPath, serialized);
      await this.openDashboardForFile(createdFile);
      new Notice(`Created next-month budget: ${createdFile.path}`, 5000);
    } catch (error) {
      console.error('Failed to create next month budget:', error);
      new Notice(`Failed to create next month budget from ${sourceFile.basename}.`, 5000);
    } finally {
      this.nextMonthCreationInFlight.delete(sourceFile.path);
    }
  }

  private canCreateNextMonthFromFile(file: TFile): boolean {
    if (!file.path) {
      return false;
    }

    if (this.nextMonthCreationInFlight.has(file.path)) {
      return false;
    }

    return this.nextMonthEligibleFilePaths.has(file.path);
  }

  private setNextMonthEligibility(filePath: string, isEligible: boolean): void {
    if (isEligible) {
      this.nextMonthEligibleFilePaths.add(filePath);
      return;
    }

    this.nextMonthEligibleFilePaths.delete(filePath);
  }

  private async resolveLatestBudgetSnapshotForFile(file: TFile): Promise<BudgetData | null> {
    const sourceContent = await this.app.vault.cachedRead(file);
    const parsed = parseBudgetMarkdown(sourceContent);
    if (parsed && parsed.type === 'budget') {
      return this.budgetPersistence.getLatestData(file.path, parsed, sourceContent);
    }

    return this.budgetPersistence.getLatestDataFromConflict(file.path, sourceContent);
  }

  private async isBudgetMarkdownFile(file: TFile): Promise<boolean> {
    const content = await this.app.vault.cachedRead(file);
    const parsed = parseBudgetMarkdown(content);
    return !!parsed && parsed.type === 'budget';
  }

  private async openBudgetFile() {
    const budgetFile = await this.budgetFileService.findMostRelevantBudgetFile();
    if (budgetFile) {
      await this.openDashboardForFile(budgetFile);
      return;
    }

    await this.createNewBudget();
  }

  private async createNewBudget() {
    const file = await this.budgetFileService.createNewBudgetFile({
      defaultIncome: this.settings.defaultIncome,
      defaultCategories: this.settings.defaultCategories
    });

    await this.openDashboardForFile(file);
  }

  private async savePluginData() {
    await this.saveData({
      settings: this.settings,
      conflictsByFilePath: this.persistedConflictsByFilePath
    });
  }

  private normalizeStoredPluginData(rawData: unknown): StoredPluginData {
    const empty: StoredPluginData = {
      settings: {},
      conflictsByFilePath: {}
    };

    if (!isRecord(rawData)) {
      return empty;
    }

    const hasEnvelopeShape = Object.prototype.hasOwnProperty.call(rawData, 'settings')
      || Object.prototype.hasOwnProperty.call(rawData, 'conflictsByFilePath');

    if (!hasEnvelopeShape) {
      return {
        settings: rawData as Partial<BudgetFlowSettings>,
        conflictsByFilePath: {}
      };
    }

    return {
      settings: isRecord(rawData.settings)
        ? rawData.settings as Partial<BudgetFlowSettings>
        : {},
      conflictsByFilePath: normalizeConflictsByPath(rawData.conflictsByFilePath)
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isBudgetWriteConflict(value: unknown): value is BudgetWriteConflict {
  if (!isRecord(value)) {
    return false;
  }

  return value.reason === 'external-content-diverged'
    && typeof value.remoteContentParsable === 'boolean'
    && value.localEditsPreserved === true
    && typeof value.pendingLocalSerialized === 'string'
    && typeof value.remoteContentAtConflict === 'string'
    && typeof value.latestRemoteContent === 'string'
    && typeof value.baseContentAtConflict === 'string'
    && typeof value.detectedAt === 'number';
}

function normalizeConflictsByPath(value: unknown): PersistedBudgetConflictsByPath {
  if (!isRecord(value)) {
    return {};
  }

  const next: PersistedBudgetConflictsByPath = {};
  for (const [filePath, conflictValue] of Object.entries(value)) {
    if (isBudgetWriteConflict(conflictValue)) {
      next[filePath] = { ...conflictValue };
    }
  }
  return next;
}

const YEAR_MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const YEAR_MONTH_DAY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

interface YearMonthToken {
  year: number;
  month: number;
}

interface IsoDateToken extends YearMonthToken {
  day: number;
}

function parseYearMonthToken(value: string): YearMonthToken | null {
  const match = value.trim().match(YEAR_MONTH_PATTERN);
  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2])
  };
}

function parseIsoDateToken(value: string): IsoDateToken | null {
  const match = value.trim().match(YEAR_MONTH_DAY_PATTERN);
  if (!match) {
    return null;
  }

  const token: IsoDateToken = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
  const date = new Date(token.year, token.month - 1, token.day);
  if (
    date.getFullYear() !== token.year
    || date.getMonth() !== token.month - 1
    || date.getDate() !== token.day
  ) {
    return null;
  }

  return token;
}

function formatIsoDate(token: IsoDateToken): string {
  return `${token.year}-${String(token.month).padStart(2, '0')}-${String(token.day).padStart(2, '0')}`;
}

function shiftPaycheckDateToMonth(paycheckDate: string | undefined, month: string): string | undefined {
  if (!paycheckDate) {
    return undefined;
  }

  const dateToken = parseIsoDateToken(paycheckDate);
  const monthToken = parseYearMonthToken(month);
  if (!dateToken || !monthToken) {
    return undefined;
  }

  const daysInTargetMonth = new Date(monthToken.year, monthToken.month, 0).getDate();
  const day = Math.min(dateToken.day, daysInTargetMonth);
  return formatIsoDate({
    year: monthToken.year,
    month: monthToken.month,
    day
  });
}

function cloneBudgetDataForMonth(source: BudgetData, month: string): BudgetData {
  return {
    ...source,
    month,
    paycheckDate: shiftPaycheckDateToMonth(source.paycheckDate, month),
    compensation: source.compensation
      ? {
        version: source.compensation.version,
        gross: source.compensation.gross,
        taxPercentBps: source.compensation.taxPercentBps,
        retirementPercentBps: source.compensation.retirementPercentBps
      }
      : undefined,
    categories: source.categories.map((category) => ({
      ...category,
      items: category.items.map((item) => ({ ...item }))
    })),
    tagColors: source.tagColors
      ? { ...source.tagColors }
      : undefined,
    chart: source.chart
      ? { ...source.chart }
      : undefined,
    layout: source.layout
      ? { ...source.layout }
      : undefined,
    _frontmatterPassthrough: source._frontmatterPassthrough
      ? {
        topLevel: source._frontmatterPassthrough.topLevel
          ? { ...source._frontmatterPassthrough.topLevel }
          : undefined,
        tagColors: source._frontmatterPassthrough.tagColors
          ? { ...source._frontmatterPassthrough.tagColors }
          : undefined,
        chart: source._frontmatterPassthrough.chart
          ? { ...source._frontmatterPassthrough.chart }
          : undefined,
        layout: source._frontmatterPassthrough.layout
          ? { ...source._frontmatterPassthrough.layout }
          : undefined,
        compensation: source._frontmatterPassthrough.compensation
          ? {
            topLevel: source._frontmatterPassthrough.compensation.topLevel
              ? { ...source._frontmatterPassthrough.compensation.topLevel }
              : undefined
          }
          : undefined
      }
      : undefined
  };
}
