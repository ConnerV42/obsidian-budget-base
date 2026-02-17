import { h } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { BudgetItem, getTagColor } from '../parser';
import { filterCollidingLabels, getSliceLabelPoint } from './chartGeometry';
import { normalizeTag } from './tagSelection';

interface PieChartProps {
  items: BudgetItem[];
  totals: {
    income: number;
    totalAllocated: number;
    unallocated: number;
    categoryTotals: Record<string, number>;
  };
  tagColors: Record<string, string>;
  chartSize: number;
  onTagColorChange: (tag: string, color: string) => void;
  onTagRename: (oldTag: string, newTag: string) => void;
  onTagDelete: (tag: string) => void;
}

interface PieSlice {
  name: string;
  value: number;
  color: string;
  percentage: number;
  startAngle: number;
  endAngle: number;
  midAngle: number;
  isFullCircle: boolean;
}

const FULL_CIRCLE = Math.PI * 2;
const DONUT_START_ANGLE = -Math.PI / 2;
const LABEL_THRESHOLD_PERCENT = 3;
const MIN_LABEL_ANGLE_GAP = 0.17;
const MIN_CHART_SIZE = 180;
const MAX_CHART_SIZE = 440;

const polarToCartesian = (cx: number, cy: number, radius: number, angleInRadians: number) => ({
  x: cx + radius * Math.cos(angleInRadians),
  y: cy + radius * Math.sin(angleInRadians)
});

const describeDonutSlicePath = (
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number
): string => {
  const outerStart = polarToCartesian(cx, cy, outerRadius, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerRadius, endAngle);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, endAngle);
  const innerStart = polarToCartesian(cx, cy, innerRadius, startAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z'
  ].join(' ');
};

export function AllocationPieChart({
  items,
  totals,
  tagColors,
  chartSize,
  onTagColorChange,
  onTagRename,
  onTagDelete
}: PieChartProps) {
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editTagValue, setEditTagValue] = useState('');
  const tagEditInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editingTag || !tagEditInputRef.current) return;
    const input = tagEditInputRef.current;
    input.focus();
    const length = input.value.length;
    input.setSelectionRange(length, length);
  }, [editingTag]);

  const total = totals.totalAllocated + totals.unallocated;

  const pieData = useMemo<PieSlice[]>(() => {
    const tagTotals: Record<string, number> = {};

    for (const item of items) {
      const normalizedTag = normalizeTag(item.tag);
      tagTotals[normalizedTag] = (tagTotals[normalizedTag] || 0) + item.amount;
    }

    const rawSlices = Object.entries(tagTotals)
      .filter(([, value]) => value > 0)
      .map(([tag, value]) => ({
        name: tag,
        value,
        color: tagColors[tag] || getTagColor(tag),
        percentage: total > 0 ? (value / total) * 100 : 0
      }))
      .sort((a, b) => b.value - a.value);

    if (totals.unallocated > 0) {
      rawSlices.push({
        name: 'Unallocated',
        value: totals.unallocated,
        color: '#6b7280',
        percentage: total > 0 ? (totals.unallocated / total) * 100 : 0
      });
    }

    if (total <= 0) return [];

    let currentAngle = DONUT_START_ANGLE;
    return rawSlices.map((slice, index) => {
      const sweep = (slice.percentage / 100) * FULL_CIRCLE;
      const endAngle =
        index === rawSlices.length - 1 ? DONUT_START_ANGLE + FULL_CIRCLE : currentAngle + sweep;
      const span = Math.max(0, endAngle - currentAngle);
      const pieSlice: PieSlice = {
        ...slice,
        startAngle: currentAngle,
        endAngle,
        midAngle: currentAngle + span / 2,
        isFullCircle: span >= FULL_CIRCLE - 0.0001
      };
      currentAngle = endAngle;
      return pieSlice;
    });
  }, [items, tagColors, total, totals.unallocated]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);

  const size = Math.max(MIN_CHART_SIZE, Math.min(MAX_CHART_SIZE, chartSize));
  const center = size / 2;
  const outerRadius = size / 2 - 2;
  const innerRadius = Math.max(outerRadius * 0.58, 42);
  const labelFontSize = Math.max(11, Math.round(size * 0.07));
  const centerValue = formatCurrency(totals.totalAllocated);

  const labelSlices = useMemo(() => {
    const candidates = pieData
      .filter(slice => slice.percentage >= LABEL_THRESHOLD_PERCENT)
      .map((slice) => {
        const basePoint = getSliceLabelPoint(
          center,
          center,
          innerRadius,
          outerRadius,
          slice.startAngle,
          slice.endAngle
        );

        return {
          ...slice,
          labelX: basePoint.x,
          labelY: basePoint.y
        };
      });

    const filtered = filterCollidingLabels(candidates, MIN_LABEL_ANGLE_GAP);
    return filtered;
  }, [center, innerRadius, outerRadius, pieData]);

  return (
    <div className="budget-pie-container">
      <div
        className="budget-donut-wrap"
        style={{ width: `${size}px`, maxWidth: '100%' }}
      >
        <svg className="budget-donut" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Budget allocation by tag">
          {pieData.length === 0 && (
            <circle cx={center} cy={center} r={outerRadius} fill="#6b7280" />
          )}

          {pieData.map((slice) => {
            if (slice.isFullCircle) {
              return (
                <circle
                  key={slice.name}
                  className="budget-donut-segment"
                  cx={center}
                  cy={center}
                  r={(outerRadius + innerRadius) / 2}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth={outerRadius - innerRadius}
                />
              );
            }

            return (
              <path
                key={slice.name}
                className="budget-donut-segment"
                d={describeDonutSlicePath(
                  center,
                  center,
                  outerRadius,
                  innerRadius,
                  slice.startAngle,
                  slice.endAngle
                )}
                fill={slice.color}
              />
            );
          })}

          <circle className="budget-donut-hole" cx={center} cy={center} r={innerRadius} />
        </svg>
        <div className="budget-donut-label-layer">
          {labelSlices.map((slice) => (
            <span
              key={`${slice.name}-label`}
              className="budget-donut-percent-overlay"
              style={{
                fontSize: `${labelFontSize}px`,
                left: `${(slice.labelX / size) * 100}%`,
                top: `${(slice.labelY / size) * 100}%`
              }}
            >
              {Math.round(slice.percentage)}%
            </span>
          ))}
        </div>
        <div className="budget-donut-center-overlay">
          <span className="budget-donut-center-label">Total</span>
          <span className="budget-donut-center-value">{centerValue}</span>
        </div>
      </div>

      <div className="budget-pie-legend">
        {pieData.map((slice) => {
          return (
            <div
              key={slice.name}
              className="budget-pie-legend-item"
            >
              <label className="budget-pie-legend-color">
                {slice.name !== 'Unallocated' && (
                  <input
                    type="color"
                    value={slice.color}
                    onChange={(e) => onTagColorChange(slice.name, (e.target as HTMLInputElement).value)}
                    className="budget-color-input"
                  />
                )}
                <span
                  className="budget-pie-legend-dot"
                  style={{ backgroundColor: slice.color }}
                />
              </label>

              {editingTag === slice.name ? (
                <input
                  ref={tagEditInputRef}
                  type="text"
                  className="budget-tag-edit-input budget-inline-edit-input"
                  value={editTagValue}
                  size={Math.min(Math.max(editTagValue.length, 5), 18)}
                  onInput={(e) => setEditTagValue((e.target as HTMLInputElement).value)}
                  onBlur={() => {
                    setEditingTag(null);
                    if (editTagValue.trim() && editTagValue !== slice.name) {
                      onTagRename(slice.name, editTagValue.trim());
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setEditingTag(null);
                      if (editTagValue.trim() && editTagValue !== slice.name) {
                        onTagRename(slice.name, editTagValue.trim());
                      }
                    } else if (e.key === 'Escape') {
                      setEditingTag(null);
                    }
                  }}
                />
              ) : (
                <span
                  className="budget-pie-legend-name clickable"
                  onClick={() => {
                    if (slice.name === 'Unallocated') return;
                    setEditTagValue(slice.name);
                    setEditingTag(slice.name);
                  }}
                  title={slice.name !== 'Unallocated' ? 'Click to rename tag' : ''}
                >
                  {slice.name}
                </span>
              )}

              <span className="budget-pie-legend-value">{formatCurrency(slice.value)}</span>
              <span className="budget-pie-legend-percent">{Math.round(slice.percentage)}%</span>

              {slice.name !== 'Unallocated' && (
                <button
                  className="budget-tag-delete-btn"
                  onClick={() => {
                    if (confirm(`Delete all "${slice.name}" items?`)) {
                      onTagDelete(slice.name);
                    }
                  }}
                  title="Delete all items with this tag"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
