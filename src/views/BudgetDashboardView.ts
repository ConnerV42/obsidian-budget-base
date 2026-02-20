import { FileView } from 'obsidian';
import type { IconName, Menu, TFile, WorkspaceLeaf } from 'obsidian';
import type { ItemSortOption } from '../sorting';
import { addBudgetDashboardPaneMenuItems } from './budgetDashboardPaneMenu';

export const BUDGET_DASHBOARD_VIEW_TYPE = 'budgetbase-dashboard';

export interface BudgetDashboardRenderContext {
  container: HTMLElement;
  file: TFile;
  isCurrent: () => boolean;
}

export interface BudgetDashboardViewOptions {
  onRender: (context: BudgetDashboardRenderContext) => Promise<void>;
  onClear: (container: HTMLElement) => void;
  onOpenSourceNote: (file: TFile) => Promise<void> | void;
  canCreateNextMonth: (file: TFile) => boolean;
  onCreateNextMonth: (file: TFile) => Promise<void> | void;
  canSortItems: (file: TFile) => boolean;
  onSortItems: (file: TFile, sortBy: ItemSortOption) => Promise<void> | void;
}

export class BudgetDashboardView extends FileView {
  private renderTargetEl: HTMLElement | null = null;
  private renderVersion = 0;

  constructor(leaf: WorkspaceLeaf, private readonly options: BudgetDashboardViewOptions) {
    super(leaf);
  }

  getViewType(): string {
    return BUDGET_DASHBOARD_VIEW_TYPE;
  }

  getDisplayText(): string {
    if (this.file) {
      return `Budget: ${this.file.basename}`;
    }
    return 'Budget Dashboard';
  }

  getIcon(): IconName {
    return 'wallet';
  }

  protected async onOpen(): Promise<void> {
    this.contentEl.replaceChildren();
    this.contentEl.classList.add('budgetbase-dashboard-content');

    this.renderTargetEl = document.createElement('div');
    this.renderTargetEl.className = 'budgetbase-dashboard-root';
    this.contentEl.appendChild(this.renderTargetEl);

    if (this.file) {
      await this.renderForFile(this.file);
    }
  }

  protected async onClose(): Promise<void> {
    this.renderVersion += 1;
    this.clearRenderedContent();
    this.contentEl.classList.remove('budgetbase-dashboard-content');
    this.contentEl.replaceChildren();
    this.renderTargetEl = null;
  }

  async onLoadFile(file: TFile): Promise<void> {
    await this.renderForFile(file);
  }

  override onPaneMenu(menu: Menu, source: 'more-options' | 'tab-header' | string): void {
    super.onPaneMenu(menu, source);
    addBudgetDashboardPaneMenuItems(menu, this.file, this.options);
  }

  async onUnloadFile(_file: TFile): Promise<void> {
    this.clearRenderedContent();
  }

  async refreshCurrentFile(): Promise<void> {
    if (!this.file) {
      return;
    }
    await this.renderForFile(this.file);
  }

  private async renderForFile(file: TFile): Promise<void> {
    if (!this.renderTargetEl) {
      return;
    }

    const version = this.beginRenderCycle();

    await this.options.onRender({
      container: this.renderTargetEl,
      file,
      isCurrent: () => this.isRenderCycleCurrent(version, file.path)
    });
  }

  private beginRenderCycle(): number {
    this.renderVersion += 1;
    return this.renderVersion;
  }

  private isRenderCycleCurrent(version: number, filePath: string): boolean {
    return this.renderVersion === version
      && Boolean(this.renderTargetEl?.isConnected)
      && this.file?.path === filePath;
  }

  private clearRenderedContent() {
    if (!this.renderTargetEl) {
      return;
    }
    this.options.onClear(this.renderTargetEl);
  }
}

export function isBudgetDashboardView(value: unknown): value is BudgetDashboardView {
  return value instanceof BudgetDashboardView;
}
