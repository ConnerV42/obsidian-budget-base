import type { TFile } from 'obsidian';
import { BudgetData } from '../parser';
import { LatestWriteQueue, StateUpdate } from '../writeQueue';

type BudgetDataUpdate = StateUpdate<BudgetData>;
export type ConflictResolutionStrategy = 'use-remote' | 'retry-local' | 'keep-paused';

export interface BudgetWriteConflict {
  reason: 'external-content-diverged';
  remoteContentParsable: boolean;
  localEditsPreserved: true;
  pendingLocalSerialized: string;
  remoteContentAtConflict: string;
  latestRemoteContent: string;
  baseContentAtConflict: string;
  detectedAt: number;
}

export interface BudgetConflictState extends BudgetWriteConflict {
  filePath: string;
}

export type PersistedBudgetConflictsByPath = Record<string, BudgetWriteConflict>;

interface FileSyncState {
  queue: LatestWriteQueue<BudgetData>;
  flushInProgress: boolean;
  baseContent: string;
  conflict: BudgetWriteConflict | null;
}

interface BudgetPersistenceOptions {
  readFile: (file: TFile) => Promise<string>;
  writeFile: (file: TFile, content: string) => Promise<void>;
  getFileByPath: (filePath: string) => Promise<TFile | null> | TFile | null;
  parseBudget: (content: string) => BudgetData | null;
  serializeBudget: (data: BudgetData) => string;
  onSnapshotChange?: (filePath: string) => void;
  initialPersistedConflictsByPath?: PersistedBudgetConflictsByPath;
  onPersistedConflictsChange?: (conflictsByPath: PersistedBudgetConflictsByPath) => void;
  onConflict?: (file: TFile, conflict: BudgetWriteConflict) => void;
}

export function shouldAbortWriteForExternalChange(
  baseContent: string,
  currentContent: string,
  nextSerialized: string
): boolean {
  return currentContent !== baseContent && currentContent !== nextSerialized;
}

export class BudgetPersistenceService {
  private fileSyncStates: Map<string, FileSyncState> = new Map();
  private persistedConflictsByPath: PersistedBudgetConflictsByPath;

  constructor(private options: BudgetPersistenceOptions) {
    this.persistedConflictsByPath = clonePersistedConflicts(
      options.initialPersistedConflictsByPath || {}
    );
  }

  getLatestData(filePath: string, sourceData: BudgetData, sourceContent: string): BudgetData {
    const state = this.getOrCreateFileState(filePath, sourceData, sourceContent);
    if (state.conflict) {
      this.syncConflictWithSource(filePath, state, sourceContent);
    }
    return state.queue.hasPendingWork || state.conflict
      ? state.queue.current
      : sourceData;
  }

  getLatestDataFromConflict(filePath: string, sourceContent: string): BudgetData | null {
    const state = this.getOrHydrateConflictState(filePath);
    if (!state || !state.conflict) {
      return null;
    }
    this.syncConflictWithSource(filePath, state, sourceContent);
    return state.queue.current;
  }

  getConflictState(filePath: string): BudgetConflictState | null {
    const state = this.fileSyncStates.get(filePath) ?? this.getOrHydrateConflictState(filePath);
    if (!state || !state.conflict) {
      return null;
    }
    return {
      filePath,
      ...cloneConflict(state.conflict)
    };
  }

  async updateBudgetFile(file: TFile, update: BudgetDataUpdate) {
    let state = this.fileSyncStates.get(file.path);
    if (!state) {
      const content = await this.options.readFile(file);
      const parsed = this.options.parseBudget(content);
      if (!parsed || parsed.type !== 'budget') {
        return;
      }
      state = this.getOrCreateFileState(file.path, parsed, content);
    }

    const latestData = state.queue.apply(update);

    if (state.conflict) {
      this.syncConflictPendingLocalSnapshot(file.path, state, latestData);
    }

    this.emitSnapshotChange(file.path);
    void this.flushBudgetFileWrites(file, state);
  }

  async resolveConflict(filePath: string, strategy: ConflictResolutionStrategy): Promise<void> {
    const state = this.fileSyncStates.get(filePath) ?? this.getOrHydrateConflictState(filePath);
    if (!state || !state.conflict || strategy === 'keep-paused') {
      return;
    }

    const file = await this.options.getFileByPath(filePath);
    if (!file) {
      return;
    }

    const localSerialized = this.safeSerializeCurrentSnapshot(state);
    if (!localSerialized) {
      return;
    }

    if (strategy === 'use-remote') {
      await this.resolveUsingRemote(filePath, file, state, localSerialized);
      return;
    }

    await this.resolveByRetryingLocal(filePath, file, state, localSerialized);
  }

  clearState(filePath: string) {
    this.fileSyncStates.delete(filePath);
  }

  dispose() {
    this.fileSyncStates.clear();
  }

  private getOrCreateFileState(
    filePath: string,
    initialData: BudgetData,
    sourceContent: string
  ): FileSyncState {
    const existing = this.fileSyncStates.get(filePath) ?? this.getOrHydrateConflictState(filePath);
    if (existing) {
      this.reconcileExistingFileState(filePath, existing, initialData, sourceContent);
      return existing;
    }

    const state: FileSyncState = {
      queue: new LatestWriteQueue(initialData),
      flushInProgress: false,
      baseContent: sourceContent,
      conflict: null
    };
    this.fileSyncStates.set(filePath, state);
    return state;
  }

  private reconcileExistingFileState(
    filePath: string,
    state: FileSyncState,
    sourceData: BudgetData,
    sourceContent: string
  ) {
    // Never rebase queue state while a write is active.
    if (state.flushInProgress) {
      return;
    }

    const sourceMatchesLocalSnapshot = this.doesSourceMatchLocalSnapshot(state, sourceContent);

    if (state.conflict) {
      this.syncConflictWithSource(filePath, state, sourceContent);
      return;
    }

    if (state.queue.hasPendingWork) {
      // Keep unsaved local edits as the source of truth while pending.
      if (sourceMatchesLocalSnapshot) {
        state.queue = new LatestWriteQueue(sourceData);
        state.baseContent = sourceContent;
      }
      return;
    }

    state.queue.syncFromSource(sourceData);
    state.baseContent = sourceContent;
  }

  private doesSourceMatchLocalSnapshot(state: FileSyncState, sourceContent: string): boolean {
    try {
      return this.options.serializeBudget(state.queue.current) === sourceContent;
    } catch {
      return false;
    }
  }

  private async flushBudgetFileWrites(file: TFile, state: FileSyncState) {
    if (state.flushInProgress || state.conflict) return;

    state.flushInProgress = true;
    const success = await state.queue.flush(
      async (snapshot) => {
        const nextSerialized = this.options.serializeBudget(snapshot);
        const currentContent = await this.options.readFile(file);

        if (shouldAbortWriteForExternalChange(state.baseContent, currentContent, nextSerialized)) {
          this.latchConflict(file.path, file, state, currentContent, nextSerialized, state.baseContent);
          throw new Error('Budget write aborted due to external file change');
        }

        await this.options.writeFile(file, nextSerialized);
        state.baseContent = nextSerialized;
        state.conflict = null;
      },
      () => {
        this.emitSnapshotChange(file.path);
      }
    );

    if (!success && !state.conflict) {
      console.error('Failed to write budget file:', file.path);
    }

    state.flushInProgress = false;
    if (state.queue.hasPendingWork && !state.conflict) {
      void this.flushBudgetFileWrites(file, state);
    }
  }

  private getOrHydrateConflictState(filePath: string): FileSyncState | null {
    const existing = this.fileSyncStates.get(filePath);
    if (existing) {
      return existing;
    }

    const persisted = this.persistedConflictsByPath[filePath];
    if (!persisted) {
      return null;
    }

    const parsedPending = this.options.parseBudget(persisted.pendingLocalSerialized);
    if (!parsedPending || parsedPending.type !== 'budget') {
      this.clearPersistedConflict(filePath);
      return null;
    }

    const hydrated: FileSyncState = {
      queue: new LatestWriteQueue(parsedPending),
      flushInProgress: false,
      baseContent: persisted.baseContentAtConflict,
      conflict: cloneConflict(persisted)
    };
    this.fileSyncStates.set(filePath, hydrated);
    return hydrated;
  }

  private syncConflictPendingLocalSnapshot(
    filePath: string,
    state: FileSyncState,
    latestData: BudgetData
  ) {
    if (!state.conflict) return;

    let pendingLocalSerialized: string;
    try {
      pendingLocalSerialized = this.options.serializeBudget(latestData);
    } catch {
      return;
    }

    if (state.conflict.pendingLocalSerialized === pendingLocalSerialized) {
      return;
    }

    state.conflict = {
      ...state.conflict,
      pendingLocalSerialized
    };
    this.persistConflict(filePath, state.conflict);
    this.emitSnapshotChange(filePath);
  }

  private syncConflictWithSource(filePath: string, state: FileSyncState, sourceContent: string) {
    if (!state.conflict) return;

    const parsedRemote = this.options.parseBudget(sourceContent);
    const remoteContentParsable = Boolean(parsedRemote && parsedRemote.type === 'budget');
    if (
      state.conflict.latestRemoteContent === sourceContent
      && state.conflict.remoteContentParsable === remoteContentParsable
    ) {
      return;
    }

    state.conflict = {
      ...state.conflict,
      latestRemoteContent: sourceContent,
      remoteContentParsable
    };
    this.persistConflict(filePath, state.conflict);
    this.emitSnapshotChange(filePath);
  }

  private safeSerializeCurrentSnapshot(state: FileSyncState): string | null {
    try {
      return this.options.serializeBudget(state.queue.current);
    } catch {
      return null;
    }
  }

  private async resolveUsingRemote(
    filePath: string,
    file: TFile,
    state: FileSyncState,
    localSerialized: string
  ): Promise<void> {
    const currentContent = await this.options.readFile(file);
    const parsedRemote = this.options.parseBudget(currentContent);

    if (!parsedRemote || parsedRemote.type !== 'budget') {
      this.latchConflict(
        filePath,
        file,
        state,
        currentContent,
        localSerialized,
        state.baseContent
      );
      return;
    }

    state.queue = new LatestWriteQueue(parsedRemote);
    state.baseContent = currentContent;
    state.conflict = null;
    this.clearPersistedConflict(filePath);
    this.emitSnapshotChange(filePath);
  }

  private async resolveByRetryingLocal(
    filePath: string,
    file: TFile,
    state: FileSyncState,
    localSerialized: string
  ): Promise<void> {
    if (!state.conflict) {
      return;
    }

    const currentContent = await this.options.readFile(file);
    if (currentContent !== state.conflict.remoteContentAtConflict) {
      this.latchConflict(
        filePath,
        file,
        state,
        currentContent,
        localSerialized,
        state.baseContent
      );
      return;
    }

    await this.options.writeFile(file, localSerialized);
    const parsedLocal = this.options.parseBudget(localSerialized);
    if (parsedLocal && parsedLocal.type === 'budget') {
      state.queue = new LatestWriteQueue(parsedLocal);
    }
    state.baseContent = localSerialized;
    state.conflict = null;
    this.clearPersistedConflict(filePath);
    this.emitSnapshotChange(filePath);
  }

  private latchConflict(
    filePath: string,
    file: TFile,
    state: FileSyncState,
    remoteContent: string,
    pendingLocalSerialized: string,
    baseContentAtConflict: string
  ) {
    const parsedRemote = this.options.parseBudget(remoteContent);
    const conflict: BudgetWriteConflict = {
      reason: 'external-content-diverged',
      remoteContentParsable: Boolean(parsedRemote && parsedRemote.type === 'budget'),
      localEditsPreserved: true,
      pendingLocalSerialized,
      remoteContentAtConflict: remoteContent,
      latestRemoteContent: remoteContent,
      baseContentAtConflict,
      detectedAt: Date.now()
    };

    state.conflict = conflict;
    this.persistConflict(filePath, conflict);
    if (this.options.onConflict) {
      this.options.onConflict(file, cloneConflict(conflict));
    }
    this.emitSnapshotChange(filePath);
  }

  private persistConflict(filePath: string, conflict: BudgetWriteConflict) {
    this.persistedConflictsByPath[filePath] = cloneConflict(conflict);
    this.emitPersistedConflictsChange();
  }

  private clearPersistedConflict(filePath: string) {
    if (!this.persistedConflictsByPath[filePath]) {
      return;
    }
    delete this.persistedConflictsByPath[filePath];
    this.emitPersistedConflictsChange();
  }

  private emitPersistedConflictsChange() {
    if (!this.options.onPersistedConflictsChange) {
      return;
    }
    this.options.onPersistedConflictsChange(clonePersistedConflicts(this.persistedConflictsByPath));
  }

  private emitSnapshotChange(filePath: string) {
    if (!this.options.onSnapshotChange) {
      return;
    }
    this.options.onSnapshotChange(filePath);
  }
}

function cloneConflict(conflict: BudgetWriteConflict): BudgetWriteConflict {
  return { ...conflict };
}

function clonePersistedConflicts(
  conflicts: PersistedBudgetConflictsByPath
): PersistedBudgetConflictsByPath {
  const next: PersistedBudgetConflictsByPath = {};
  for (const [filePath, conflict] of Object.entries(conflicts)) {
    next[filePath] = cloneConflict(conflict);
  }
  return next;
}
