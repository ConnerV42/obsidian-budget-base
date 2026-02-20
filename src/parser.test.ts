import { describe, it, expect } from 'vitest';
import { parseBudgetMarkdown, calculateTotals, getTagColor, BudgetData } from './parser';

describe('parseBudgetMarkdown', () => {
  describe('basic parsing', () => {
    it('returns null for non-budget files', () => {
      const content = `---
title: Some Note
---

Just a regular note.`;
      expect(parseBudgetMarkdown(content)).toBeNull();
    });

    it('returns null for files without frontmatter', () => {
      const content = `# No Frontmatter

Just some content.`;
      expect(parseBudgetMarkdown(content)).toBeNull();
    });

    it('parses list-based frontmatter syntax and preserves unknown keys', () => {
      const content = `---
type: budget
aliases:
  - monthly-budget
---

## Items
- [bill] Rent: 1800`;

      const parsed = parseBudgetMarkdown(content);
      expect(parsed).not.toBeNull();
      expect(parsed?._frontmatterPassthrough?.topLevel?.aliases).toEqual(['monthly-budget']);
    });

    it('parses basic budget file', () => {
      const content = `---
type: budget
month: 2026-02
income: 8000
---

## Savings
- [vault] Emergency Fund: 500
- [vault] Wedding Fund: 1000

## Expenses
- [bill] Mortgage: 1800`;

      const result = parseBudgetMarkdown(content);
      
      expect(result).not.toBeNull();
      expect(result?.type).toBe('budget');
      expect(result?.month).toBe('2026-02');
      expect(result?.income).toBe(8000);
      expect(result?.categories).toHaveLength(2);
      
      expect(result?.categories[0].name).toBe('Savings');
      expect(result?.categories[0].items).toHaveLength(2);
      expect(result?.categories[0].items[0]).toEqual({
        tag: 'vault',
        name: 'Emergency Fund',
        amount: 500
      });
      
      expect(result?.categories[1].name).toBe('Expenses');
      expect(result?.categories[1].items).toHaveLength(1);
    });

    it('parses paycheckDate when frontmatter includes a valid ISO date', () => {
      const content = `---
type: budget
month: 2026-03
paycheckDate: 2026-03-15
income: 8000
---

## Items
- [bill] Rent: 1800`;

      const result = parseBudgetMarkdown(content);
      expect(result?.paycheckDate).toBe('2026-03-15');
    });

    it('ignores invalid paycheckDate values', () => {
      const content = `---
type: budget
month: 2026-03
paycheckDate: 2026-02-31
income: 8000
---

## Items
- [bill] Rent: 1800`;

      const result = parseBudgetMarkdown(content);
      expect(result?.paycheckDate).toBeUndefined();
    });

    it('parses v2 compensation and derives income from computed take-home', () => {
      const content = `---
type: budget
month: 2026-02
income: 9999
compensation:
  version: 2
  gross: 8000
  taxPercentBps: 2275
  retirementPercentBps: 1600
---

## Items
- [bill] Rent: 2000`;

      const result = parseBudgetMarkdown(content);
      expect(result?.compensation).toEqual({
        version: 2,
        gross: 8000,
        taxPercentBps: 2275,
        retirementPercentBps: 1600
      });
      expect(result?.income).toBe(4900);
    });

    it('ignores persisted compensation computed values and recomputes take-home', () => {
      const content = `---
type: budget
month: 2026-02
income: 9999
compensation:
  version: 2
  gross: 8000
  taxPercentBps: 2275
  retirementPercentBps: 1600
  computed:
    taxAmount: 1
    retirementAmount: 1
    takeHome: 7998
---

## Items
- [bill] Rent: 2000`;

      const result = parseBudgetMarkdown(content);
      expect(result?.income).toBe(4900);
      expect(result?.compensation?.computed).toBeUndefined();
    });

    it('migrates legacy deduction-array compensation and derives take-home', () => {
      const content = `---
type: budget
month: 2026-02
income: 9999
compensation:
  version: 1
  gross: 8000
  deductions:
    -
      id: d001
      label: Tax
      mode: percent
      percentBps: 2275
      amount: 0
    -
      id: d002
      label: Retirement
      mode: percent
      percentBps: 1600
      amount: 0
---

## Items
- [bill] Rent: 2000`;

      const result = parseBudgetMarkdown(content);
      expect(result?.compensation).toEqual({
        version: 2,
        gross: 8000,
        taxPercentBps: 2275,
        retirementPercentBps: 1600
      });
      expect(result?.income).toBe(4900);
    });

    it('falls back to legacy income when compensation is missing', () => {
      const content = `---
type: budget
month: 2026-02
income: 3200
---

## Items
- [bill] Rent: 2000`;

      const result = parseBudgetMarkdown(content);
      expect(result?.compensation).toBeUndefined();
      expect(result?.income).toBe(3200);
    });

    it('parses chart size from frontmatter', () => {
      const content = `---
type: budget
month: 2026-02
income: 8000
chart:
  size: 320
---

## Savings
- [vault] Emergency Fund: 500`;

      const result = parseBudgetMarkdown(content);
      expect(result?.chart?.size).toBe(320);
    });

    it('parses layout split ratio from frontmatter', () => {
      const content = `---
type: budget
month: 2026-02
income: 8000
layout:
  splitRatio: 0.41
---

## Savings
- [vault] Emergency Fund: 500`;

      const result = parseBudgetMarkdown(content);
      expect(result?.layout?.splitRatio).toBe(0.41);
    });

    it('clamps layout split ratio to valid range', () => {
      const content = `---
type: budget
month: 2026-02
income: 8000
layout:
  splitRatio: 0.9
---

## Savings
- [vault] Emergency Fund: 500`;

      const result = parseBudgetMarkdown(content);
      expect(result?.layout?.splitRatio).toBe(0.55);
    });

    it('parses tagColors with quoted keys and normalizes keys', () => {
      const content = `---
type: budget
month: 2026-02
income: 8000
tagColors:
  "fixed expenses": "#dc2626"
  "Needs/Wants": "#8b5cf6"
  Savings: "#0a8545"
---

## Items
- [Fixed Expenses] Mortgage: 1800`;

      const result = parseBudgetMarkdown(content);
      expect(result?.tagColors).toEqual({
        'Fixed expenses': '#dc2626',
        'Needs/wants': '#8b5cf6',
        Savings: '#0a8545'
      });
    });
  });

  describe('amount parsing', () => {
    it('handles amounts with commas', () => {
      const content = `---
type: budget
month: 2026-02
income: 10,000
---

## Big Items
- [bill] House: 2,500`;

      const result = parseBudgetMarkdown(content);
      expect(result?.income).toBe(10000);
      expect(result?.categories[0].items[0].amount).toBe(2500);
    });

    it('handles amounts with dollar signs', () => {
      const content = `---
type: budget
month: 2026-02
income: 5000
---

## Test
- [flex] Item: $250`;

      const result = parseBudgetMarkdown(content);
      expect(result?.categories[0].items[0].amount).toBe(250);
    });

    it('handles decimal amounts', () => {
      const content = `---
type: budget
month: 2026-02
income: 5000
---

## Test
- [sub] Subscription: 12.99`;

      const result = parseBudgetMarkdown(content);
      expect(result?.categories[0].items[0].amount).toBe(12.99);
    });

    it('handles zero amounts', () => {
      const content = `---
type: budget
month: 2026-02
income: 5000
---

## Test
- [flex] Free Thing: 0`;

      const result = parseBudgetMarkdown(content);
      expect(result?.categories[0].items[0].amount).toBe(0);
    });

    it('handles negative amounts', () => {
      const content = `---
type: budget
month: 2026-02
income: 5000
---

## Test
- [flex] Refund: -50`;

      const result = parseBudgetMarkdown(content);
      expect(result?.categories[0].items[0].amount).toBe(-50);
    });

    it('handles amounts with spaces', () => {
      const content = `---
type: budget
month: 2026-02
income: 5000
---

## Test
- [flex] Item:    500`;

      const result = parseBudgetMarkdown(content);
      expect(result?.categories[0].items[0].amount).toBe(500);
    });
  });

  describe('item name parsing', () => {
    it('handles item names with colons', () => {
      const content = `---
type: budget
month: 2026-02
income: 5000
---

## Test
- [sub] Netflix: 4K Plan: 20`;

      const result = parseBudgetMarkdown(content);
      expect(result?.categories[0].items[0].name).toBe('Netflix: 4K Plan');
      expect(result?.categories[0].items[0].amount).toBe(20);
    });

    it('handles item names with special characters', () => {
      const content = `---
type: budget
month: 2026-02
income: 5000
---

## Test
- [sub] AT&T (Mobile): 80
- [bill] O'Reilly Auto: 50
- [flex] "Fancy" Restaurant: 100`;

      const result = parseBudgetMarkdown(content);
      expect(result?.categories[0].items[0].name).toBe("AT&T (Mobile)");
      expect(result?.categories[0].items[1].name).toBe("O'Reilly Auto");
      expect(result?.categories[0].items[2].name).toBe('"Fancy" Restaurant');
    });

    it('handles item names with unicode', () => {
      const content = `---
type: budget
month: 2026-02
income: 5000
---

## Test
- [flex] Café ☕: 25
- [sub] 日本語: 50`;

      const result = parseBudgetMarkdown(content);
      expect(result?.categories[0].items[0].name).toBe('Café ☕');
      expect(result?.categories[0].items[1].name).toBe('日本語');
    });

    it('parses tags containing spaces and punctuation', () => {
      const content = `---
type: budget
month: 2026-02
income: 5000
---

## Test
- [Fixed Expenses] Mortgage: 1200
- [Needs/Wants] Fun Money: 150`;

      const result = parseBudgetMarkdown(content);
      expect(result?.categories[0].items[0].tag).toBe('Fixed Expenses');
      expect(result?.categories[0].items[1].tag).toBe('Needs/Wants');
    });

    it('trims whitespace from names', () => {
      const content = `---
type: budget
month: 2026-02
income: 5000
---

## Test
- [flex]   Padded Name   : 100`;

      const result = parseBudgetMarkdown(content);
      expect(result?.categories[0].items[0].name).toBe('Padded Name');
    });
  });

  describe('category parsing', () => {
    it('handles empty categories', () => {
      const content = `---
type: budget
month: 2026-02
income: 5000
---

## Empty Category

## Has Items
- [flex] Item: 100`;

      const result = parseBudgetMarkdown(content);
      expect(result?.categories).toHaveLength(2);
      expect(result?.categories[0].items).toHaveLength(0);
      expect(result?.categories[1].items).toHaveLength(1);
    });

    it('handles category names with special characters', () => {
      const content = `---
type: budget
month: 2026-02
income: 5000
---

## Fixed Expenses (Monthly)
- [bill] Rent: 1500

## Fun & Games
- [flex] Steam: 50`;

      const result = parseBudgetMarkdown(content);
      expect(result?.categories[0].name).toBe('Fixed Expenses (Monthly)');
      expect(result?.categories[1].name).toBe('Fun & Games');
    });

    it('handles many categories', () => {
      const categories = Array.from({ length: 20 }, (_, i) => 
        `## Category ${i + 1}\n- [flex] Item: ${i * 10}`
      ).join('\n\n');
      
      const content = `---
type: budget
month: 2026-02
income: 50000
---

${categories}`;

      const result = parseBudgetMarkdown(content);
      expect(result?.categories).toHaveLength(20);
    });
  });

  describe('edge cases', () => {
    it('ignores malformed item lines', () => {
      const content = `---
type: budget
month: 2026-02
income: 5000
---

## Test
- [flex] Valid Item: 100
- This is not a valid item
- [flex] Also Valid: 200
- Missing amount
- [flex] : 300`;

      const result = parseBudgetMarkdown(content);
      expect(result?.categories[0].items).toHaveLength(2);
    });

    it('handles zero income', () => {
      const content = `---
type: budget
month: 2026-02
income: 0
---

## Test
- [flex] Item: 100`;

      const result = parseBudgetMarkdown(content);
      expect(result?.income).toBe(0);
    });

    it('handles missing income (defaults to 0)', () => {
      const content = `---
type: budget
month: 2026-02
---

## Test
- [flex] Item: 100`;

      const result = parseBudgetMarkdown(content);
      expect(result?.income).toBe(0);
    });

    it('handles windows line endings', () => {
      const content = "---\r\ntype: budget\r\nmonth: 2026-02\r\nincome: 5000\r\n---\r\n\r\n## Test\r\n- [flex] Item: 100";

      const result = parseBudgetMarkdown(content);
      expect(result).not.toBeNull();
      expect(result?.categories[0].items[0].amount).toBe(100);
    });

    it('handles tabs in content', () => {
      const content = `---
type: budget
month: 2026-02
income: 5000
---

## Test
-	[flex] Tabbed Item: 100`;

      const result = parseBudgetMarkdown(content);
      expect(result?.categories[0].items).toHaveLength(1);
    });
  });
});

describe('calculateTotals', () => {
  it('calculates correct totals', () => {
    const data: BudgetData = {
      type: 'budget',
      month: '2026-02',
      income: 5000,
      categories: [
        {
          name: 'Savings',
          items: [
            { tag: 'vault', name: 'Fund A', amount: 500 },
            { tag: 'vault', name: 'Fund B', amount: 300 },
          ]
        },
        {
          name: 'Expenses',
          items: [
            { tag: 'bill', name: 'Rent', amount: 1500 },
          ]
        }
      ]
    };

    const totals = calculateTotals(data);
    
    expect(totals.income).toBe(5000);
    expect(totals.totalAllocated).toBe(2300);
    expect(totals.unallocated).toBe(2700);
    expect(totals.categoryTotals['Savings']).toBe(800);
    expect(totals.categoryTotals['Expenses']).toBe(1500);
  });

  it('handles over-budget scenario', () => {
    const data: BudgetData = {
      type: 'budget',
      month: '2026-02',
      income: 1000,
      categories: [
        {
          name: 'Overrun',
          items: [
            { tag: 'flex', name: 'Too Much', amount: 1500 },
          ]
        }
      ]
    };

    const totals = calculateTotals(data);
    expect(totals.unallocated).toBe(-500);
  });

  it('handles empty budget', () => {
    const data: BudgetData = {
      type: 'budget',
      month: '2026-02',
      income: 5000,
      categories: []
    };

    const totals = calculateTotals(data);
    expect(totals.totalAllocated).toBe(0);
    expect(totals.unallocated).toBe(5000);
    expect(totals.categoryTotals).toEqual({});
  });

  it('handles zero income', () => {
    const data: BudgetData = {
      type: 'budget',
      month: '2026-02',
      income: 0,
      categories: [
        {
          name: 'Expenses',
          items: [{ tag: 'bill', name: 'Rent', amount: 1000 }]
        }
      ]
    };

    const totals = calculateTotals(data);
    expect(totals.income).toBe(0);
    expect(totals.totalAllocated).toBe(1000);
    expect(totals.unallocated).toBe(-1000);
  });

  it('handles negative amounts', () => {
    const data: BudgetData = {
      type: 'budget',
      month: '2026-02',
      income: 5000,
      categories: [
        {
          name: 'Mixed',
          items: [
            { tag: 'bill', name: 'Expense', amount: 100 },
            { tag: 'flex', name: 'Refund', amount: -50 },
          ]
        }
      ]
    };

    const totals = calculateTotals(data);
    expect(totals.categoryTotals['Mixed']).toBe(50);
    expect(totals.totalAllocated).toBe(50);
    expect(totals.unallocated).toBe(4950);
  });

  it('handles decimal precision', () => {
    const data: BudgetData = {
      type: 'budget',
      month: '2026-02',
      income: 100,
      categories: [
        {
          name: 'Subs',
          items: [
            { tag: 'sub', name: 'Netflix', amount: 15.99 },
            { tag: 'sub', name: 'Spotify', amount: 9.99 },
            { tag: 'sub', name: 'iCloud', amount: 2.99 },
          ]
        }
      ]
    };

    const totals = calculateTotals(data);
    expect(totals.categoryTotals['Subs']).toBeCloseTo(28.97, 2);
    expect(totals.totalAllocated).toBeCloseTo(28.97, 2);
    expect(totals.unallocated).toBeCloseTo(71.03, 2);
  });

  it('handles empty category', () => {
    const data: BudgetData = {
      type: 'budget',
      month: '2026-02',
      income: 5000,
      categories: [
        { name: 'Empty', items: [] },
        { name: 'Has Items', items: [{ tag: 'flex', name: 'Item', amount: 100 }] }
      ]
    };

    const totals = calculateTotals(data);
    expect(totals.categoryTotals['Empty']).toBe(0);
    expect(totals.categoryTotals['Has Items']).toBe(100);
  });

  it('handles large numbers', () => {
    const data: BudgetData = {
      type: 'budget',
      month: '2026-02',
      income: 1000000,
      categories: [
        {
          name: 'Big',
          items: [
            { tag: 'vault', name: 'Savings', amount: 500000 },
            { tag: 'bill', name: 'House', amount: 250000 },
          ]
        }
      ]
    };

    const totals = calculateTotals(data);
    expect(totals.totalAllocated).toBe(750000);
    expect(totals.unallocated).toBe(250000);
  });
});

describe('getTagColor', () => {
  it('returns correct colors for known tags', () => {
    expect(getTagColor('vault')).toBe('#059669');
    expect(getTagColor('roth')).toBe('#0891b2');
    expect(getTagColor('taxable')).toBe('#6366f1');
    expect(getTagColor('bill')).toBe('#dc2626');
    expect(getTagColor('sub')).toBe('#f59e0b');
    expect(getTagColor('flex')).toBe('#8b5cf6');
  });

  it('returns default color for unknown tags', () => {
    expect(getTagColor('unknown')).toBe('#6b7280');
    expect(getTagColor('random')).toBe('#6b7280');
    expect(getTagColor('')).toBe('#6b7280');
  });

  it('is case-insensitive', () => {
    expect(getTagColor('VAULT')).toBe('#059669');
    expect(getTagColor('Vault')).toBe('#059669');
    expect(getTagColor('vault')).toBe('#059669');
  });
});

describe('round-trip parsing', () => {
  const serialize = (data: BudgetData): string => {
    let content = '---\n';
    content += `type: budget\n`;
    content += `month: ${data.month}\n`;
    content += `income: ${data.income}\n`;
    if (data.layout?.splitRatio !== undefined) {
      content += `layout:\n`;
      content += `  splitRatio: ${Number(data.layout.splitRatio.toFixed(3))}\n`;
    }
    if (data.chart?.size !== undefined) {
      content += `chart:\n`;
      content += `  size: ${data.chart.size}\n`;
    }
    content += '---\n\n';

    for (const category of data.categories) {
      content += `## ${category.name}\n`;
      for (const item of category.items) {
        content += `- [${item.tag}] ${item.name}: ${item.amount}\n`;
      }
      content += '\n';
    }

    return content;
  };

  it('preserves data through serialize → parse cycle', () => {
    const original: BudgetData = {
      type: 'budget',
      month: '2026-02',
      income: 8366,
      layout: { splitRatio: 0.37 },
      chart: { size: 360 },
      categories: [
        {
          name: 'Savings',
          items: [
            { tag: 'vault', name: 'Emergency Fund', amount: 500 },
            { tag: 'vault', name: 'Wedding Fund', amount: 828 },
          ]
        },
        {
          name: 'Investments',
          items: [
            { tag: 'roth', name: 'Fidelity Roth IRA', amount: 583 },
          ]
        }
      ]
    };

    const serialized = serialize(original);
    const parsed = parseBudgetMarkdown(serialized);

    expect(parsed).not.toBeNull();
    expect(parsed?.month).toBe(original.month);
    expect(parsed?.income).toBe(original.income);
    expect(parsed?.layout?.splitRatio).toBe(original.layout?.splitRatio);
    expect(parsed?.chart?.size).toBe(original.chart?.size);
    expect(parsed?.categories).toHaveLength(original.categories.length);
    
    for (let i = 0; i < original.categories.length; i++) {
      expect(parsed?.categories[i].name).toBe(original.categories[i].name);
      expect(parsed?.categories[i].items).toHaveLength(original.categories[i].items.length);
      
      for (let j = 0; j < original.categories[i].items.length; j++) {
        expect(parsed?.categories[i].items[j]).toEqual(original.categories[i].items[j]);
      }
    }
  });

  it('preserves totals through round-trip', () => {
    const original: BudgetData = {
      type: 'budget',
      month: '2026-02',
      income: 5000,
      categories: [
        {
          name: 'Test',
          items: [
            { tag: 'flex', name: 'Item 1', amount: 100 },
            { tag: 'flex', name: 'Item 2', amount: 200.50 },
          ]
        }
      ]
    };

    const originalTotals = calculateTotals(original);
    const parsed = parseBudgetMarkdown(serialize(original));
    const parsedTotals = calculateTotals(parsed!);

    expect(parsedTotals.income).toBe(originalTotals.income);
    expect(parsedTotals.totalAllocated).toBeCloseTo(originalTotals.totalAllocated, 2);
    expect(parsedTotals.unallocated).toBeCloseTo(originalTotals.unallocated, 2);
  });
});

describe('data mutation scenarios', () => {
  it('adding an item updates totals correctly', () => {
    const data: BudgetData = {
      type: 'budget',
      month: '2026-02',
      income: 5000,
      categories: [
        {
          name: 'Expenses',
          items: [{ tag: 'bill', name: 'Rent', amount: 1000 }]
        }
      ]
    };

    const beforeTotals = calculateTotals(data);
    expect(beforeTotals.totalAllocated).toBe(1000);

    // Simulate adding an item
    data.categories[0].items.push({ tag: 'bill', name: 'Utilities', amount: 150 });

    const afterTotals = calculateTotals(data);
    expect(afterTotals.totalAllocated).toBe(1150);
    expect(afterTotals.unallocated).toBe(3850);
  });

  it('deleting an item updates totals correctly', () => {
    const data: BudgetData = {
      type: 'budget',
      month: '2026-02',
      income: 5000,
      categories: [
        {
          name: 'Expenses',
          items: [
            { tag: 'bill', name: 'Rent', amount: 1000 },
            { tag: 'bill', name: 'Utilities', amount: 150 }
          ]
        }
      ]
    };

    const beforeTotals = calculateTotals(data);
    expect(beforeTotals.totalAllocated).toBe(1150);

    // Simulate deleting an item
    data.categories[0].items.splice(1, 1);

    const afterTotals = calculateTotals(data);
    expect(afterTotals.totalAllocated).toBe(1000);
    expect(afterTotals.unallocated).toBe(4000);
  });

  it('editing an amount updates totals correctly', () => {
    const data: BudgetData = {
      type: 'budget',
      month: '2026-02',
      income: 5000,
      categories: [
        {
          name: 'Expenses',
          items: [{ tag: 'bill', name: 'Rent', amount: 1000 }]
        }
      ]
    };

    const beforeTotals = calculateTotals(data);
    expect(beforeTotals.totalAllocated).toBe(1000);

    // Simulate editing amount
    data.categories[0].items[0].amount = 1200;

    const afterTotals = calculateTotals(data);
    expect(afterTotals.totalAllocated).toBe(1200);
    expect(afterTotals.unallocated).toBe(3800);
  });

  it('changing income updates unallocated correctly', () => {
    const data: BudgetData = {
      type: 'budget',
      month: '2026-02',
      income: 5000,
      categories: [
        {
          name: 'Expenses',
          items: [{ tag: 'bill', name: 'Rent', amount: 1000 }]
        }
      ]
    };

    const beforeTotals = calculateTotals(data);
    expect(beforeTotals.unallocated).toBe(4000);

    // Simulate income change
    data.income = 6000;

    const afterTotals = calculateTotals(data);
    expect(afterTotals.income).toBe(6000);
    expect(afterTotals.totalAllocated).toBe(1000);
    expect(afterTotals.unallocated).toBe(5000);
  });

  it('adding a category updates totals correctly', () => {
    const data: BudgetData = {
      type: 'budget',
      month: '2026-02',
      income: 5000,
      categories: [
        {
          name: 'Expenses',
          items: [{ tag: 'bill', name: 'Rent', amount: 1000 }]
        }
      ]
    };

    const beforeTotals = calculateTotals(data);
    expect(beforeTotals.totalAllocated).toBe(1000);

    // Add new category with items
    data.categories.push({
      name: 'Savings',
      items: [{ tag: 'vault', name: 'Emergency', amount: 500 }]
    });

    const afterTotals = calculateTotals(data);
    expect(afterTotals.totalAllocated).toBe(1500);
    expect(afterTotals.categoryTotals['Savings']).toBe(500);
    expect(afterTotals.categoryTotals['Expenses']).toBe(1000);
  });
});
