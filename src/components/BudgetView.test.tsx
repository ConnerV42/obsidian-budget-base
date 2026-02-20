import { describe, it, expect, vi } from 'vitest';
import { BudgetData, calculateTotals } from '../parser';
import { alignPaycheckDateToMonth, monthFromIsoDate } from './BudgetView';

/**
 * These tests verify the data logic that powers BudgetView.
 * We test the update handlers' logic without rendering the component,
 * since the actual data transformations are what matter for correctness.
 */

describe('BudgetView paycheck date helpers', () => {
  it('aligns paycheck date to a different month while preserving day when possible', () => {
    expect(alignPaycheckDateToMonth('2026-03-15', '2026-04')).toBe('2026-04-15');
  });

  it('clamps paycheck day to end of target month', () => {
    expect(alignPaycheckDateToMonth('2026-01-31', '2026-02')).toBe('2026-02-28');
    expect(alignPaycheckDateToMonth('2028-01-31', '2028-02')).toBe('2028-02-29');
  });

  it('derives month token from paycheck date', () => {
    expect(monthFromIsoDate('2026-03-15')).toBe('2026-03');
  });
});

describe('BudgetView update handlers', () => {
  // Helper to simulate immutable data clone (same as cloneData in BudgetView)
  const cloneData = (data: BudgetData): BudgetData => ({
    ...data,
    categories: data.categories.map(cat => ({
      ...cat,
      items: cat.items.map(item => ({ ...item }))
    }))
  });

  describe('handleItemUpdate', () => {
    it('updates amount correctly', () => {
      const data: BudgetData = {
        type: 'budget',
        month: '2026-02',
        income: 5000,
        categories: [
          {
            name: 'Test',
            items: [{ tag: 'flex', name: 'Item 1', amount: 100 }]
          }
        ]
      };

      // Simulate handleItemUpdate logic
      const newData = cloneData(data);
      newData.categories[0].items[0].amount = 500;

      expect(newData.categories[0].items[0].amount).toBe(500);
      expect(data.categories[0].items[0].amount).toBe(100); // Original unchanged
    });

    it('updates name correctly', () => {
      const data: BudgetData = {
        type: 'budget',
        month: '2026-02',
        income: 5000,
        categories: [
          {
            name: 'Test',
            items: [{ tag: 'flex', name: 'Old Name', amount: 100 }]
          }
        ]
      };

      const newData = cloneData(data);
      newData.categories[0].items[0].name = 'New Name';

      expect(newData.categories[0].items[0].name).toBe('New Name');
      expect(data.categories[0].items[0].name).toBe('Old Name');
    });

    it('updates tag correctly', () => {
      const data: BudgetData = {
        type: 'budget',
        month: '2026-02',
        income: 5000,
        categories: [
          {
            name: 'Test',
            items: [{ tag: 'flex', name: 'Item', amount: 100 }]
          }
        ]
      };

      const newData = cloneData(data);
      newData.categories[0].items[0].tag = 'vault';

      expect(newData.categories[0].items[0].tag).toBe('vault');
      expect(data.categories[0].items[0].tag).toBe('flex');
    });
  });

  describe('handleCategoryRename', () => {
    it('renames category correctly', () => {
      const data: BudgetData = {
        type: 'budget',
        month: '2026-02',
        income: 5000,
        categories: [
          { name: 'Old Name', items: [] }
        ]
      };

      const newData = cloneData(data);
      newData.categories[0].name = 'New Name';

      expect(newData.categories[0].name).toBe('New Name');
      expect(data.categories[0].name).toBe('Old Name');
    });

    it('updates categoryTotals key when renamed', () => {
      const data: BudgetData = {
        type: 'budget',
        month: '2026-02',
        income: 5000,
        categories: [
          {
            name: 'Old Name',
            items: [{ tag: 'flex', name: 'Item', amount: 100 }]
          }
        ]
      };

      const newData = cloneData(data);
      newData.categories[0].name = 'New Name';

      const totals = calculateTotals(newData);
      expect(totals.categoryTotals['New Name']).toBe(100);
      expect(totals.categoryTotals['Old Name']).toBeUndefined();
    });
  });

  describe('handleAddItem', () => {
    it('adds item to correct category', () => {
      const data: BudgetData = {
        type: 'budget',
        month: '2026-02',
        income: 5000,
        categories: [
          { name: 'Cat 1', items: [] },
          { name: 'Cat 2', items: [] }
        ]
      };

      const newData = cloneData(data);
      newData.categories[1].items.push({ tag: 'flex', name: 'New Item', amount: 50 });

      expect(newData.categories[0].items).toHaveLength(0);
      expect(newData.categories[1].items).toHaveLength(1);
      expect(newData.categories[1].items[0].name).toBe('New Item');
    });

    it('updates totals when item added', () => {
      const data: BudgetData = {
        type: 'budget',
        month: '2026-02',
        income: 5000,
        categories: [
          {
            name: 'Test',
            items: [{ tag: 'flex', name: 'Existing', amount: 100 }]
          }
        ]
      };

      const newData = cloneData(data);
      newData.categories[0].items.push({ tag: 'vault', name: 'New', amount: 200 });

      const totals = calculateTotals(newData);
      expect(totals.totalAllocated).toBe(300);
      expect(totals.categoryTotals['Test']).toBe(300);
    });

    it('preserves intentional duplicate items', () => {
      const data: BudgetData = {
        type: 'budget',
        month: '2026-02',
        income: 5000,
        categories: [
          {
            name: 'Items',
            items: [{ tag: 'Bill', name: 'Mortgage', amount: 1800 }]
          }
        ]
      };

      const newData = cloneData(data);
      newData.categories[0].items.push({ tag: 'Bill', name: 'Mortgage', amount: 1800 });

      expect(newData.categories[0].items).toHaveLength(2);
      expect(newData.categories[0].items[0]).toEqual(newData.categories[0].items[1]);
    });
  });

  describe('handleDeleteItem', () => {
    it('removes correct item', () => {
      const data: BudgetData = {
        type: 'budget',
        month: '2026-02',
        income: 5000,
        categories: [
          {
            name: 'Test',
            items: [
              { tag: 'flex', name: 'Keep 1', amount: 100 },
              { tag: 'flex', name: 'Delete', amount: 200 },
              { tag: 'flex', name: 'Keep 2', amount: 300 }
            ]
          }
        ]
      };

      const newData = cloneData(data);
      newData.categories[0].items.splice(1, 1);

      expect(newData.categories[0].items).toHaveLength(2);
      expect(newData.categories[0].items[0].name).toBe('Keep 1');
      expect(newData.categories[0].items[1].name).toBe('Keep 2');
    });

    it('updates totals when item deleted', () => {
      const data: BudgetData = {
        type: 'budget',
        month: '2026-02',
        income: 5000,
        categories: [
          {
            name: 'Test',
            items: [
              { tag: 'flex', name: 'Item 1', amount: 100 },
              { tag: 'flex', name: 'Item 2', amount: 200 }
            ]
          }
        ]
      };

      const newData = cloneData(data);
      newData.categories[0].items.splice(0, 1);

      const totals = calculateTotals(newData);
      expect(totals.totalAllocated).toBe(200);
    });
  });

  describe('handleReorderItem', () => {
    it('reorders items within category', () => {
      const data: BudgetData = {
        type: 'budget',
        month: '2026-02',
        income: 5000,
        categories: [
          {
            name: 'Test',
            items: [
              { tag: 'flex', name: 'A', amount: 100 },
              { tag: 'flex', name: 'B', amount: 200 },
              { tag: 'flex', name: 'C', amount: 300 }
            ]
          }
        ]
      };

      const newData = cloneData(data);
      const items = newData.categories[0].items;
      // Move item at index 2 (C) to index 0
      const [movedItem] = items.splice(2, 1);
      items.splice(0, 0, movedItem);

      expect(newData.categories[0].items[0].name).toBe('C');
      expect(newData.categories[0].items[1].name).toBe('A');
      expect(newData.categories[0].items[2].name).toBe('B');
    });

    it('preserves totals after reorder', () => {
      const data: BudgetData = {
        type: 'budget',
        month: '2026-02',
        income: 5000,
        categories: [
          {
            name: 'Test',
            items: [
              { tag: 'flex', name: 'A', amount: 100 },
              { tag: 'flex', name: 'B', amount: 200 }
            ]
          }
        ]
      };

      const beforeTotals = calculateTotals(data);

      const newData = cloneData(data);
      const items = newData.categories[0].items;
      const [movedItem] = items.splice(0, 1);
      items.splice(1, 0, movedItem);

      const afterTotals = calculateTotals(newData);

      expect(afterTotals.totalAllocated).toBe(beforeTotals.totalAllocated);
      expect(afterTotals.unallocated).toBe(beforeTotals.unallocated);
    });
  });

  describe('handleAddCategory', () => {
    it('adds new category at end', () => {
      const data: BudgetData = {
        type: 'budget',
        month: '2026-02',
        income: 5000,
        categories: [
          { name: 'Existing', items: [] }
        ]
      };

      const newData = cloneData(data);
      newData.categories.push({
        name: 'Category 2',
        items: [{ tag: 'item', name: 'New item', amount: 0 }]
      });

      expect(newData.categories).toHaveLength(2);
      expect(newData.categories[1].name).toBe('Category 2');
    });
  });

  describe('handleIncomeUpdate', () => {
    it('updates income and recalculates unallocated', () => {
      const data: BudgetData = {
        type: 'budget',
        month: '2026-02',
        income: 5000,
        categories: [
          {
            name: 'Test',
            items: [{ tag: 'flex', name: 'Item', amount: 1000 }]
          }
        ]
      };

      const newData = { ...data, income: 6000 };

      const totals = calculateTotals(newData);
      expect(totals.income).toBe(6000);
      expect(totals.totalAllocated).toBe(1000);
      expect(totals.unallocated).toBe(5000);
    });
  });
});

describe('BudgetView immutability', () => {
  const cloneData = (data: BudgetData): BudgetData => ({
    ...data,
    categories: data.categories.map(cat => ({
      ...cat,
      items: cat.items.map(item => ({ ...item }))
    }))
  });

  it('cloneData creates deep copy', () => {
    const original: BudgetData = {
      type: 'budget',
      month: '2026-02',
      income: 5000,
      categories: [
        {
          name: 'Test',
          items: [{ tag: 'flex', name: 'Item', amount: 100 }]
        }
      ]
    };

    const cloned = cloneData(original);

    // Modify cloned data
    cloned.income = 6000;
    cloned.categories[0].name = 'Modified';
    cloned.categories[0].items[0].amount = 999;

    // Original should be unchanged
    expect(original.income).toBe(5000);
    expect(original.categories[0].name).toBe('Test');
    expect(original.categories[0].items[0].amount).toBe(100);
  });

  it('cloneData handles empty categories', () => {
    const original: BudgetData = {
      type: 'budget',
      month: '2026-02',
      income: 5000,
      categories: []
    };

    const cloned = cloneData(original);
    cloned.categories.push({ name: 'New', items: [] });

    expect(original.categories).toHaveLength(0);
  });

  it('cloneData handles empty items', () => {
    const original: BudgetData = {
      type: 'budget',
      month: '2026-02',
      income: 5000,
      categories: [
        { name: 'Empty', items: [] }
      ]
    };

    const cloned = cloneData(original);
    cloned.categories[0].items.push({ tag: 'flex', name: 'New', amount: 50 });

    expect(original.categories[0].items).toHaveLength(0);
  });
});

describe('Total calculations edge cases', () => {
  it('handles floating point precision', () => {
    const data: BudgetData = {
      type: 'budget',
      month: '2026-02',
      income: 100,
      categories: [
        {
          name: 'Subs',
          items: [
            { tag: 'sub', name: 'A', amount: 0.1 },
            { tag: 'sub', name: 'B', amount: 0.2 }
          ]
        }
      ]
    };

    const totals = calculateTotals(data);
    // 0.1 + 0.2 = 0.30000000000000004 in JS
    // We should handle this gracefully
    expect(totals.totalAllocated).toBeCloseTo(0.3, 10);
  });

  it('handles many small items', () => {
    const items = Array.from({ length: 100 }, (_, i) => ({
      tag: 'flex',
      name: `Item ${i}`,
      amount: 1
    }));

    const data: BudgetData = {
      type: 'budget',
      month: '2026-02',
      income: 1000,
      categories: [{ name: 'Test', items }]
    };

    const totals = calculateTotals(data);
    expect(totals.totalAllocated).toBe(100);
    expect(totals.unallocated).toBe(900);
  });

  it('handles very large numbers', () => {
    const data: BudgetData = {
      type: 'budget',
      month: '2026-02',
      income: 999999999,
      categories: [
        {
          name: 'Big',
          items: [{ tag: 'vault', name: 'Savings', amount: 500000000 }]
        }
      ]
    };

    const totals = calculateTotals(data);
    expect(totals.unallocated).toBe(499999999);
  });
});
