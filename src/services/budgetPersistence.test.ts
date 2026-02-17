import type { TFile } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import type { BudgetData } from '../parser';
import { BudgetPersistenceService, shouldAbortWriteForExternalChange } from './budgetPersistence';

function makeBudget(income: number): BudgetData {
  return {
    type: 'budget',
    month: '2026-02',
    income,
    categories: [
      {
        name: 'Items',
        items: [{ tag: 'bill', name: 'Rent', amount: 1800 }]
      }
    ]
  };
}

function serializeBudget(data: BudgetData): string {
  return JSON.stringify(data);
}

function parseBudget(content: string): BudgetData | null {
  try {
    const parsed = JSON.parse(content) as BudgetData;
    return parsed && parsed.type === 'budget'
      ? parsed
      : null;
  } catch {
    return null;
  }
}

async function flushAsyncWork() {
  await Promise.resolve();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('budget persistence conflict checks', () => {
  it('does not abort when file still matches local base', () => {
    expect(
      shouldAbortWriteForExternalChange('base', 'base', 'next')
    ).toBe(false);
  });

  it('does not abort when file already equals next serialized content', () => {
    expect(
      shouldAbortWriteForExternalChange('base', 'next', 'next')
    ).toBe(false);
  });

  it('aborts when external content diverged from both base and next', () => {
    expect(
      shouldAbortWriteForExternalChange('base', 'remote-newer', 'next')
    ).toBe(true);
  });
});

describe('budget persistence state transitions', () => {
  const file = { path: '2026-02-budget.md', basename: '2026-02-budget' } as unknown as TFile;
  const connectedContainer = { isConnected: true } as HTMLElement;

  it('preserves local pending edits when source content changes during in-flight write', async () => {
    const initial = makeBudget(5000);
    const remoteNewer = makeBudget(9000);
    const localPendingIncome = 5200;
    let fileContent = serializeBudget(initial);

    let releaseFirstWrite: (() => void) | null = null;
    const writeFile = vi.fn(async (_file: TFile, nextContent: string) => {
      await new Promise<void>((resolve) => {
        releaseFirstWrite = resolve;
      });
      fileContent = nextContent;
    });

    const service = new BudgetPersistenceService({
      readFile: async () => fileContent,
      writeFile,
      getFileByPath: () => file,
      parseBudget,
      serializeBudget,
      renderSnapshot: () => {}
    });

    service.getLatestData(file.path, initial, fileContent);
    await service.updateBudgetFile(file, (prev) => ({ ...prev, income: localPendingIncome }), connectedContainer);

    await vi.waitFor(() => expect(writeFile).toHaveBeenCalledTimes(1));
    fileContent = serializeBudget(remoteNewer);

    const latest = service.getLatestData(file.path, remoteNewer, fileContent);
    expect(latest.income).toBe(localPendingIncome);

    if (!releaseFirstWrite) {
      throw new Error('Expected in-flight write gate to be initialized.');
    }
    releaseFirstWrite();
    await flushAsyncWork();
  });

  it('keeps local pending edits and latches conflict when remote content cannot be parsed', async () => {
    const initial = makeBudget(5000);
    let fileContent = serializeBudget(initial);
    const conflicts: boolean[] = [];
    const writeFile = vi.fn(async () => {});

    const service = new BudgetPersistenceService({
      readFile: async () => fileContent,
      writeFile,
      getFileByPath: () => file,
      parseBudget,
      serializeBudget,
      renderSnapshot: () => {},
      onConflict: (_file, conflict) => {
        conflicts.push(conflict.remoteContentParsable);
      }
    });

    service.getLatestData(file.path, initial, fileContent);
    fileContent = '---\ninvalid: [\n---';

    await service.updateBudgetFile(file, (prev) => ({ ...prev, income: 5300 }), connectedContainer);
    await flushAsyncWork();

    expect(writeFile).toHaveBeenCalledTimes(0);
    expect(conflicts).toEqual([false]);

    await service.updateBudgetFile(file, (prev) => ({ ...prev, income: 5400 }), connectedContainer);
    await flushAsyncWork();

    expect(writeFile).toHaveBeenCalledTimes(0);
    expect(conflicts).toHaveLength(1);

    const latest = service.getLatestData(file.path, initial, fileContent);
    expect(latest.income).toBe(5400);
  });

  it('never retries into stale overwrite after remote divergent content is detected', async () => {
    const initial = makeBudget(5000);
    const remoteNewer = makeBudget(9100);
    let fileContent = serializeBudget(initial);
    const writeFile = vi.fn(async (_file: TFile, nextContent: string) => {
      fileContent = nextContent;
    });
    const conflictReasons: string[] = [];

    const service = new BudgetPersistenceService({
      readFile: async () => fileContent,
      writeFile,
      getFileByPath: () => file,
      parseBudget,
      serializeBudget,
      renderSnapshot: () => {},
      onConflict: (_file, conflict) => {
        conflictReasons.push(conflict.reason);
      }
    });

    service.getLatestData(file.path, initial, fileContent);
    fileContent = serializeBudget(remoteNewer);

    await service.updateBudgetFile(file, (prev) => ({ ...prev, income: 5200 }), connectedContainer);
    await flushAsyncWork();

    await service.updateBudgetFile(file, (prev) => ({ ...prev, income: 5300 }), connectedContainer);
    await flushAsyncWork();

    expect(writeFile).toHaveBeenCalledTimes(0);
    expect(conflictReasons).toEqual(['external-content-diverged']);
    expect(parseBudget(fileContent)?.income).toBe(remoteNewer.income);

    const latest = service.getLatestData(file.path, remoteNewer, fileContent);
    expect(latest.income).toBe(5300);
  });
});
