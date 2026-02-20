import type { BudgetItem } from './parser';

export type ItemSortOption = 'amount-desc' | 'amount-asc' | 'tag' | 'name';

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

export function sortBudgetItems(items: BudgetItem[], sortBy: ItemSortOption): BudgetItem[] {
  const sorted = [...items];

  sorted.sort((a, b) => {
    switch (sortBy) {
      case 'amount-desc':
        return b.amount - a.amount;
      case 'amount-asc':
        return a.amount - b.amount;
      case 'tag':
        return compareText(a.tag, b.tag);
      case 'name':
        return compareText(a.name, b.name);
      default:
        return 0;
    }
  });

  return sorted;
}
