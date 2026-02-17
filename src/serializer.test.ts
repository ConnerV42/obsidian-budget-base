import { describe, expect, it } from 'vitest';
import { parseBudgetMarkdown, serializeBudgetMarkdown, BudgetData } from './parser';

describe('serializeBudgetMarkdown', () => {
  it('roundtrips core budget fields', () => {
    const data: BudgetData = {
      type: 'budget',
      month: '2026-02',
      income: 5000,
      layout: { splitRatio: 0.39 },
      chart: { size: 320 },
      categories: [
        {
          name: 'Savings',
          items: [{ tag: 'vault', name: 'Emergency', amount: 500 }]
        }
      ]
    };

    const serialized = serializeBudgetMarkdown(data);
    const parsed = parseBudgetMarkdown(serialized);

    expect(parsed).not.toBeNull();
    expect(parsed?.income).toBe(data.income);
    expect(parsed?.month).toBe(data.month);
    expect(parsed?.layout?.splitRatio).toBe(data.layout?.splitRatio);
    expect(parsed?.chart?.size).toBe(data.chart?.size);
  });

  it('roundtrips normalized tag colors', () => {
    const data: BudgetData = {
      type: 'budget',
      month: '2026-02',
      income: 5000,
      tagColors: {
        'fixed expenses': '#dc2626',
        'Needs/Wants': '#8b5cf6'
      },
      categories: [
        {
          name: 'Items',
          items: [{ tag: 'Fixed Expenses', name: 'Mortgage', amount: 1800 }]
        }
      ]
    };

    const serialized = serializeBudgetMarkdown(data);
    const parsed = parseBudgetMarkdown(serialized);

    expect(parsed?.tagColors).toEqual({
      'Fixed expenses': '#dc2626',
      'Needs/wants': '#8b5cf6'
    });
  });

  it('keeps special characters and decimals in item lines', () => {
    const data: BudgetData = {
      type: 'budget',
      month: '2026-02',
      income: 5000,
      categories: [
        {
          name: 'Test & More (stuff)',
          items: [
            { tag: 'sub', name: "O'Reilly & Sons", amount: 100 },
            { tag: 'sub', name: 'AT&T (Mobile)', amount: 80 },
            { tag: 'sub', name: 'Netflix', amount: 15.99 }
          ]
        }
      ]
    };

    const serialized = serializeBudgetMarkdown(data);
    const parsed = parseBudgetMarkdown(serialized);

    expect(parsed?.categories[0].name).toBe('Test & More (stuff)');
    expect(parsed?.categories[0].items[0].name).toBe("O'Reilly & Sons");
    expect(parsed?.categories[0].items[1].name).toBe('AT&T (Mobile)');
    expect(parsed?.categories[0].items[2].amount).toBe(15.99);
  });

  it('supports empty categories and zero amounts', () => {
    const data: BudgetData = {
      type: 'budget',
      month: '2026-02',
      income: 5000,
      categories: [
        { name: 'Empty', items: [] },
        { name: 'Has Items', items: [{ tag: 'flex', name: 'Free Thing', amount: 0 }] }
      ]
    };

    const serialized = serializeBudgetMarkdown(data);
    const parsed = parseBudgetMarkdown(serialized);

    expect(parsed?.categories).toHaveLength(2);
    expect(parsed?.categories[0].items).toHaveLength(0);
    expect(parsed?.categories[1].items[0].amount).toBe(0);
  });

  it('roundtrips many items without dropping entries', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      tag: 'flex',
      name: `Item ${i + 1}`,
      amount: (i + 1) * 10
    }));

    const data: BudgetData = {
      type: 'budget',
      month: '2026-02',
      income: 50000,
      categories: [{ name: 'Many Items', items }]
    };

    const serialized = serializeBudgetMarkdown(data);
    const parsed = parseBudgetMarkdown(serialized);

    expect(parsed?.categories[0].items).toHaveLength(50);
    expect(parsed?.categories[0].items[0].amount).toBe(10);
    expect(parsed?.categories[0].items[49].amount).toBe(500);
  });

  it('includes expected top-level frontmatter fields', () => {
    const data: BudgetData = {
      type: 'budget',
      month: '2026-02',
      income: 8366,
      layout: { splitRatio: 0.31 },
      chart: { size: 280 },
      categories: [
        {
          name: 'Savings',
          items: [
            { tag: 'vault', name: 'Emergency Fund', amount: 500 },
            { tag: 'vault', name: 'Wedding Fund', amount: 828 }
          ]
        }
      ]
    };

    const serialized = serializeBudgetMarkdown(data);

    expect(serialized).toContain('type:');
    expect(serialized).toContain('month:');
    expect(serialized).toContain('income: 8366');
    expect(serialized).toContain('layout:');
    expect(serialized).toContain('splitRatio: 0.31');
    expect(serialized).toContain('chart:');
    expect(serialized).toContain('size: 280');
  });

  it('preserves unknown top-level and nested frontmatter keys across updates', () => {
    const source = `---
type: budget
month: 2026-02
income: 5000
currency: USD
rollover: true
layout:
  splitRatio: 0.31
  minSidebar: 260
chart:
  size: 280
  theme: mono
---

## Items
- [bill] Rent: 1800
`;

    const parsed = parseBudgetMarkdown(source);
    expect(parsed).not.toBeNull();

    const updated: BudgetData = {
      ...parsed!,
      income: 6100,
      layout: { splitRatio: 0.42 },
      chart: { size: 320 }
    };

    const serialized = serializeBudgetMarkdown(updated);

    expect(serialized).toContain('currency: "USD"');
    expect(serialized).toContain('rollover: true');
    expect(serialized).toContain('layout:');
    expect(serialized).toContain('minSidebar: 260');
    expect(serialized).toContain('splitRatio: 0.42');
    expect(serialized).toContain('chart:');
    expect(serialized).toContain('theme: "mono"');
    expect(serialized).toContain('size: 320');
  });

  it('preserves unknown nested tagColors keys when writing normalized colors', () => {
    const source = `---
type: budget
month: 2026-02
income: 5000
tagColors:
  flex: "#8b5cf6"
  metadata: true
---

## Items
- [flex] Groceries: 400
`;

    const parsed = parseBudgetMarkdown(source);
    expect(parsed).not.toBeNull();

    const updated: BudgetData = {
      ...parsed!,
      tagColors: {
        ...(parsed!.tagColors || {}),
        Flex: '#123456'
      }
    };

    const serialized = serializeBudgetMarkdown(updated);
    expect(serialized).toContain('metadata: true');
    expect(serialized).toContain('Flex: "#123456"');
  });
});
