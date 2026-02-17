import type { TFile } from 'obsidian';
import { describe, expect, it } from 'vitest';
import type { BudgetData } from '../parser';
import { parseBudgetMarkdown, serializeBudgetMarkdown } from '../parser';
import {
  BudgetPersistenceService,
  PersistedBudgetConflictsByPath
} from './budgetPersistence';

const FILE_PATH = '2026-02-budget.md';
const file = {
  path: FILE_PATH,
  basename: '2026-02-budget'
} as unknown as TFile;
const connectedContainer = { isConnected: true } as HTMLElement;

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

async function flushAsyncWork() {
  await Promise.resolve();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

class FakeVault {
  private readonly files = new Map<string, string>();

  constructor(initialFiles: Record<string, string>) {
    for (const [path, content] of Object.entries(initialFiles)) {
      this.files.set(path, content);
    }
  }

  getFileByPath(filePath: string): TFile | null {
    if (!this.files.has(filePath)) {
      return null;
    }
    return {
      path: filePath,
      basename: filePath.replace(/\.md$/, '').split('/').pop() || filePath
    } as unknown as TFile;
  }

  async readFile(target: TFile): Promise<string> {
    const content = this.files.get(target.path);
    if (content === undefined) {
      throw new Error(`Missing file: ${target.path}`);
    }
    return content;
  }

  async writeFile(target: TFile, content: string): Promise<void> {
    if (!this.files.has(target.path)) {
      throw new Error(`Missing file: ${target.path}`);
    }
    this.files.set(target.path, content);
  }

  setContent(filePath: string, content: string) {
    if (!this.files.has(filePath)) {
      throw new Error(`Missing file: ${filePath}`);
    }
    this.files.set(filePath, content);
  }

  getContent(filePath: string): string {
    const content = this.files.get(filePath);
    if (content === undefined) {
      throw new Error(`Missing file: ${filePath}`);
    }
    return content;
  }
}

function requireBudget(content: string): BudgetData {
  const parsed = parseBudgetMarkdown(content);
  if (!parsed || parsed.type !== 'budget') {
    throw new Error('Expected parseable budget data.');
  }
  return parsed;
}

function createService(
  vault: FakeVault,
  persistedRef: { current: PersistedBudgetConflictsByPath }
): BudgetPersistenceService {
  return new BudgetPersistenceService({
    readFile: (target) => vault.readFile(target),
    writeFile: (target, content) => vault.writeFile(target, content),
    getFileByPath: (filePath) => vault.getFileByPath(filePath),
    parseBudget: (content) => parseBudgetMarkdown(content),
    serializeBudget: (data) => serializeBudgetMarkdown(data),
    renderSnapshot: () => {},
    initialPersistedConflictsByPath: persistedRef.current,
    onPersistedConflictsChange: (next) => {
      persistedRef.current = next;
    }
  });
}

async function triggerConflict(
  service: BudgetPersistenceService,
  vault: FakeVault,
  localIncome: number,
  remoteIncome: number
) {
  const initialContent = vault.getContent(FILE_PATH);
  const initialBudget = requireBudget(initialContent);
  service.getLatestData(FILE_PATH, initialBudget, initialContent);

  vault.setContent(FILE_PATH, serializeBudgetMarkdown(makeBudget(remoteIncome)));
  await service.updateBudgetFile(
    file,
    (prev) => ({ ...prev, income: localIncome }),
    connectedContainer
  );
  await flushAsyncWork();
}

describe('budget persistence integration conflict flows', () => {
  it('captures conflict when external divergence occurs while local write is pending', async () => {
    const initial = serializeBudgetMarkdown(makeBudget(5000));
    const vault = new FakeVault({ [FILE_PATH]: initial });
    const persistedRef = { current: {} as PersistedBudgetConflictsByPath };
    const service = createService(vault, persistedRef);

    await triggerConflict(service, vault, 5200, 9100);

    const conflictState = service.getConflictState(FILE_PATH);
    expect(conflictState).not.toBeNull();
    expect(parseBudgetMarkdown(conflictState!.pendingLocalSerialized)?.income).toBe(5200);
    expect(requireBudget(vault.getContent(FILE_PATH)).income).toBe(9100);
    expect(persistedRef.current[FILE_PATH]).toBeDefined();
  });

  it('restores persisted conflict state after service restart', async () => {
    const initial = serializeBudgetMarkdown(makeBudget(5000));
    const vault = new FakeVault({ [FILE_PATH]: initial });
    const persistedRef = { current: {} as PersistedBudgetConflictsByPath };
    const service = createService(vault, persistedRef);

    await triggerConflict(service, vault, 5300, 9000);

    const restartedService = createService(vault, persistedRef);
    const remoteContent = vault.getContent(FILE_PATH);
    const remoteData = requireBudget(remoteContent);
    const latest = restartedService.getLatestData(FILE_PATH, remoteData, remoteContent);

    expect(latest.income).toBe(5300);
    expect(restartedService.getConflictState(FILE_PATH)).not.toBeNull();
  });

  it('resolves conflict with use-remote strategy', async () => {
    const initial = serializeBudgetMarkdown(makeBudget(5000));
    const vault = new FakeVault({ [FILE_PATH]: initial });
    const persistedRef = { current: {} as PersistedBudgetConflictsByPath };
    const service = createService(vault, persistedRef);

    await triggerConflict(service, vault, 5400, 8900);
    await service.resolveConflict(FILE_PATH, 'use-remote');

    const currentContent = vault.getContent(FILE_PATH);
    const currentData = requireBudget(currentContent);
    const latest = service.getLatestData(FILE_PATH, currentData, currentContent);
    expect(latest.income).toBe(8900);
    expect(service.getConflictState(FILE_PATH)).toBeNull();
    expect(persistedRef.current[FILE_PATH]).toBeUndefined();
  });

  it('resolves conflict with retry-local strategy when remote is unchanged', async () => {
    const initial = serializeBudgetMarkdown(makeBudget(5000));
    const vault = new FakeVault({ [FILE_PATH]: initial });
    const persistedRef = { current: {} as PersistedBudgetConflictsByPath };
    const service = createService(vault, persistedRef);

    await triggerConflict(service, vault, 5500, 9200);
    await service.resolveConflict(FILE_PATH, 'retry-local');

    expect(requireBudget(vault.getContent(FILE_PATH)).income).toBe(5500);
    expect(service.getConflictState(FILE_PATH)).toBeNull();
    expect(persistedRef.current[FILE_PATH]).toBeUndefined();
  });

  it('prevents stale overwrite when retry-local is requested after remote changes again', async () => {
    const initial = serializeBudgetMarkdown(makeBudget(5000));
    const vault = new FakeVault({ [FILE_PATH]: initial });
    const persistedRef = { current: {} as PersistedBudgetConflictsByPath };
    const service = createService(vault, persistedRef);

    await triggerConflict(service, vault, 5600, 9300);
    const newerRemoteContent = serializeBudgetMarkdown(makeBudget(9700));
    vault.setContent(FILE_PATH, newerRemoteContent);

    await service.resolveConflict(FILE_PATH, 'retry-local');

    expect(vault.getContent(FILE_PATH)).toBe(newerRemoteContent);
    expect(requireBudget(vault.getContent(FILE_PATH)).income).toBe(9700);
    expect(service.getConflictState(FILE_PATH)).not.toBeNull();
  });
});
