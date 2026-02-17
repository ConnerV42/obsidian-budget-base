/**
 * Budget data structures and markdown parser
 */
import { normalizeTag, normalizeTagColorMap } from './tagUtils';
import { parseYamlObject, stringifyYamlObject } from './yamlAdapter';

export interface BudgetItem {
  tag: string;      // vault, roth, bill, sub, flex, etc.
  name: string;     // Display name
  amount: number;   // Dollar amount
}

export interface BudgetCategory {
  name: string;           // Category name (Savings, Investments, etc.)
  items: BudgetItem[];
}

export interface BudgetData {
  type: 'budget';
  month: string;          // YYYY-MM format
  income: number;
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
}

const MIN_LAYOUT_SPLIT_RATIO = 0.22;
const MAX_LAYOUT_SPLIT_RATIO = 0.55;
const KNOWN_FRONTMATTER_KEYS = new Set(['type', 'month', 'income', 'tagColors', 'chart', 'layout']);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseOptionalPositiveNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number'
    ? value
    : Number(String(value ?? '').trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function hasRecordEntries(value: Record<string, unknown> | undefined): boolean {
  return Boolean(value) && Object.keys(value).length > 0;
}

/**
 * Parse a number from string, handling commas, dollar signs, and negatives
 */
function parseAmount(str: string): number {
  // Remove $, commas, and whitespace, then parse
  const cleaned = str.replace(/[$,\s]/g, '');
  return parseFloat(cleaned) || 0;
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
  const income = parseAmount(String(rawFrontmatter.income ?? 0));

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

  const passthrough: BudgetFrontmatterPassthrough | undefined =
    hasRecordEntries(passthroughTopLevel)
    || hasRecordEntries(passthroughTagColors)
    || hasRecordEntries(passthroughChart)
    || hasRecordEntries(passthroughLayout)
      ? {
        topLevel: hasRecordEntries(passthroughTopLevel) ? passthroughTopLevel : undefined,
        tagColors: hasRecordEntries(passthroughTagColors) ? passthroughTagColors : undefined,
        chart: hasRecordEntries(passthroughChart) ? passthroughChart : undefined,
        layout: hasRecordEntries(passthroughLayout) ? passthroughLayout : undefined
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
    income,
    categories,
    tagColors: Object.keys(tagColors).length > 0 ? tagColors : undefined,
    chart: chartSize !== undefined ? { size: chartSize } : undefined,
    layout: layoutSplitRatio !== undefined ? { splitRatio: layoutSplitRatio } : undefined,
    _frontmatterPassthrough: passthrough
  };
}

export function serializeBudgetMarkdown(data: BudgetData): string {
  const passthrough = data._frontmatterPassthrough;
  const frontmatter: Record<string, unknown> = {
    ...(passthrough?.topLevel || {}),
    type: data.type,
    month: data.month,
    income: data.income
  };

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
