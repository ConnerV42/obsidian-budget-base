// @vitest-environment jsdom
import { h } from 'preact';
import { useState } from 'preact/hooks';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/preact';
import { computeCompensation } from '../compensation';
import type { CompensationData } from '../parser';
import { BudgetHeader } from './BudgetHeader';

function BudgetHeaderHarness() {
  const [compensation, setCompensation] = useState<CompensationData>({
    version: 2,
    gross: 13541,
    taxPercentBps: 2300,
    retirementPercentBps: 1600
  });
  const computation = computeCompensation(compensation);

  return (
    <BudgetHeader
      month="2026-03"
      takeHome={computation.takeHome}
      allocated={7571.34}
      unallocated={computation.takeHome - 7571.34}
      compensation={compensation}
      compensationComputation={computation}
      isCompensationVirtual={false}
      onCompensationChange={(update) => {
        setCompensation((prev) => update(prev));
      }}
      onMonthUpdate={() => {}}
    />
  );
}

describe('BudgetHeader compensation equation', () => {
  it('renders read mode by default with compact precision', () => {
    const { container } = render(<BudgetHeaderHarness />);
    const equation = screen.getByLabelText('Compensation equation');
    const line = equation.querySelector('.budget-equation-line');

    expect(screen.queryByLabelText('Gross pay')).toBeNull();
    expect(screen.queryByLabelText('Tax percent')).toBeNull();
    expect(screen.queryByLabelText('Retirement percent')).toBeNull();
    expect(container.querySelector('.budget-stat-income')).toBeNull();
    expect(container.querySelector('.budget-header-stats')).toBeNull();
    expect(line).toBeTruthy();

    const grossButton = within(equation).getByRole('button', { name: 'Edit gross pay' });
    const taxButton = within(equation).getByRole('button', { name: 'Edit tax percent' });
    const retirementButton = within(equation).getByRole('button', { name: 'Edit retirement percent' });

    expect(grossButton.textContent).toBe('$13,541');
    expect(taxButton.textContent).toBe('23%');
    expect(retirementButton.textContent).toBe('16%');
    expect(grossButton.className).toContain('budget-comp-value');
    expect(taxButton.className).toContain('budget-comp-value');
    expect(retirementButton.className).toContain('budget-comp-value');
    expect(equation.textContent).toContain('$3,114');
    expect(equation.textContent).toContain('$2,167');
    expect(equation.textContent).toContain('$8,260');
    expect(equation.textContent).toContain('Allocated');
    expect(equation.textContent).toContain('$7,571.34');
    expect(equation.textContent).toContain('(92%)');
    expect(equation.textContent).toContain('Remaining');
    expect(equation.textContent).toContain('$688.67');
    expect(equation.textContent).toMatch(/\(\s*23%\s*=\s*\$3,114\s*\)/);
    expect(equation.textContent).toMatch(/\(\s*16%\s*=\s*\$2,167\s*\)/);
    expect(equation.textContent).not.toContain('$3,114.43');
    expect(equation.textContent).not.toContain('$2,166.56');
    expect(equation.textContent).not.toContain('$8,260.01');
  });

  it('enters edit mode for a single field and shows high precision while editing', () => {
    render(<BudgetHeaderHarness />);
    const equation = screen.getByLabelText('Compensation equation');

    fireEvent.click(within(equation).getByRole('button', { name: 'Edit gross pay' }));
    const grossInput = screen.getByLabelText('Gross pay') as HTMLInputElement;
    expect(grossInput.value).toBe('13541.00');

    fireEvent.input(grossInput, { target: { value: '13541.25' } });
    expect(grossInput.value).toBe('13541.25');

    fireEvent.click(within(equation).getByRole('button', { name: 'Edit tax percent' }));
    expect(screen.queryByLabelText('Gross pay')).toBeNull();
    expect(screen.getByLabelText('Tax percent')).toBeTruthy();
  });

  it('reverts field changes on Escape and keeps prior read-mode value', () => {
    render(<BudgetHeaderHarness />);
    const equation = screen.getByLabelText('Compensation equation');

    fireEvent.click(within(equation).getByRole('button', { name: 'Edit tax percent' }));
    const taxInput = screen.getByLabelText('Tax percent') as HTMLInputElement;
    expect(taxInput.value).toBe('23.00');

    fireEvent.input(taxInput, { target: { value: '24.75' } });
    fireEvent.keyDown(taxInput, { key: 'Escape' });

    expect(screen.queryByLabelText('Tax percent')).toBeNull();
    const taxButton = within(equation).getByRole('button', { name: 'Edit tax percent' });
    expect(taxButton.textContent).toBe('23%');
  });

  it('enters edit mode from keyboard activation on read values', () => {
    render(<BudgetHeaderHarness />);
    const equation = screen.getByLabelText('Compensation equation');

    const taxValue = within(equation).getByRole('button', { name: 'Edit tax percent' });
    fireEvent.keyDown(taxValue, { key: 'Enter' });
    expect(screen.getByLabelText('Tax percent')).toBeTruthy();

    const retirementValue = within(equation).getByRole('button', { name: 'Edit retirement percent' });
    fireEvent.keyDown(retirementValue, { key: ' ' });
    expect(screen.getByLabelText('Retirement percent')).toBeTruthy();
  });

  it('groups compensation equation into one inline expression with separators', () => {
    render(<BudgetHeaderHarness />);
    const equation = screen.getByLabelText('Compensation equation');
    const line = equation.querySelector('.budget-equation-line');
    const grossTerm = equation.querySelector('.budget-equation-term-gross');
    const taxTerm = equation.querySelector('.budget-equation-term-tax');
    const retirementTerm = equation.querySelector('.budget-equation-term-retirement');
    const takeHomeTerm = equation.querySelector('.budget-equation-term-takehome');
    const allocatedTerm = equation.querySelector('.budget-equation-term-allocated');
    const remainingTerm = equation.querySelector('.budget-equation-term-remaining');
    const operators = equation.querySelectorAll('.budget-equation-op');
    const separators = equation.querySelectorAll('.budget-equation-separator');

    expect(line).toBeTruthy();
    expect(grossTerm).toBeTruthy();
    expect(taxTerm).toBeTruthy();
    expect(retirementTerm).toBeTruthy();
    expect(takeHomeTerm).toBeTruthy();
    expect(allocatedTerm).toBeTruthy();
    expect(remainingTerm).toBeTruthy();
    expect(operators.length).toBe(3);
    expect(separators.length).toBe(2);

    expect((grossTerm as HTMLElement).querySelector('.budget-equation-inline-label')?.textContent).toBe('Gross');
    expect((taxTerm as HTMLElement).querySelector('.budget-equation-inline-label')?.textContent).toBe('Tax');
    expect((retirementTerm as HTMLElement).querySelector('.budget-equation-inline-label')?.textContent).toBe('Retirement');
    expect((takeHomeTerm as HTMLElement).querySelector('.budget-equation-inline-label')?.textContent).toBe('Take-home');
    expect((allocatedTerm as HTMLElement).querySelector('.budget-equation-inline-label')?.textContent).toBe('Allocated');
    expect((remainingTerm as HTMLElement).querySelector('.budget-equation-inline-label')?.textContent).toBe('Remaining');

    expect((grossTerm as HTMLElement).querySelector('.budget-equation-inline-value')).toBeTruthy();
    expect((taxTerm as HTMLElement).querySelector('.budget-equation-inline-group')).toBeTruthy();
    expect((retirementTerm as HTMLElement).querySelector('.budget-equation-inline-group')).toBeTruthy();
    expect((takeHomeTerm as HTMLElement).querySelector('.budget-equation-inline-value')).toBeTruthy();
    expect((allocatedTerm as HTMLElement).querySelector('.budget-equation-inline-value')).toBeTruthy();
    expect((remainingTerm as HTMLElement).querySelector('.budget-equation-inline-value')).toBeTruthy();

    expect(within(grossTerm as HTMLElement).getByRole('button', { name: 'Edit gross pay' })).toBeTruthy();
    expect(within(taxTerm as HTMLElement).getByRole('button', { name: 'Edit tax percent' })).toBeTruthy();
    expect(within(retirementTerm as HTMLElement).getByRole('button', { name: 'Edit retirement percent' })).toBeTruthy();
    expect(within(takeHomeTerm as HTMLElement).getByText(/\$8,260/)).toBeTruthy();
  });
});
