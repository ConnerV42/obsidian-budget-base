import { describe, expect, it, vi } from 'vitest';
import {
  addBudgetDashboardPaneMenuItems,
  type BudgetDashboardPaneMenu,
  type BudgetDashboardPaneMenuFile,
  type BudgetDashboardPaneMenuItem
} from './budgetDashboardPaneMenu';

function makeFile(path: string): BudgetDashboardPaneMenuFile {
  return {
    path
  };
}

class MockMenuItem {
  title: string | null = null;
  icon: string | null = null;
  clickHandler: ((evt: MouseEvent | KeyboardEvent) => any) | null = null;

  setTitle(title: string | DocumentFragment): this {
    this.title = typeof title === 'string' ? title : title.textContent || '';
    return this;
  }

  setIcon(icon: string | null): this {
    this.icon = icon;
    return this;
  }

  onClick(callback: (evt: MouseEvent | KeyboardEvent) => any): this {
    this.clickHandler = callback;
    return this;
  }
}

class MockMenu {
  readonly items: MockMenuItem[] = [];

  addItem(cb: (item: BudgetDashboardPaneMenuItem) => any): this {
    const item = new MockMenuItem();
    cb(item as unknown as BudgetDashboardPaneMenuItem);
    this.items.push(item);
    return this;
  }
}

describe('addBudgetDashboardPaneMenuItems', () => {
  it('does not add menu item when no file is loaded', () => {
    const menu = new MockMenu();

    addBudgetDashboardPaneMenuItems(
      menu as unknown as BudgetDashboardPaneMenu,
      null,
      {
        onOpenSourceNote: vi.fn(),
        canCreateNextMonth: vi.fn(() => true),
        onCreateNextMonth: vi.fn()
      }
    );

    expect(menu.items).toHaveLength(0);
  });

  it('adds only source-note action when next-month is not eligible', () => {
    const menu = new MockMenu();
    const file = makeFile('finance/2026-02-budget.md');
    const onOpenSourceNote = vi.fn(async () => {});
    const canCreateNextMonth = vi.fn(() => false);

    addBudgetDashboardPaneMenuItems(
      menu as unknown as BudgetDashboardPaneMenu,
      file,
      {
        onOpenSourceNote,
        canCreateNextMonth,
        onCreateNextMonth: vi.fn()
      }
    );

    expect(canCreateNextMonth).toHaveBeenCalledWith(file);
    expect(menu.items).toHaveLength(1);
    expect(menu.items[0].title).toBe('Open budget source note');
    expect(menu.items[0].icon).toBe('file-text');

    menu.items[0].clickHandler?.({} as unknown as MouseEvent);
    expect(onOpenSourceNote).toHaveBeenCalledWith(file);
  });

  it('adds both pane-menu actions and invokes handlers with the active file', () => {
    const menu = new MockMenu();
    const file = makeFile('finance/2026-02-budget.md');
    const onOpenSourceNote = vi.fn(async () => {});
    const onCreateNextMonth = vi.fn(async () => {});

    addBudgetDashboardPaneMenuItems(
      menu as unknown as BudgetDashboardPaneMenu,
      file,
      {
        onOpenSourceNote,
        canCreateNextMonth: () => true,
        onCreateNextMonth
      }
    );

    expect(menu.items).toHaveLength(2);
    expect(menu.items[0].title).toBe('Open budget source note');
    expect(menu.items[0].icon).toBe('file-text');
    expect(menu.items[1].title).toBe('Create next month budget');
    expect(menu.items[1].icon).toBe('copy');

    menu.items[0].clickHandler?.({} as unknown as MouseEvent);
    expect(onOpenSourceNote).toHaveBeenCalledWith(file);

    menu.items[1].clickHandler?.({} as unknown as MouseEvent);
    expect(onCreateNextMonth).toHaveBeenCalledWith(file);
  });
});
