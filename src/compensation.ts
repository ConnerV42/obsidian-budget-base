import type { BudgetData, CompensationData } from './parser';

const MIN_PERCENT_BPS = 0;
const MAX_PERCENT_BPS = 10000;

function toFiniteNumber(value: unknown): number {
  const parsed = typeof value === 'number'
    ? value
    : Number(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNonNegativeNumber(value: unknown): number {
  return Math.max(0, toFiniteNumber(value));
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function toCents(value: number): number {
  return Math.round(roundToCents(value) * 100);
}

function fromCents(value: number): number {
  return roundToCents(value / 100);
}

export function clampPercentBps(value: unknown): number {
  const parsed = Math.round(toFiniteNumber(value));
  return Math.max(MIN_PERCENT_BPS, Math.min(MAX_PERCENT_BPS, parsed));
}

export function normalizeCompensation(compensation: CompensationData): CompensationData {
  return {
    version: 2,
    gross: roundToCents(toNonNegativeNumber(compensation.gross)),
    taxPercentBps: clampPercentBps(compensation.taxPercentBps),
    retirementPercentBps: clampPercentBps(compensation.retirementPercentBps)
  };
}

export interface CompensationComputation {
  gross: number;
  taxPercentBps: number;
  retirementPercentBps: number;
  taxAmount: number;
  retirementAmount: number;
  totalDeductions: number;
  takeHome: number;
  negativeTakeHome: boolean;
}

export function computeCompensation(compensation: CompensationData): CompensationComputation {
  const normalized = normalizeCompensation(compensation);
  const grossCents = toCents(normalized.gross);
  const taxCents = Math.round((grossCents * normalized.taxPercentBps) / 10000);
  const retirementCents = Math.round((grossCents * normalized.retirementPercentBps) / 10000);
  const totalDeductionCents = taxCents + retirementCents;

  const takeHomeCents = grossCents - totalDeductionCents;

  return {
    gross: fromCents(grossCents),
    taxPercentBps: normalized.taxPercentBps,
    retirementPercentBps: normalized.retirementPercentBps,
    taxAmount: fromCents(taxCents),
    retirementAmount: fromCents(retirementCents),
    totalDeductions: fromCents(totalDeductionCents),
    takeHome: fromCents(takeHomeCents),
    negativeTakeHome: takeHomeCents < 0
  };
}

export function createStarterCompensationZero(): CompensationData {
  return {
    version: 2,
    gross: 0,
    taxPercentBps: 0,
    retirementPercentBps: 0
  };
}

export function cloneCompensation(compensation: CompensationData): CompensationData {
  return {
    version: compensation.version,
    gross: compensation.gross,
    taxPercentBps: compensation.taxPercentBps,
    retirementPercentBps: compensation.retirementPercentBps
  };
}

export function applyComputedIncome(data: BudgetData, compensation: CompensationData): BudgetData {
  const normalized = normalizeCompensation(compensation);
  const computed = computeCompensation(normalized);
  return {
    ...data,
    compensation: normalized,
    income: computed.takeHome
  };
}
