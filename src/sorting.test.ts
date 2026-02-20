import { describe, expect, it } from 'vitest';
import type { BudgetItem } from './parser';
import { sortBudgetItems } from './sorting';

function makeItems(): BudgetItem[] {
  return [
    { tag: 'Utility', name: 'Water', amount: 51 },
    { tag: 'bill', name: 'Mortgage', amount: 1810 },
    { tag: 'subscription', name: 'Netflix', amount: 8.72 },
    { tag: 'Flex', name: 'Haircut', amount: 48 }
  ];
}

describe('sortBudgetItems', () => {
  it('sorts by amount descending', () => {
    const sorted = sortBudgetItems(makeItems(), 'amount-desc');
    expect(sorted.map((item) => item.amount)).toEqual([1810, 51, 48, 8.72]);
  });

  it('sorts by amount ascending', () => {
    const sorted = sortBudgetItems(makeItems(), 'amount-asc');
    expect(sorted.map((item) => item.amount)).toEqual([8.72, 48, 51, 1810]);
  });

  it('sorts by tag case-insensitively', () => {
    const sorted = sortBudgetItems(makeItems(), 'tag');
    expect(sorted.map((item) => item.tag)).toEqual(['bill', 'Flex', 'subscription', 'Utility']);
  });

  it('sorts by name case-insensitively', () => {
    const sorted = sortBudgetItems(makeItems(), 'name');
    expect(sorted.map((item) => item.name)).toEqual(['Haircut', 'Mortgage', 'Netflix', 'Water']);
  });

  it('does not mutate input array', () => {
    const original = makeItems();
    const before = original.map((item) => item.name);
    void sortBudgetItems(original, 'amount-desc');
    expect(original.map((item) => item.name)).toEqual(before);
  });
});
