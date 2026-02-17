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
}

export function addBudgetDashboardPaneMenuItems<TFile extends BudgetDashboardPaneMenuFile>(
  menu: BudgetDashboardPaneMenu,
  file: TFile | null,
  options: BudgetDashboardPaneMenuOptions<TFile>
): void {
  if (!file) {
    return;
  }

  menu.addItem((item) => item
    .setTitle('Open budget source note')
    .setIcon('file-text')
    .onClick(() => {
      void options.onOpenSourceNote(file);
    }));

  if (!options.canCreateNextMonth(file)) {
    return;
  }

  menu.addItem((item) => item
    .setTitle('Create next month budget')
    .setIcon('copy')
    .onClick(() => {
      void options.onCreateNextMonth(file);
    }));
}
