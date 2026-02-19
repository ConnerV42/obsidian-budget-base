import type { App, TFile } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { BudgetFileService } from './budgetFileService';

function makeFile(path: string, mtime: number): TFile {
  const name = path.split('/').pop() || path;
  const basename = name.replace(/\.md$/i, '');
  return {
    name,
    path,
    basename,
    extension: 'md',
    stat: { mtime }
  } as unknown as TFile;
}

function createApp(
  initialFiles: TFile[],
  createImpl?: (path: string, content: string) => Promise<TFile>
): App {
  const filesByPath = new Map<string, TFile>(initialFiles.map((file) => [file.path, file]));

  const create = createImpl || (async (path: string) => {
    const next = makeFile(path, Date.now());
    filesByPath.set(next.path, next);
    return next;
  });

  return {
    vault: {
      getMarkdownFiles: () => Array.from(filesByPath.values()),
      getAbstractFileByPath: (filePath: string) => filesByPath.get(filePath) || null,
      create: async (path: string, content: string) => {
        const created = await create(path, content);
        filesByPath.set(created.path, created);
        return created;
      }
    },
    workspace: {
      openLinkText: vi.fn()
    }
  } as unknown as App;
}

describe('budget file service', () => {
  it('prefers current month budget candidates before recency fallback', async () => {
    const files = [
      makeFile('2026-03-budget.md', 400),
      makeFile('2026-02-budget.md', 100),
      makeFile('2026-01-budget.md', 300)
    ];

    const app = createApp(files);
    const service = new BudgetFileService(
      app,
      async (_file) => true,
      () => new Date('2026-02-15T12:00:00Z')
    );

    const selected = await service.findMostRelevantBudgetFile();

    expect(selected?.path).toBe('2026-02-budget.md');
  });

  it('falls back to newest parseable non-current candidate', async () => {
    const files = [
      makeFile('2026-02-budget.md', 100),
      makeFile('2026-03-budget.md', 400),
      makeFile('2026-01-budget.md', 300)
    ];

    const checkedInOrder: string[] = [];
    const app = createApp(files);
    const service = new BudgetFileService(
      app,
      async (file) => {
        checkedInOrder.push(file.path);
        return file.path === '2026-03-budget.md';
      },
      () => new Date('2026-02-15T12:00:00Z')
    );

    const selected = await service.findMostRelevantBudgetFile();

    expect(selected?.path).toBe('2026-03-budget.md');
    expect(checkedInOrder).toEqual([
      '2026-02-budget.md',
      '2026-03-budget.md'
    ]);
  });

  it('returns null when no candidate is parseable as budget markdown', async () => {
    const files = [
      makeFile('2026-02-budget.md', 100),
      makeFile('2026-03-budget.md', 400)
    ];

    const app = createApp(files);
    const service = new BudgetFileService(
      app,
      async () => false,
      () => new Date('2026-02-15T12:00:00Z')
    );

    await expect(service.findMostRelevantBudgetFile()).resolves.toBeNull();
  });

  it('creates a month-scoped budget template without opening a markdown leaf', async () => {
    const createSpy = vi.fn(async (path: string, _content: string) => ({
      ...makeFile(path, 1),
      path,
      name: path,
      basename: path.replace(/\.md$/i, '')
    } as unknown as TFile));

    const app = createApp([], createSpy);
    const openLinkTextSpy = vi.spyOn(app.workspace, 'openLinkText');

    const service = new BudgetFileService(
      app,
      async () => true,
      () => new Date('2026-02-15T12:00:00Z')
    );

    const file = await service.createNewBudgetFile({
      defaultIncome: 8366,
      defaultCategories: ['Savings', 'Investments', 'Discretionary']
    });

    expect(file.path).toBe('2026-02-budget.md');
    expect(createSpy).toHaveBeenCalledTimes(1);

    const [createdPath, createdContent] = createSpy.mock.calls[0];
    expect(createdPath).toBe('2026-02-budget.md');
    expect(createdContent).toContain('type: budget');
    expect(createdContent).toContain('month: 2026-02');
    expect(createdContent).toContain('income: 8366');
    expect(createdContent).toContain('compensation:');
    expect(createdContent).toContain('gross: 8366');
    expect(createdContent).toContain('taxPercentBps: 0');
    expect(createdContent).toContain('retirementPercentBps: 0');
    expect(createdContent).toContain('## Savings');
    expect(createdContent).toContain('- [vault] Item: 0');

    expect(openLinkTextSpy).not.toHaveBeenCalled();
  });

  it('resolves next month target in the same source folder', () => {
    const app = createApp([]);
    const service = new BudgetFileService(
      app,
      async () => true,
      () => new Date('2026-02-15T12:00:00Z')
    );

    const sourceFile = makeFile('finance/2026-02-budget.md', 1);
    const result = service.resolveNextMonthTarget(sourceFile, '2026-02');

    expect(result).toEqual({
      targetMonth: '2026-03',
      targetPath: 'finance/2026-03-budget.md'
    });
  });

  it('handles year rollover when deriving next month', () => {
    const app = createApp([]);
    const service = new BudgetFileService(
      app,
      async () => true,
      () => new Date('2026-12-15T12:00:00Z')
    );

    const sourceFile = makeFile('finance/2026-12-budget.md', 1);
    const result = service.resolveNextMonthTarget(sourceFile, '2026-12');

    expect(result).toEqual({
      targetMonth: '2027-01',
      targetPath: 'finance/2027-01-budget.md'
    });
  });

  it('falls back to filename month when frontmatter month is invalid', () => {
    const app = createApp([]);
    const service = new BudgetFileService(
      app,
      async () => true,
      () => new Date('2026-07-10T12:00:00Z')
    );

    const sourceFile = makeFile('finance/2026-02-budget.md', 1);
    const result = service.resolveNextMonthTarget(sourceFile, 'not-a-month');

    expect(result).toEqual({
      targetMonth: '2026-03',
      targetPath: 'finance/2026-03-budget.md'
    });
  });

  it('falls back to current date + one month when month cannot be parsed', () => {
    const app = createApp([]);
    const service = new BudgetFileService(
      app,
      async () => true,
      () => new Date('2026-02-10T12:00:00Z')
    );

    const sourceFile = makeFile('finance/budget.md', 1);
    const result = service.resolveNextMonthTarget(sourceFile, 'invalid-month');

    expect(result).toEqual({
      targetMonth: '2026-03',
      targetPath: 'finance/2026-03-budget.md'
    });
  });

  it('finds existing file by path and returns null when missing', () => {
    const existing = makeFile('finance/2026-03-budget.md', 100);
    const app = createApp([existing]);
    const service = new BudgetFileService(
      app,
      async () => true,
      () => new Date('2026-02-10T12:00:00Z')
    );

    expect(service.findFileByPath('finance/2026-03-budget.md')?.path).toBe('finance/2026-03-budget.md');
    expect(service.findFileByPath('finance/2026-04-budget.md')).toBeNull();
  });
});
