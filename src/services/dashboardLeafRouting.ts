import type { WorkspaceLeaf } from 'obsidian';

interface ViewLike {
  getViewType?: () => string;
}

interface LeafLike {
  view?: ViewLike;
}

export function isLeafOfViewType(leaf: LeafLike | null | undefined, viewType: string): boolean {
  const getViewType = leaf?.view?.getViewType;
  if (typeof getViewType !== 'function') {
    return false;
  }
  return getViewType() === viewType;
}

export function selectReusableDashboardLeaf(
  leaves: WorkspaceLeaf[]
): WorkspaceLeaf | null {
  return leaves[0] || null;
}

export function consumeAutoSwitchBypass(
  bypassedFilePaths: Set<string>,
  filePath: string
): boolean {
  if (!bypassedFilePaths.has(filePath)) {
    return false;
  }

  bypassedFilePaths.delete(filePath);
  return true;
}
