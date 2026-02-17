import { describe, expect, it } from 'vitest';
import { getCurrentMonthBudgetName, orderBudgetFileCandidates } from './budgetFileSelection';

describe('budget file selection', () => {
  it('formats current month budget name', () => {
    const date = new Date('2026-02-14T12:00:00Z');
    expect(getCurrentMonthBudgetName(date)).toBe('2026-02-budget.md');
  });

  it('orders current month candidates before recency fallback', () => {
    const files = [
      { name: '2026-01-budget.md', stat: { mtime: 300 } },
      { name: '2026-02-budget.md', stat: { mtime: 100 } },
      { name: '2026-03-budget.md', stat: { mtime: 400 } },
      { name: '2026-02-budget.md', stat: { mtime: 200 } }
    ];

    const ordered = orderBudgetFileCandidates(files, '2026-02-budget.md');

    expect(ordered.map(file => `${file.name}:${file.stat.mtime}`)).toEqual([
      '2026-02-budget.md:200',
      '2026-02-budget.md:100',
      '2026-03-budget.md:400',
      '2026-01-budget.md:300'
    ]);
  });
});
