/**
 * Budget data structures and markdown parser
 */
import { normalizeTag, normalizeTagColorMap } from './tagUtils';
import { parseYamlObject, stringifyYamlObject } from './yamlAdapter';
import { computeCompensation, normalizeCompensation } from './compensation';

export interface BudgetItem {
  tag: string;      // vault, roth, bill, sub, flex, etc.
  name: string;     // Display name
  amount: number;   // Dollar amount
}

export interface BudgetCategory {
  name: string;           // Category name (Savings, Investments, etc.)
  items: BudgetItem[];
}

export interface CompensationComputedData {
  taxAmount: number;
  retirementAmount: number;
  takeHome: number;
}

export interface CompensationData {
  version: 2;
  gross: number;
  taxPercentBps: number;
  retirementPercentBps: number;
  computed?: CompensationComputedData;
}

export interface BudgetData {
  type: 'budget';
  month: string;          // YYYY-MM format
  paycheckDate?: string;  // YYYY-MM-DD format
  income: number;
  compensation?: CompensationData;
  categories: BudgetCategory[];
  tagColors?: Record<string, string>;  // Custom tag colors
  chart?: {
    size?: number;        // Donut size in px
  };
  layout?: {
    splitRatio?: number;  // Sidebar width ratio in desktop layout
  };
  _frontmatterPassthrough?: BudgetFrontmatterPassthrough;
}

interface BudgetFrontmatterPassthrough {
  topLevel?: Record<string, unknown>;
  tagColors?: Record<string, unknown>;
  chart?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  compensation?: {
    topLevel?: Record<string, unknown>;
  };
}

const MIN_LAYOUT_SPLIT_RATIO = 0.22;
const MAX_LAYOUT_SPLIT_RATIO = 0.55;
const KNOWN_FRONTMATTER_KEYS = new Set([
  'type',
  'month',
  'paycheckDate',
  'income',
  'compensation',
  'tagColors',
  'chart',
  'layout'
]);
const KNOWN_COMPENSATION_KEYS = new Set([
  'version',
  'gross',
  'taxPercentBps',
  'retirementPercentBps',
  'computed',
  'deductions'
]);
const YEAR_MONTH_DAY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] | null {
  if (!Array.isArray(value)) return null;
  return value;
}

function parseOptionalPositiveNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number'
    ? value
    : Number(String(value ?? '').trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function parseOptionalIsoDate(value: unknown): string | undefined {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined;
    return value.toISOString().slice(0, 10);
  }

  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  const match = trimmed.match(YEAR_MONTH_DAY_PATTERN);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return undefined;
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function hasRecordEntries(value: Record<string, unknown> | undefined): boolean {
  return Boolean(value) && Object.keys(value).length > 0;
}

function hasCompensationPassthroughEntries(
  value: BudgetFrontmatterPassthrough['compensation'] | undefined
): boolean {
  return hasRecordEntries(value?.topLevel);
}

/**
 * Parse a number from string, handling commas, dollar signs, and negatives
 */
function parseAmount(str: string): number {
  // Remove $, commas, and whitespace, then parse
  const cleaned = str.replace(/[$,\s]/g, '');
  return parseFloat(cleaned) || 0;
}

interface ParsedCompensationResult {
  compensation?: CompensationData;
  passthrough?: BudgetFrontmatterPassthrough['compensation'];
}

function parseLegacyCompensationPercents(compensationRaw: Record<string, unknown>): {
  taxPercentBps: number;
  retirementPercentBps: number;
} {
  const gross = parseAmount(String(compensationRaw.gross ?? 0));
  const deductionsRaw = asArray(compensationRaw.deductions) || [];
  const lines: Array<{ index: number; label: string; percentBps: number }> = [];

  for (const [index, entry] of deductionsRaw.entries()) {
    const line = asRecord(entry);
    if (!line) continue;

    const label = String(line.label ?? '').trim();
    const mode = String(line.mode ?? '').trim().toLowerCase();

    let percentBps: number | null = null;
    if (mode === 'percent') {
      const parsed = Number(line.percentBps ?? 0);
      percentBps = Number.isFinite(parsed) ? parsed : 0;
    } else if (mode === 'amount') {
      const parsedAmount = parseAmount(String(line.amount ?? 0));
      percentBps = gross > 0 ? (parsedAmount / gross) * 10000 : 0;
    } else if (line.percentBps !== undefined) {
      const parsed = Number(line.percentBps);
      percentBps = Number.isFinite(parsed) ? parsed : 0;
    }

    if (percentBps === null) continue;
    lines.push({ index, label, percentBps });
  }

  const taxLine = lines.find((line) => /tax/i.test(line.label));
  const retirementLine = lines.find((line) => /retire/i.test(line.label));

  let taxPercentBps = taxLine?.percentBps ?? lines[0]?.percentBps ?? 0;
  let retirementPercentBps = retirementLine?.percentBps ?? 0;

  if (!retirementLine || retirementLine.index === taxLine?.index) {
    const taxIndex = taxLine?.index ?? lines[0]?.index ?? -1;
    const fallbackRetirement = lines.find((line) => line.index !== taxIndex);
    retirementPercentBps = fallbackRetirement?.percentBps ?? lines[1]?.percentBps ?? 0;
  }

  return { taxPercentBps, retirementPercentBps };
}

function parseCompensationData(raw: unknown): ParsedCompensationResult {
  const compensationRaw = asRecord(raw);
  if (!compensationRaw) {
    return {};
  }

  const passthroughTopLevel: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(compensationRaw)) {
    if (!KNOWN_COMPENSATION_KEYS.has(key)) {
      passthroughTopLevel[key] = value;
    }
  }

  const hasLegacyDeductions = Array.isArray(compensationRaw.deductions)
    && !Object.prototype.hasOwnProperty.call(compensationRaw, 'taxPercentBps')
    && !Object.prototype.hasOwnProperty.call(compensationRaw, 'retirementPercentBps');

  const legacyPercents = hasLegacyDeductions
    ? parseLegacyCompensationPercents(compensationRaw)
    : { taxPercentBps: Number(compensationRaw.taxPercentBps ?? 0), retirementPercentBps: Number(compensationRaw.retirementPercentBps ?? 0) };

  const normalizedCompensation = normalizeCompensation({
    version: 2,
    gross: parseAmount(String(compensationRaw.gross ?? 0)),
    taxPercentBps: legacyPercents.taxPercentBps,
    retirementPercentBps: legacyPercents.retirementPercentBps
  });

  const passthrough: BudgetFrontmatterPassthrough['compensation'] | undefined = hasRecordEntries(passthroughTopLevel)
    ? {
      topLevel: hasRecordEntries(passthroughTopLevel) ? passthroughTopLevel : undefined
    }
    : undefined;

  return {
    compensation: normalizedCompensation,
    passthrough
  };
}

/**
 * Parse budget markdown into structured data
 */
export function parseBudgetMarkdown(content: string): BudgetData | null {
  // Normalize line endings (Windows → Unix)
  content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Extract frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return null;

  const rawFrontmatter = asRecord(parseYamlObject(frontmatterMatch[1]));
  if (!rawFrontmatter || rawFrontmatter.type !== 'budget') return null;

  const passthroughTopLevel: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawFrontmatter)) {
    if (!KNOWN_FRONTMATTER_KEYS.has(key)) {
      passthroughTopLevel[key] = value;
    }
  }

  const monthRaw = rawFrontmatter.month;
  const month = typeof monthRaw === 'string'
    ? monthRaw.trim()
    : String(monthRaw ?? '').trim();
  const paycheckDate = parseOptionalIsoDate(rawFrontmatter.paycheckDate);
  if (!paycheckDate && Object.prototype.hasOwnProperty.call(rawFrontmatter, 'paycheckDate')) {
    passthroughTopLevel.paycheckDate = rawFrontmatter.paycheckDate;
  }
  const fallbackIncome = parseAmount(String(rawFrontmatter.income ?? 0));

  const tagColors: Record<string, string> = {};
  const passthroughTagColors: Record<string, unknown> = {};
  const tagColorsData = asRecord(rawFrontmatter.tagColors);
  if (tagColorsData) {
    for (const [rawTag, rawColor] of Object.entries(tagColorsData)) {
      if (typeof rawColor === 'string') {
        tagColors[normalizeTag(rawTag)] = rawColor;
        continue;
      }
      passthroughTagColors[rawTag] = rawColor;
    }
  }

  let chartSize: number | undefined;
  const passthroughChart: Record<string, unknown> = {};
  const chartData = asRecord(rawFrontmatter.chart);
  if (chartData) {
    chartSize = parseOptionalPositiveNumber(chartData.size);
    for (const [key, value] of Object.entries(chartData)) {
      if (key !== 'size') {
        passthroughChart[key] = value;
      }
    }
  }

  let layoutSplitRatio: number | undefined;
  const passthroughLayout: Record<string, unknown> = {};
  const layoutData = asRecord(rawFrontmatter.layout);
  if (layoutData) {
    const splitRatio = parseOptionalPositiveNumber(layoutData.splitRatio);
    if (splitRatio !== undefined) {
      layoutSplitRatio = Math.max(
        MIN_LAYOUT_SPLIT_RATIO,
        Math.min(MAX_LAYOUT_SPLIT_RATIO, splitRatio)
      );
    }
    for (const [key, value] of Object.entries(layoutData)) {
      if (key !== 'splitRatio') {
        passthroughLayout[key] = value;
      }
    }
  }

  const parsedCompensation = parseCompensationData(rawFrontmatter.compensation);
  const compensationComputation = parsedCompensation.compensation
    ? computeCompensation(parsedCompensation.compensation)
    : null;
  const income = compensationComputation
    ? compensationComputation.takeHome
    : fallbackIncome;

  const passthrough: BudgetFrontmatterPassthrough | undefined =
    hasRecordEntries(passthroughTopLevel)
    || hasRecordEntries(passthroughTagColors)
    || hasRecordEntries(passthroughChart)
    || hasRecordEntries(passthroughLayout)
    || hasCompensationPassthroughEntries(parsedCompensation.passthrough)
      ? {
        topLevel: hasRecordEntries(passthroughTopLevel) ? passthroughTopLevel : undefined,
        tagColors: hasRecordEntries(passthroughTagColors) ? passthroughTagColors : undefined,
        chart: hasRecordEntries(passthroughChart) ? passthroughChart : undefined,
        layout: hasRecordEntries(passthroughLayout) ? passthroughLayout : undefined,
        compensation: hasCompensationPassthroughEntries(parsedCompensation.passthrough)
          ? parsedCompensation.passthrough
          : undefined
      }
      : undefined;

  // Parse categories and items
  const body = content.slice(frontmatterMatch[0].length);
  const categories: BudgetCategory[] = [];
  
  let currentCategory: BudgetCategory | null = null;
  
  const lines = body.split('\n');
  
  for (const line of lines) {
    // Check for category header (## Category Name)
    const categoryMatch = line.match(/^##\s+(.+)/);
    if (categoryMatch) {
      if (currentCategory) {
        categories.push(currentCategory);
      }
      currentCategory = {
        name: categoryMatch[1].trim(),
        items: []
      };
      continue;
    }

    // Check for item (- [tag] Name: amount)
    // Use lastIndexOf to handle names with colons (e.g., "Netflix: 4K Plan: 20")
    const itemTagMatch = line.match(/^[-\t]\s*\[([^\]]+)\]\s+(.+)/);
    if (itemTagMatch && currentCategory) {
      const tag = itemTagMatch[1].trim();
      if (!tag) continue;
      const rest = itemTagMatch[2].trim();
      
      // Find the last colon to split name and amount
      const lastColonIndex = rest.lastIndexOf(':');
      if (lastColonIndex === -1) continue;
      
      const name = rest.slice(0, lastColonIndex).trim();
      const amountStr = rest.slice(lastColonIndex + 1).trim();
      
      // Parse amount (handles $, commas, negatives)
      const amount = parseAmount(amountStr);
      
      // Skip if name is empty (malformed)
      if (!name) continue;
      
      currentCategory.items.push({ tag, name, amount });
    }
  }

  // Don't forget the last category
  if (currentCategory) {
    categories.push(currentCategory);
  }

  return {
    type: 'budget',
    month,
    paycheckDate,
    income,
    compensation: parsedCompensation.compensation,
    categories,
    tagColors: Object.keys(tagColors).length > 0 ? tagColors : undefined,
    chart: chartSize !== undefined ? { size: chartSize } : undefined,
    layout: layoutSplitRatio !== undefined ? { splitRatio: layoutSplitRatio } : undefined,
    _frontmatterPassthrough: passthrough
  };
}

export function serializeBudgetMarkdown(data: BudgetData): string {
  const passthrough = data._frontmatterPassthrough;
  const normalizedCompensation = data.compensation
    ? normalizeCompensation(data.compensation)
    : undefined;
  const compensationComputation = normalizedCompensation
    ? computeCompensation(normalizedCompensation)
    : undefined;
  const computedIncome = compensationComputation
    ? compensationComputation.takeHome
    : data.income;

  const frontmatter: Record<string, unknown> = {
    ...(passthrough?.topLevel || {}),
    type: data.type,
    month: data.month,
    income: computedIncome
  };
  const normalizedPaycheckDate = parseOptionalIsoDate(data.paycheckDate);
  if (normalizedPaycheckDate) {
    frontmatter.paycheckDate = normalizedPaycheckDate;
  }

  if (normalizedCompensation && compensationComputation) {
    const compensationPassthrough = passthrough?.compensation;
    frontmatter.compensation = {
      ...(compensationPassthrough?.topLevel || {}),
      version: 2,
      gross: normalizedCompensation.gross,
      taxPercentBps: normalizedCompensation.taxPercentBps,
      retirementPercentBps: normalizedCompensation.retirementPercentBps,
      computed: {
        taxAmount: Number(compensationComputation.taxAmount.toFixed(2)),
        retirementAmount: Number(compensationComputation.retirementAmount.toFixed(2)),
        takeHome: Number(compensationComputation.takeHome.toFixed(2))
      }
    };
  }

  const normalizedTagColors = normalizeTagColorMap(data.tagColors);
  if (Object.keys(normalizedTagColors).length > 0) {
    const sortedTagColors: Record<string, unknown> = {
      ...(passthrough?.tagColors || {})
    };
    const sortedTags = Object.keys(normalizedTagColors).sort((a, b) => a.localeCompare(b));
    for (const tag of sortedTags) {
      sortedTagColors[tag] = normalizedTagColors[tag];
    }
    frontmatter.tagColors = sortedTagColors;
  } else if (hasRecordEntries(passthrough?.tagColors)) {
    frontmatter.tagColors = {
      ...passthrough?.tagColors
    };
  }

  const nextLayout: Record<string, unknown> = {
    ...(passthrough?.layout || {})
  };
  if (data.layout?.splitRatio !== undefined) {
    nextLayout.splitRatio = Number(data.layout.splitRatio.toFixed(3));
  }
  if (hasRecordEntries(nextLayout)) {
    frontmatter.layout = nextLayout;
  }

  const nextChart: Record<string, unknown> = {
    ...(passthrough?.chart || {})
  };
  if (data.chart?.size !== undefined) {
    nextChart.size = data.chart.size;
  }
  if (hasRecordEntries(nextChart)) {
    frontmatter.chart = nextChart;
  }

  let content = `---\n${stringifyYamlObject(frontmatter).trimEnd()}\n---\n\n`;
  for (const category of data.categories) {
    content += `## ${category.name}\n`;
    for (const item of category.items) {
      content += `- [${item.tag}] ${item.name}: ${item.amount}\n`;
    }
    content += '\n';
  }
  return content;
}

/**
 * Calculate totals from budget data
 */
export function calculateTotals(data: BudgetData) {
  let totalAllocated = 0;
  const categoryTotals: Record<string, number> = {};

  for (const category of data.categories) {
    let categorySum = 0;
    for (const item of category.items) {
      categorySum += item.amount;
      totalAllocated += item.amount;
    }
    categoryTotals[category.name] = categorySum;
  }

  return {
    income: data.income,
    totalAllocated,
    unallocated: data.income - totalAllocated,
    categoryTotals
  };
}

/**
 * Get tag color mapping
 */
export function getTagColor(tag: string): string {
  const colors: Record<string, string> = {
    vault: '#059669',    // emerald - savings
    roth: '#0891b2',     // cyan - retirement
    taxable: '#6366f1',  // indigo - investments
    bill: '#dc2626',     // red - fixed bills
    sub: '#f59e0b',      // amber - subscriptions
    flex: '#8b5cf6',     // violet - discretionary
    default: '#6b7280'   // gray
  };
  
  return colors[tag.toLowerCase()] || colors.default;
}
