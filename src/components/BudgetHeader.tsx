import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { CompensationComputation } from '../compensation';
import type { CompensationData } from '../parser';

interface BudgetHeaderProps {
  month: string;
  takeHome: number;
  allocated: number;
  unallocated: number;
  compensation: CompensationData;
  compensationComputation: CompensationComputation;
  isCompensationVirtual: boolean;
  onCompensationChange: (update: (prev: CompensationData) => CompensationData) => void;
  onMonthUpdate: (month: string) => void;
}

type EditableCompensationField = 'gross' | 'taxPercentBps' | 'retirementPercentBps';

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
  takeHome,
  allocated,
  unallocated,
  compensation,
  compensationComputation,
  isCompensationVirtual,
  onCompensationChange,
  onMonthUpdate
}: BudgetHeaderProps) {
  const [isEditingMonth, setIsEditingMonth] = useState(false);
  const [monthValue, setMonthValue] = useState(month);
  const [editingField, setEditingField] = useState<EditableCompensationField | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editStartValue, setEditStartValue] = useState<number | null>(null);
  const monthInputRef = useRef<HTMLInputElement>(null);
  const compensationInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingMonth && monthInputRef.current) {
      monthInputRef.current.focus();
    }
  }, [isEditingMonth]);

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

  const handleMonthSave = () => {
    setIsEditingMonth(false);
    if (monthValue.trim()) {
      onMonthUpdate(monthValue.trim());
    }
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

  const handleMonthKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleMonthSave();
    } else if (e.key === 'Escape') {
      setMonthValue(month);
      setIsEditingMonth(false);
    }
  };

  const percentAllocated = takeHome > 0 ? (allocated / takeHome) * 100 : 0;

  return (
    <div className="budget-header">
      <div className="budget-header-top">
        <div className="budget-header-title">
          {isEditingMonth ? (
            <input
              ref={monthInputRef}
              type="month"
              className="budget-month-input budget-inline-edit-input"
              value={monthValue}
              onInput={(e) => setMonthValue((e.target as HTMLInputElement).value)}
              onBlur={handleMonthSave}
              onKeyDown={handleMonthKeyDown}
            />
          ) : (
            <h1
              className="clickable"
              onClick={() => {
                setMonthValue(month);
                setIsEditingMonth(true);
              }}
              title="Click to change month"
            >
              {formatMonth(month)} Budget
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
