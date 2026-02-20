import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { CompensationComputation } from '../compensation';
import type { CompensationData } from '../parser';

interface BudgetHeaderProps {
  month: string;
  paycheckDate?: string;
  takeHome: number;
  allocated: number;
  unallocated: number;
  compensation: CompensationData;
  compensationComputation: CompensationComputation;
  isCompensationVirtual: boolean;
  onCompensationChange: (update: (prev: CompensationData) => CompensationData) => void;
  onPaycheckDateUpdate: (paycheckDate: string | undefined) => void;
}

type EditableCompensationField = 'gross' | 'taxPercentBps' | 'retirementPercentBps';
const YEAR_MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const YEAR_MONTH_DAY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function parseIsoDateToken(value: string): { year: number; month: number; day: number } | null {
  const match = value.match(YEAR_MONTH_DAY_PATTERN);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function parseYearMonthToken(value: string): { year: number; month: number } | null {
  const match = value.match(YEAR_MONTH_PATTERN);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

function toOrdinalDay(day: number): string {
  const remainderTen = day % 10;
  const remainderHundred = day % 100;
  if (remainderTen === 1 && remainderHundred !== 11) return `${day}st`;
  if (remainderTen === 2 && remainderHundred !== 12) return `${day}nd`;
  if (remainderTen === 3 && remainderHundred !== 13) return `${day}rd`;
  return `${day}th`;
}

function parseNonNegativeDecimal(raw: string): number {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) return 0;
  const firstDot = cleaned.indexOf('.');
  const normalized = firstDot === -1
    ? cleaned
    : `${cleaned.slice(0, firstDot + 1)}${cleaned.slice(firstDot + 1).replace(/\./g, '')}`;
  if (!normalized || normalized === '.') return 0;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function parseAmountInput(raw: string): number {
  return Math.round(parseNonNegativeDecimal(raw) * 100) / 100;
}

function parsePercentBpsInput(raw: string): number {
  const percent = Math.min(100, parseNonNegativeDecimal(raw));
  return Math.round(percent * 100);
}

function formatPercentBps(percentBps: number): string {
  return (percentBps / 100).toFixed(2);
}

export function BudgetHeader({
  month,
  paycheckDate,
  takeHome,
  allocated,
  unallocated,
  compensation,
  compensationComputation,
  isCompensationVirtual,
  onCompensationChange,
  onPaycheckDateUpdate
}: BudgetHeaderProps) {
  const [isEditingBudgetDate, setIsEditingBudgetDate] = useState(false);
  const [budgetDateValue, setBudgetDateValue] = useState(paycheckDate || '');
  const [editingField, setEditingField] = useState<EditableCompensationField | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editStartValue, setEditStartValue] = useState<number | null>(null);
  const budgetDateInputRef = useRef<HTMLInputElement>(null);
  const compensationInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingBudgetDate && budgetDateInputRef.current) {
      budgetDateInputRef.current.focus();
    }
  }, [isEditingBudgetDate]);

  useEffect(() => {
    if (!isEditingBudgetDate) {
      const fallbackMonth = parseYearMonthToken(month);
      const fallbackDate = fallbackMonth
        ? `${fallbackMonth.year}-${String(fallbackMonth.month).padStart(2, '0')}-01`
        : '';
      setBudgetDateValue(paycheckDate || fallbackDate);
    }
  }, [paycheckDate, month, isEditingBudgetDate]);

  useEffect(() => {
    if (!editingField || !compensationInputRef.current) {
      return;
    }

    const input = compensationInputRef.current;
    input.focus();
    const length = input.value.length;
    input.setSelectionRange(length, length);
  }, [editingField]);

  const formatCurrencyStats = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatCurrencyRead = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatPercentRead = (percentBps: number) => `${Math.round(percentBps / 100)}%`;

  const formatMonth = (monthStr: string) => {
    const [year, monthNum] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(monthNum) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const formatBudgetDate = (value: string | undefined, monthValue: string) => {
    if (!value) {
      return formatMonth(monthValue);
    }
    const token = parseIsoDateToken(value);
    if (!token) {
      return formatMonth(monthValue);
    }
    const monthLabel = new Date(token.year, token.month - 1, token.day).toLocaleDateString('en-US', {
      month: 'long'
    });
    return `${monthLabel} ${toOrdinalDay(token.day)}, ${token.year}`;
  };

  const handleBudgetDateSave = () => {
    setIsEditingBudgetDate(false);
    const trimmed = budgetDateValue.trim();

    if (!trimmed) {
      onPaycheckDateUpdate(undefined);
      return;
    }

    if (parseIsoDateToken(trimmed)) {
      onPaycheckDateUpdate(trimmed);
      return;
    }

    const fallbackMonth = parseYearMonthToken(month);
    const fallbackDate = fallbackMonth
      ? `${fallbackMonth.year}-${String(fallbackMonth.month).padStart(2, '0')}-01`
      : '';
    setBudgetDateValue(paycheckDate || fallbackDate);
  };

  const clearCompensationEditState = () => {
    setEditingField(null);
    setEditValue('');
    setEditStartValue(null);
  };

  const beginCompensationEdit = (field: EditableCompensationField) => {
    const value = compensation[field];
    setEditingField(field);
    setEditStartValue(value);
    setEditValue(field === 'gross' ? value.toFixed(2) : formatPercentBps(value));
  };

  const commitCompensationEdit = () => {
    clearCompensationEditState();
  };

  const cancelCompensationEdit = () => {
    if (editingField && editStartValue !== null) {
      onCompensationChange((prev) => ({
        ...prev,
        [editingField]: editStartValue
      }));
    }
    clearCompensationEditState();
  };

  const applyCompensationDraft = (raw: string) => {
    if (!editingField) return;

    setEditValue(raw);
    if (editingField === 'gross') {
      onCompensationChange((prev) => ({ ...prev, gross: parseAmountInput(raw) }));
      return;
    }

    const nextPercentBps = parsePercentBpsInput(raw);
    if (editingField === 'taxPercentBps') {
      onCompensationChange((prev) => ({ ...prev, taxPercentBps: nextPercentBps }));
      return;
    }

    onCompensationChange((prev) => ({ ...prev, retirementPercentBps: nextPercentBps }));
  };

  const handleCompensationInputKeyDown = (
    event: h.JSX.TargetedKeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      (event.currentTarget as HTMLInputElement).blur();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancelCompensationEdit();
      (event.currentTarget as HTMLInputElement).blur();
    }
  };

  const handleCompensationValueKeyDown = (
    event: h.JSX.TargetedKeyboardEvent<HTMLSpanElement>,
    field: EditableCompensationField
  ) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    beginCompensationEdit(field);
  };

  const handleBudgetDateInputKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBudgetDateSave();
    } else if (e.key === 'Escape') {
      const fallbackMonth = parseYearMonthToken(month);
      const fallbackDate = fallbackMonth
        ? `${fallbackMonth.year}-${String(fallbackMonth.month).padStart(2, '0')}-01`
        : '';
      setBudgetDateValue(paycheckDate || fallbackDate);
      setIsEditingBudgetDate(false);
    }
  };

  const handleBudgetDateValueKeyDown = (event: h.JSX.TargetedKeyboardEvent<HTMLHeadingElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    const fallbackMonth = parseYearMonthToken(month);
    const fallbackDate = fallbackMonth
      ? `${fallbackMonth.year}-${String(fallbackMonth.month).padStart(2, '0')}-01`
      : '';
    setBudgetDateValue(paycheckDate || fallbackDate);
    setIsEditingBudgetDate(true);
  };

  const percentAllocated = takeHome > 0 ? (allocated / takeHome) * 100 : 0;

  return (
    <div className="budget-header">
      <div className="budget-header-top">
        <div className="budget-header-title">
          {isEditingBudgetDate ? (
            <input
              ref={budgetDateInputRef}
              type="date"
              className="budget-month-input budget-inline-edit-input"
              value={budgetDateValue}
              onInput={(event) => setBudgetDateValue((event.target as HTMLInputElement).value)}
              onBlur={handleBudgetDateSave}
              onKeyDown={handleBudgetDateInputKeyDown}
              aria-label="Budget date"
            />
          ) : (
            <h1
              className="clickable budget-header-date-title"
              role="button"
              tabIndex={0}
              onClick={() => {
                const fallbackMonth = parseYearMonthToken(month);
                const fallbackDate = fallbackMonth
                  ? `${fallbackMonth.year}-${String(fallbackMonth.month).padStart(2, '0')}-01`
                  : '';
                setBudgetDateValue(paycheckDate || fallbackDate);
                setIsEditingBudgetDate(true);
              }}
              onKeyDown={handleBudgetDateValueKeyDown}
              title="Click to change budget date"
              aria-label="Edit budget date"
            >
              {formatBudgetDate(paycheckDate, month)} Budget
            </h1>
          )}
        </div>
      </div>

      {isCompensationVirtual && (
        <div className="budget-header-comp-notice">
          First edit initializes compensation frontmatter.
        </div>
      )}

      {compensationComputation.negativeTakeHome && (
        <div className="budget-header-comp-warning" role="alert">
          Take-home is negative. Reduce tax/retirement percentages or increase gross.
        </div>
      )}

      <div className="budget-header-equation" aria-label="Compensation equation">
        <div className="budget-equation-line">
          <span className="budget-equation-term budget-equation-term-gross">
            <span className="budget-equation-inline-label">Gross</span>
            {editingField === 'gross' ? (
              <input
                ref={compensationInputRef}
                type="text"
                inputMode="decimal"
                className="budget-comp-input-inline budget-inline-edit-input"
                value={editValue}
                size={Math.min(Math.max(editValue.length, 4), 14)}
                onInput={(e) => applyCompensationDraft((e.target as HTMLInputElement).value)}
                onBlur={commitCompensationEdit}
                onKeyDown={handleCompensationInputKeyDown}
                aria-label="Gross pay"
              />
            ) : (
              <span
                role="button"
                tabIndex={0}
                className="budget-comp-value budget-comp-value-clickable budget-equation-inline-value"
                onClick={() => beginCompensationEdit('gross')}
                onKeyDown={(event) => handleCompensationValueKeyDown(event, 'gross')}
                aria-label="Edit gross pay"
              >
                {formatCurrencyRead(compensationComputation.gross)}
              </span>
            )}
          </span>

          <span className="budget-equation-op" aria-hidden="true">-</span>

          <span className="budget-equation-term budget-equation-term-tax">
            <span className="budget-equation-inline-label">Tax</span>
            <span className="budget-equation-inline-group">
              <span className="budget-equation-paren" aria-hidden="true">(</span>
              {editingField === 'taxPercentBps' ? (
                <input
                  ref={compensationInputRef}
                  type="text"
                  inputMode="decimal"
                  className="budget-comp-input-inline budget-comp-input-inline-percent budget-inline-edit-input"
                  value={editValue}
                  size={Math.min(Math.max(editValue.length, 4), 7)}
                  onInput={(e) => applyCompensationDraft((e.target as HTMLInputElement).value)}
                  onBlur={commitCompensationEdit}
                  onKeyDown={handleCompensationInputKeyDown}
                  aria-label="Tax percent"
                />
              ) : (
                <span
                  role="button"
                  tabIndex={0}
                  className="budget-comp-value budget-comp-value-clickable budget-equation-inline-value"
                  onClick={() => beginCompensationEdit('taxPercentBps')}
                  onKeyDown={(event) => handleCompensationValueKeyDown(event, 'taxPercentBps')}
                  aria-label="Edit tax percent"
                >
                  {formatPercentRead(compensation.taxPercentBps)}
                </span>
              )}
              <span className="budget-equation-equals" aria-hidden="true">=</span>
              <span className="budget-equation-inline-value">{formatCurrencyRead(compensationComputation.taxAmount)}</span>
              <span className="budget-equation-paren" aria-hidden="true">)</span>
            </span>
          </span>

          <span className="budget-equation-op" aria-hidden="true">-</span>

          <span className="budget-equation-term budget-equation-term-retirement">
            <span className="budget-equation-inline-label">Retirement</span>
            <span className="budget-equation-inline-group">
              <span className="budget-equation-paren" aria-hidden="true">(</span>
              {editingField === 'retirementPercentBps' ? (
                <input
                  ref={compensationInputRef}
                  type="text"
                  inputMode="decimal"
                  className="budget-comp-input-inline budget-comp-input-inline-percent budget-inline-edit-input"
                  value={editValue}
                  size={Math.min(Math.max(editValue.length, 4), 7)}
                  onInput={(e) => applyCompensationDraft((e.target as HTMLInputElement).value)}
                  onBlur={commitCompensationEdit}
                  onKeyDown={handleCompensationInputKeyDown}
                  aria-label="Retirement percent"
                />
              ) : (
                <span
                  role="button"
                  tabIndex={0}
                  className="budget-comp-value budget-comp-value-clickable budget-equation-inline-value"
                  onClick={() => beginCompensationEdit('retirementPercentBps')}
                  onKeyDown={(event) => handleCompensationValueKeyDown(event, 'retirementPercentBps')}
                  aria-label="Edit retirement percent"
                >
                  {formatPercentRead(compensation.retirementPercentBps)}
                </span>
              )}
              <span className="budget-equation-equals" aria-hidden="true">=</span>
              <span className="budget-equation-inline-value">{formatCurrencyRead(compensationComputation.retirementAmount)}</span>
              <span className="budget-equation-paren" aria-hidden="true">)</span>
            </span>
          </span>

          <span className="budget-equation-op" aria-hidden="true">=</span>

          <span className="budget-equation-term budget-equation-term-takehome">
            <span className="budget-equation-inline-label">Take-home</span>
            <span className="budget-equation-inline-value">{formatCurrencyRead(compensationComputation.takeHome)}</span>
          </span>

          <span className="budget-equation-separator" aria-hidden="true">|</span>

          <span className="budget-equation-term budget-equation-term-allocated">
            <span className="budget-equation-inline-label">Allocated</span>
            <span className="budget-equation-inline-value">
              {formatCurrencyStats(allocated)} <span className="budget-equation-inline-percent">({percentAllocated.toFixed(0)}%)</span>
            </span>
          </span>

          <span className="budget-equation-separator" aria-hidden="true">|</span>

          <span className={`budget-equation-term budget-equation-term-remaining ${unallocated < 0 ? 'negative' : ''}`}>
            <span className="budget-equation-inline-label">{unallocated >= 0 ? 'Remaining' : 'Over Budget'}</span>
            <span className="budget-equation-inline-value">{formatCurrencyStats(Math.abs(unallocated))}</span>
          </span>
        </div>
      </div>

      <div className="budget-header-bar">
        <div
          className="budget-header-bar-fill"
          style={{ width: `${Math.min(percentAllocated, 100)}%` }}
        />
        {percentAllocated > 100 && (
          <div 
            className="budget-header-bar-over"
            style={{ width: `${Math.min(percentAllocated - 100, 100)}%` }}
          />
        )}
      </div>
    </div>
  );
}
