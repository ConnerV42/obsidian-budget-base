import type { App, TFile } from 'obsidian';
import { getCurrentMonthBudgetName, orderBudgetFileCandidates } from '../budgetFileSelection';

export interface NewBudgetTemplateSettings {
  defaultIncome: number;
  defaultCategories: string[];
}

type IsBudgetMarkdownFile = (file: TFile) => Promise<boolean>;

interface YearMonthToken {
  year: number;
  month: number;
}

const YEAR_MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const YEAR_MONTH_FROM_FILENAME_PATTERN = /(\d{4})-(0[1-9]|1[0-2])/;

export class BudgetFileService {
  constructor(
    private app: App,
    private isBudgetMarkdownFile: IsBudgetMarkdownFile,
    private now: () => Date = () => new Date()
  ) {}

  async findMostRelevantBudgetFile(): Promise<TFile | null> {
    const files = this.app.vault.getMarkdownFiles();
    const currentMonthName = getCurrentMonthBudgetName(this.now());
    const candidates = orderBudgetFileCandidates(files, currentMonthName);

    for (const file of candidates) {
      if (await this.isBudgetMarkdownFile(file)) {
        return file;
      }
    }

    return null;
  }

  async createNewBudgetFile(settings: NewBudgetTemplateSettings): Promise<TFile> {
    const month = this.getCurrentMonth();
    const fileName = `${month}-budget.md`;
    const template = this.buildTemplate(month, settings);
    return this.app.vault.create(fileName, template);
  }

  resolveNextMonthTarget(
    sourceFile: TFile,
    sourceMonth: string | null | undefined
  ): { targetMonth: string; targetPath: string } {
    const sourceToken = this.resolveSourceMonthToken(sourceMonth, sourceFile.path);
    const targetToken = incrementYearMonthToken(sourceToken);
    const targetMonth = formatYearMonthToken(targetToken);
    const targetFileName = `${targetMonth}-budget.md`;
    return {
      targetMonth,
      targetPath: joinParentPath(sourceFile.path, targetFileName)
    };
  }

  findFileByPath(filePath: string): TFile | null {
    const abstractFile = this.app.vault.getAbstractFileByPath(filePath);
    return isFileLike(abstractFile) ? abstractFile : null;
  }

  async createBudgetFileAtPath(filePath: string, content: string): Promise<TFile> {
    return this.app.vault.create(filePath, content);
  }

  private getCurrentMonth(): string {
    const date = this.now();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private buildTemplate(month: string, settings: NewBudgetTemplateSettings): string {
    const defaultTags: Record<string, string> = {
      Savings: 'vault',
      Investments: 'roth',
      'Fixed Expenses': 'bill',
      Subscriptions: 'sub',
      Discretionary: 'flex'
    };

    let categoryContent = '';
    for (const category of settings.defaultCategories) {
      const tag = defaultTags[category] || 'item';
      categoryContent += `## ${category}\n`;
      categoryContent += `- [${tag}] Item: 0\n\n`;
    }

    return `---
type: budget
month: ${month}
income: ${settings.defaultIncome}
---

${categoryContent}`;
  }

  private resolveSourceMonthToken(
    sourceMonth: string | null | undefined,
    sourcePath: string
  ): YearMonthToken {
    const fromSourceMonth = parseYearMonthToken(sourceMonth || '');
    if (fromSourceMonth) {
      return fromSourceMonth;
    }

    const fileName = sourcePath.split('/').pop() || sourcePath;
    const fileNameMatch = fileName.match(YEAR_MONTH_FROM_FILENAME_PATTERN);
    if (fileNameMatch) {
      const fromFileName = parseYearMonthToken(`${fileNameMatch[1]}-${fileNameMatch[2]}`);
      if (fromFileName) {
        return fromFileName;
      }
    }

    const now = this.now();
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1
    };
  }
}

function parseYearMonthToken(value: string): YearMonthToken | null {
  const trimmed = value.trim();
  const match = trimmed.match(YEAR_MONTH_PATTERN);
  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2])
  };
}

function incrementYearMonthToken(token: YearMonthToken): YearMonthToken {
  if (token.month < 12) {
    return {
      year: token.year,
      month: token.month + 1
    };
  }

  return {
    year: token.year + 1,
    month: 1
  };
}

function formatYearMonthToken(token: YearMonthToken): string {
  return `${token.year}-${String(token.month).padStart(2, '0')}`;
}

function joinParentPath(sourcePath: string, targetFileName: string): string {
  const slashIndex = sourcePath.lastIndexOf('/');
  if (slashIndex === -1) {
    return targetFileName;
  }

  const parent = sourcePath.slice(0, slashIndex);
  return parent.length > 0
    ? `${parent}/${targetFileName}`
    : targetFileName;
}

function isFileLike(value: unknown): value is TFile {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const maybeFile = value as { path?: unknown; extension?: unknown };
  if (typeof maybeFile.path !== 'string') {
    return false;
  }

  if (typeof maybeFile.extension === 'string') {
    return true;
  }

  return maybeFile.path.toLowerCase().endsWith('.md');
}
