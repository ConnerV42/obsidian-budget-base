import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

interface BudgetHeaderProps {
  month: string;
  income: number;
  allocated: number;
  unallocated: number;
  onIncomeUpdate: (income: number) => void;
  onMonthUpdate: (month: string) => void;
}

export function BudgetHeader({
  month,
  income,
  allocated,
  unallocated,
  onIncomeUpdate,
  onMonthUpdate
}: BudgetHeaderProps) {
  const [isEditingIncome, setIsEditingIncome] = useState(false);
  const [incomeValue, setIncomeValue] = useState(income.toString());
  const [isEditingMonth, setIsEditingMonth] = useState(false);
  const [monthValue, setMonthValue] = useState(month);
  const incomeInputRef = useRef<HTMLInputElement>(null);
  const monthInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditingIncome || !incomeInputRef.current) {
      return;
    }

    const input = incomeInputRef.current;
    input.focus();
    const length = input.value.length;
    input.setSelectionRange(length, length);
  }, [isEditingIncome]);

  useEffect(() => {
    if (isEditingMonth && monthInputRef.current) {
      monthInputRef.current.focus();
    }
  }, [isEditingMonth]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatMonth = (monthStr: string) => {
    const [year, monthNum] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(monthNum) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const handleIncomeSave = () => {
    const newIncome = parseFloat(incomeValue.replace(/[^0-9.]/g, ''));
    setIsEditingIncome(false);
    if (!isNaN(newIncome)) {
      onIncomeUpdate(newIncome);
    }
  };

  const handleMonthSave = () => {
    setIsEditingMonth(false);
    if (monthValue.trim()) {
      onMonthUpdate(monthValue.trim());
    }
  };

  const handleIncomeKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleIncomeSave();
    } else if (e.key === 'Escape') {
      setIncomeValue(income.toString());
      setIsEditingIncome(false);
    }
  };

  const handleMonthKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleMonthSave();
    } else if (e.key === 'Escape') {
      setMonthValue(month);
      setIsEditingMonth(false);
    }
  };

  const percentAllocated = income > 0 ? (allocated / income) * 100 : 0;

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

      <div className="budget-header-stats">
        <div className="budget-stat budget-stat-income">
          <span className="budget-stat-label">Income</span>
          {isEditingIncome ? (
            <input
              ref={incomeInputRef}
              type="text"
              className="budget-stat-input budget-inline-edit-input"
              value={incomeValue}
              size={Math.min(Math.max(incomeValue.length, 4), 10)}
              enterKeyHint="done"
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
              onInput={(e) => setIncomeValue((e.target as HTMLInputElement).value)}
              onBlur={handleIncomeSave}
              onKeyDown={handleIncomeKeyDown}
            />
          ) : (
            <span 
              className="budget-stat-value clickable"
              onClick={() => {
                setIncomeValue(income.toString());
                setIsEditingIncome(true);
              }}
              title="Click to edit"
            >
              {formatCurrency(income)}
            </span>
          )}
        </div>

        <div className="budget-stat budget-stat-allocated">
          <span className="budget-stat-label">Allocated</span>
          <span className="budget-stat-value">
            {formatCurrency(allocated)} <span className="budget-stat-percent">({percentAllocated.toFixed(0)}%)</span>
          </span>
        </div>

        <div className={`budget-stat budget-stat-remaining ${unallocated < 0 ? 'negative' : ''}`}>
          <span className="budget-stat-label">{unallocated >= 0 ? 'Remaining' : 'Over Budget'}</span>
          <span className="budget-stat-value">{formatCurrency(Math.abs(unallocated))}</span>
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
