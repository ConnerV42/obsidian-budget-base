import type { WorkspaceLeaf } from 'obsidian';
import { describe, expect, it } from 'vitest';
import {
  consumeAutoSwitchBypass,
  isLeafOfViewType,
  selectReusableDashboardLeaf
} from './dashboardLeafRouting';

function makeLeaf(viewType: string): WorkspaceLeaf {
  return {
    view: {
      getViewType: () => viewType
    }
  } as unknown as WorkspaceLeaf;
}

describe('dashboard leaf routing', () => {
  it('matches leaves by view type', () => {
    expect(isLeafOfViewType(makeLeaf('budgetbase-dashboard'), 'budgetbase-dashboard')).toBe(true);
    expect(isLeafOfViewType(makeLeaf('markdown'), 'budgetbase-dashboard')).toBe(false);
    expect(isLeafOfViewType(null, 'budgetbase-dashboard')).toBe(false);
    expect(isLeafOfViewType({} as WorkspaceLeaf, 'budgetbase-dashboard')).toBe(false);
  });

  it('reuses the first existing dashboard leaf', () => {
    const first = makeLeaf('budgetbase-dashboard');
    const second = makeLeaf('budgetbase-dashboard');

    expect(selectReusableDashboardLeaf([first, second])).toBe(first);
    expect(selectReusableDashboardLeaf([])).toBeNull();
  });

  it('consumes auto-switch bypasses once', () => {
    const bypassedPaths = new Set(['2026-02-budget.md']);

    expect(consumeAutoSwitchBypass(bypassedPaths, '2026-02-budget.md')).toBe(true);
    expect(bypassedPaths.has('2026-02-budget.md')).toBe(false);
    expect(consumeAutoSwitchBypass(bypassedPaths, '2026-02-budget.md')).toBe(false);
  });
});
