import type { ItemSortOption } from '../sorting';

export interface BudgetDashboardPaneMenuFile {
  path: string;
}

export interface BudgetDashboardPaneMenuItem {
  setTitle(title: string): this;
  setIcon(icon: string | null): this;
  onClick(callback: (evt: MouseEvent | KeyboardEvent) => any): this;
}

export interface BudgetDashboardPaneMenu {
  addItem(cb: (item: BudgetDashboardPaneMenuItem) => any): this;
}

export interface BudgetDashboardPaneMenuOptions<TFile extends BudgetDashboardPaneMenuFile> {
  onOpenSourceNote: (file: TFile) => Promise<void> | void;
  canCreateNextMonth: (file: TFile) => boolean;
  onCreateNextMonth: (file: TFile) => Promise<void> | void;
  canSortItems: (file: TFile) => boolean;
  onSortItems: (file: TFile, sortBy: ItemSortOption) => Promise<void> | void;
}

export function addBudgetDashboardPaneMenuItems<TFile extends BudgetDashboardPaneMenuFile>(
  menu: BudgetDashboardPaneMenu,
  file: TFile | null,
  options: BudgetDashboardPaneMenuOptions<TFile>
): void {
  if (!file) {
    return;
  }

  const canCreateNextMonth = options.canCreateNextMonth(file);
  const canSortItems = options.canSortItems(file);

  if (canSortItems) {
    const sortMenuItems: Array<{ title: string; sortBy: ItemSortOption }> = [
      { title: 'Sort items: $ High to Low', sortBy: 'amount-desc' },
      { title: 'Sort items: $ Low to High', sortBy: 'amount-asc' },
      { title: 'Sort items: Tag (A to Z)', sortBy: 'tag' },
      { title: 'Sort items: Name (A to Z)', sortBy: 'name' }
    ];

    for (const sortAction of sortMenuItems) {
      menu.addItem((item) => item
        .setTitle(sortAction.title)
        .setIcon('arrow-down-up')
        .onClick(() => {
          void options.onSortItems(file, sortAction.sortBy);
        }));
    }
  }

  menu.addItem((item) => item
    .setTitle('Open budget source note')
    .setIcon('file-text')
    .onClick(() => {
      void options.onOpenSourceNote(file);
    }));

  if (!canCreateNextMonth) {
    return;
  }

  menu.addItem((item) => item
    .setTitle('Create next month budget')
    .setIcon('copy')
    .onClick(() => {
      void options.onCreateNextMonth(file);
    }));
}
