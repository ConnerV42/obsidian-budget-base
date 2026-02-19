import { describe, expect, it } from 'vitest';
import { applyComputedIncome, computeCompensation, createStarterCompensationZero, normalizeCompensation } from './compensation';
import type { BudgetData, CompensationData } from './parser';

describe('compensation math', () => {
  it('computes starter scaffold as all zeros', () => {
    const starter = createStarterCompensationZero();
    const computed = computeCompensation(starter);

    expect(computed.gross).toBe(0);
    expect(computed.taxAmount).toBe(0);
    expect(computed.retirementAmount).toBe(0);
    expect(computed.totalDeductions).toBe(0);
    expect(computed.takeHome).toBe(0);
  });

  it('computes tax and retirement deductions from basis-point percentages', () => {
    const compensation: CompensationData = {
      version: 2,
      gross: 1000,
      taxPercentBps: 2275,
      retirementPercentBps: 1600
    };

    const computed = computeCompensation(compensation);
    expect(computed.taxAmount).toBe(227.5);
    expect(computed.retirementAmount).toBe(160);
    expect(computed.totalDeductions).toBe(387.5);
    expect(computed.takeHome).toBe(612.5);
  });

  it('flags negative take-home when combined percentages exceed gross', () => {
    const computed = computeCompensation({
      version: 2,
      gross: 1000,
      taxPercentBps: 7000,
      retirementPercentBps: 4000
    });

    expect(computed.takeHome).toBe(-100);
    expect(computed.negativeTakeHome).toBe(true);
  });
});

describe('compensation normalization', () => {
  it('clamps gross and percent values to valid ranges', () => {
    const normalized = normalizeCompensation({
      version: 2,
      gross: -100,
      taxPercentBps: 20000,
      retirementPercentBps: -40
    });

    expect(normalized.gross).toBe(0);
    expect(normalized.taxPercentBps).toBe(10000);
    expect(normalized.retirementPercentBps).toBe(0);
  });
});

describe('income application', () => {
  it('applies computed take-home to budget income', () => {
    const data: BudgetData = {
      type: 'budget',
      month: '2026-02',
      income: 0,
      categories: []
    };

    const next = applyComputedIncome(data, {
      version: 2,
      gross: 5000,
      taxPercentBps: 2000,
      retirementPercentBps: 500
    });

    expect(next.income).toBe(3750);
    expect(next.compensation).toBeDefined();
    expect(next.compensation?.gross).toBe(5000);
    expect(next.compensation?.taxPercentBps).toBe(2000);
    expect(next.compensation?.retirementPercentBps).toBe(500);
  });
});
