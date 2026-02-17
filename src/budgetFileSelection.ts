export interface BudgetFileCandidate {
  name: string;
  stat: {
    mtime: number;
  };
}

export function getCurrentMonthBudgetName(date: Date = new Date()): string {
  const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  return `${month}-budget.md`;
}

export function orderBudgetFileCandidates<T extends BudgetFileCandidate>(
  files: T[],
  currentMonthName: string
): T[] {
  const currentMonth = files
    .filter(file => file.name === currentMonthName)
    .sort((a, b) => b.stat.mtime - a.stat.mtime);

  const others = files
    .filter(file => file.name !== currentMonthName)
    .sort((a, b) => b.stat.mtime - a.stat.mtime);

  return [...currentMonth, ...others];
}
