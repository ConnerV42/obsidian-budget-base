import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { BudgetData, BudgetItem, calculateTotals } from '../parser';
import { BudgetHeader } from './BudgetHeader';
import { ItemList } from './ItemList';
import { AllocationPieChart } from './AllocationPieChart';
import { normalizeTag, normalizeTagColorMap } from '../tagUtils';
import { BudgetConflictState, ConflictResolutionStrategy } from '../services/budgetPersistence';
import {
  calculatePinchScale,
  distanceBetweenPoints,
  normalizeMobileUiScale
} from '../mobileUiScale';

interface BudgetViewProps {
  data: BudgetData;
  onUpdate: (update: BudgetData | ((prev: BudgetData) => BudgetData)) => void;
  mobileUiScale: number;
  onMobileUiScaleChange: (scale: number) => void;
  mobileEdgeIconY?: number;
  onMobileEdgeIconYChange?: (y: number) => void;
  conflictState?: BudgetConflictState | null;
  onResolveConflict?: (strategy: ConflictResolutionStrategy) => Promise<void> | void;
}

type MobilePanel = 'list' | 'chart';
type SortOption = 'none' | 'amount-desc' | 'amount-asc' | 'tag' | 'name';

const MOBILE_LAYOUT_QUERY = '(max-width: 768px), (pointer: coarse)';
const DEFAULT_SPLIT_RATIO = 0.34;
const MIN_SPLIT_RATIO = 0.22;
const MAX_SPLIT_RATIO = 0.55;
const DEFAULT_CHART_SIZE = 240;
const MIN_CHART_SIZE = 180;
const MAX_CHART_SIZE = 440;
const CHART_WIDTH_OFFSET = 8;
const SPLITTER_STEP = 0.01;
const SPLITTER_STEP_LARGE = 0.03;
const MOBILE_SCALE_EPSILON = 0.005;
const DEFAULT_MOBILE_EDGE_ICON_Y_RATIO = 0.56;
const MOBILE_EDGE_ICON_TOP_GUTTER = 86;
const MOBILE_EDGE_ICON_BOTTOM_GUTTER = 116;
const MOBILE_EDGE_ICON_TAP_SLOP = 8;

const clampSplitRatio = (ratio?: number): number => {
  const parsed = Number(ratio);
  if (!Number.isFinite(parsed)) return DEFAULT_SPLIT_RATIO;
  return Math.max(MIN_SPLIT_RATIO, Math.min(MAX_SPLIT_RATIO, parsed));
};

const normalizeStoredSplitRatio = (ratio: number): number => Number(clampSplitRatio(ratio).toFixed(3));

const splitRatioEquals = (a: number | undefined, b: number): boolean =>
  a !== undefined && Math.abs(a - b) < 0.0005;

const clampChartSize = (size?: number): number => {
  const parsed = Number(size);
  if (!Number.isFinite(parsed)) return DEFAULT_CHART_SIZE;
  return Math.max(MIN_CHART_SIZE, Math.min(MAX_CHART_SIZE, Math.round(parsed)));
};

const getViewportHeight = (): number => {
  if (typeof window === 'undefined') return 720;
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return 720;
  return viewportHeight;
};

const clampMobileEdgeIconY = (y: number, viewportHeight: number, mobileScale: number): number => {
  const minTop = Math.max(44, MOBILE_EDGE_ICON_TOP_GUTTER * mobileScale);
  const bottomPadding = Math.max(80, MOBILE_EDGE_ICON_BOTTOM_GUTTER * mobileScale);
  const maxTop = Math.max(minTop, viewportHeight - bottomPadding);
  return Math.max(minTop, Math.min(maxTop, y));
};

const resolveMobileEdgeIconY = (storedY: number | undefined, mobileScale: number): number => {
  const viewportHeight = getViewportHeight();
  const parsed = Number(storedY);
  const fallback = viewportHeight * DEFAULT_MOBILE_EDGE_ICON_Y_RATIO;
  const next = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return clampMobileEdgeIconY(next, viewportHeight, mobileScale);
};

export function BudgetView({
  data,
  onUpdate,
  mobileUiScale,
  onMobileUiScaleChange,
  mobileEdgeIconY: initialMobileEdgeIconY,
  onMobileEdgeIconYChange = () => {},
  conflictState = null,
  onResolveConflict
}: BudgetViewProps) {
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('list');
  const [mobileSortOption, setMobileSortOption] = useState<SortOption>('none');
  const [isMobileLayout, setIsMobileLayout] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(MOBILE_LAYOUT_QUERY).matches;
  });
  const [splitRatio, setSplitRatio] = useState<number>(() => clampSplitRatio(data.layout?.splitRatio));
  const [isDraggingSplitter, setIsDraggingSplitter] = useState(false);
  const [chartPaneWidth, setChartPaneWidth] = useState(0);
  const [isInspectOpen, setIsInspectOpen] = useState(false);
  const [activeConflictAction, setActiveConflictAction] = useState<ConflictResolutionStrategy | null>(null);
  const [mobileScale, setMobileScale] = useState(() => normalizeMobileUiScale(mobileUiScale));
  const [mobileEdgeIconY, setMobileEdgeIconY] = useState(() =>
    resolveMobileEdgeIconY(initialMobileEdgeIconY, normalizeMobileUiScale(mobileUiScale))
  );
  const [isDraggingMobileEdgeIcon, setIsDraggingMobileEdgeIcon] = useState(false);

  const flowBodyRef = useRef<HTMLDivElement>(null);
  const chartPaneRef = useRef<HTMLDivElement>(null);
  const splitRatioRef = useRef(splitRatio);
  const mobileScaleRef = useRef(mobileScale);
  const persistedMobileScaleRef = useRef(normalizeMobileUiScale(mobileUiScale));
  const mobileEdgeIconYRef = useRef(mobileEdgeIconY);
  const persistedMobileEdgeIconYRef = useRef(
    resolveMobileEdgeIconY(initialMobileEdgeIconY, normalizeMobileUiScale(mobileUiScale))
  );
  const suppressMobileEdgeIconClickRef = useRef(false);
  const mobileEdgeIconDragRef = useRef<{
    active: boolean;
    pointerId: number | null;
    startPointerY: number;
    startIconY: number;
    moved: boolean;
  }>({
    active: false,
    pointerId: null,
    startPointerY: 0,
    startIconY: 0,
    moved: false
  });
  const pinchStateRef = useRef<{ active: boolean; startDistance: number; startScale: number }>({
    active: false,
    startDistance: 0,
    startScale: mobileScale
  });

  const totals = calculateTotals(data);
  const flattenItems = (budgetData: BudgetData): BudgetItem[] =>
    budgetData.categories.flatMap(cat => cat.items);
  const normalizedTagColors = normalizeTagColorMap(data.tagColors);

  // Flatten all items from all categories into one list
  const allItems: BudgetItem[] = flattenItems(data);

  const chartSize = clampChartSize(chartPaneWidth > 0 ? chartPaneWidth - CHART_WIDTH_OFFSET : undefined);
  const allocatedPercent = totals.income > 0 ? (totals.totalAllocated / totals.income) * 100 : 0;
  const mobileEdgeIconProgress = Math.max(0, Math.min(allocatedPercent, 100));

  const persistSplitRatio = (ratio: number) => {
    const normalized = normalizeStoredSplitRatio(ratio);
    onUpdate((prev) => {
      if (splitRatioEquals(prev.layout?.splitRatio, normalized)) return prev;
      return {
        ...prev,
        layout: {
          ...(prev.layout || {}),
          splitRatio: normalized
        }
      };
    });
  };

  const getSplitRatioFromClientX = (clientX: number): number => {
    const rect = flowBodyRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) {
      return splitRatioRef.current;
    }

    const ratio = (rect.right - clientX) / rect.width;
    return clampSplitRatio(ratio);
  };

  const getPinchDistance = (touches: TouchList): number | null => {
    if (touches.length < 2) return null;
    return distanceBetweenPoints(
      touches[0].clientX,
      touches[0].clientY,
      touches[1].clientX,
      touches[1].clientY
    );
  };

  const commitMobileScale = () => {
    if (!pinchStateRef.current.active) return;
    pinchStateRef.current.active = false;

    const normalized = normalizeMobileUiScale(mobileScaleRef.current);
    mobileScaleRef.current = normalized;
    setMobileScale(normalized);

    if (Math.abs(normalized - persistedMobileScaleRef.current) < MOBILE_SCALE_EPSILON) {
      return;
    }

    persistedMobileScaleRef.current = normalized;
    onMobileUiScaleChange(normalized);
  };

  const handleTouchStart = (event: h.JSX.TargetedTouchEvent<HTMLDivElement>) => {
    if (!isMobileLayout) return;

    const distance = getPinchDistance(event.touches);
    if (distance === null) return;

    pinchStateRef.current = {
      active: true,
      startDistance: distance,
      startScale: mobileScaleRef.current
    };
  };

  const handleTouchMove = (event: h.JSX.TargetedTouchEvent<HTMLDivElement>) => {
    if (!isMobileLayout || !pinchStateRef.current.active) return;

    const distance = getPinchDistance(event.touches);
    if (distance === null) return;

    event.preventDefault();

    const nextScale = calculatePinchScale(
      pinchStateRef.current.startScale,
      pinchStateRef.current.startDistance,
      distance
    );

    mobileScaleRef.current = nextScale;
    setMobileScale(nextScale);
  };

  const handleTouchEnd = (event: h.JSX.TargetedTouchEvent<HTMLDivElement>) => {
    if (event.touches.length >= 2) return;
    commitMobileScale();
  };

  const handleTouchCancel = () => {
    commitMobileScale();
  };

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia(MOBILE_LAYOUT_QUERY);
    const syncLayoutMode = () => setIsMobileLayout(mediaQuery.matches);
    syncLayoutMode();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncLayoutMode);
      return () => mediaQuery.removeEventListener('change', syncLayoutMode);
    }

    mediaQuery.addListener(syncLayoutMode);
    return () => mediaQuery.removeListener(syncLayoutMode);
  }, []);

  useEffect(() => {
    setSplitRatio(clampSplitRatio(data.layout?.splitRatio));
  }, [data.layout?.splitRatio]);

  useEffect(() => {
    splitRatioRef.current = splitRatio;
  }, [splitRatio]);

  useEffect(() => {
    const normalized = normalizeMobileUiScale(mobileUiScale);
    persistedMobileScaleRef.current = normalized;
    setMobileScale(normalized);
  }, [mobileUiScale]);

  useEffect(() => {
    mobileScaleRef.current = mobileScale;
  }, [mobileScale]);

  useEffect(() => {
    mobileEdgeIconYRef.current = mobileEdgeIconY;
  }, [mobileEdgeIconY]);

  useEffect(() => {
    const resolved = resolveMobileEdgeIconY(initialMobileEdgeIconY, mobileScaleRef.current);
    persistedMobileEdgeIconYRef.current = resolved;
    setMobileEdgeIconY(resolved);
  }, [initialMobileEdgeIconY]);

  useEffect(() => {
    if (!isMobileLayout) return;
    const viewportHeight = getViewportHeight();
    setMobileEdgeIconY(prev => clampMobileEdgeIconY(prev, viewportHeight, mobileScale));
  }, [isMobileLayout, mobileScale]);

  useEffect(() => {
    if (!isMobileLayout || typeof window === 'undefined') return;

    const clampIconPosition = () => {
      const viewportHeight = getViewportHeight();
      setMobileEdgeIconY(prev => clampMobileEdgeIconY(prev, viewportHeight, mobileScaleRef.current));
    };

    window.addEventListener('resize', clampIconPosition);
    const visualViewport = window.visualViewport;
    if (visualViewport) {
      visualViewport.addEventListener('resize', clampIconPosition);
    }

    return () => {
      window.removeEventListener('resize', clampIconPosition);
      if (visualViewport) {
        visualViewport.removeEventListener('resize', clampIconPosition);
      }
    };
  }, [isMobileLayout]);

  useEffect(() => {
    if (!isDraggingSplitter) return;

    const handlePointerMove = (event: PointerEvent) => {
      setSplitRatio(getSplitRatioFromClientX(event.clientX));
    };

    const handlePointerEnd = (event: PointerEvent) => {
      const nextRatio = getSplitRatioFromClientX(event.clientX);
      setSplitRatio(nextRatio);
      setIsDraggingSplitter(false);
      persistSplitRatio(nextRatio);
    };

    document.body.classList.add('budget-resizing-splitter');
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerEnd);
    document.addEventListener('pointercancel', handlePointerEnd);

    return () => {
      document.body.classList.remove('budget-resizing-splitter');
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerEnd);
      document.removeEventListener('pointercancel', handlePointerEnd);
    };
  }, [isDraggingSplitter, data]);

  useEffect(() => {
    const element = chartPaneRef.current;
    if (!element) return;

    const syncWidth = () => {
      const rect = element.getBoundingClientRect();
      setChartPaneWidth(rect.width);
    };

    syncWidth();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', syncWidth);
      return () => window.removeEventListener('resize', syncWidth);
    }

    const observer = new ResizeObserver(() => syncWidth());
    observer.observe(element);
    return () => observer.disconnect();
  }, [isMobileLayout, mobilePanel]);

  useEffect(() => {
    if (!conflictState) {
      setIsInspectOpen(false);
      setActiveConflictAction(null);
    }
  }, [conflictState]);

  useEffect(() => {
    if (isMobileLayout) return;
    if (!pinchStateRef.current.active) return;
    commitMobileScale();
  }, [isMobileLayout]);

  useEffect(() => {
    if (isMobileLayout) return;
    mobileEdgeIconDragRef.current = {
      active: false,
      pointerId: null,
      startPointerY: 0,
      startIconY: mobileEdgeIconYRef.current,
      moved: false
    };
    setIsDraggingMobileEdgeIcon(false);
  }, [isMobileLayout]);

  // When updating, we store everything in a single "Items" category
  const handleItemUpdate = (index: number, field: 'tag' | 'name' | 'amount', value: string | number) => {
    onUpdate((prev) => {
      const prevItems = flattenItems(prev);
      const newItems = [...prevItems];
      const item = { ...newItems[index] };
      if (!item) return prev;

      if (field === 'amount') {
        item.amount = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
      } else if (field === 'name') {
        item.name = String(value);
      } else if (field === 'tag') {
        item.tag = String(value);
      }

      newItems[index] = item;
      return {
        ...prev,
        categories: [{ name: 'Items', items: newItems }]
      };
    });
  };

  const handleAddItem = (tag: string, name: string, amount: number) => {
    onUpdate((prev) => {
      const prevItems = flattenItems(prev);
      const newItems = [...prevItems, { tag, name, amount }];
      return {
        ...prev,
        categories: [{ name: 'Items', items: newItems }]
      };
    });
  };

  const handleDeleteItem = (index: number) => {
    onUpdate((prev) => {
      const prevItems = flattenItems(prev);
      const newItems = prevItems.filter((_, i) => i !== index);
      return {
        ...prev,
        categories: [{ name: 'Items', items: newItems }]
      };
    });
  };

  const handleReorderItem = (fromIndex: number, toIndex: number) => {
    setMobileSortOption('none');
    onUpdate((prev) => {
      const prevItems = flattenItems(prev);
      const newItems = [...prevItems];
      const [movedItem] = newItems.splice(fromIndex, 1);
      if (!movedItem) return prev;
      newItems.splice(toIndex, 0, movedItem);
      return {
        ...prev,
        categories: [{ name: 'Items', items: newItems }]
      };
    });
  };

  const handleReorderAll = (newItems: BudgetItem[]) => {
    setMobileSortOption('none');
    onUpdate((prev) => ({
      ...prev,
      categories: [{ name: 'Items', items: newItems }]
    }));
  };

  const sortItems = (sortBy: SortOption) => {
    if (sortBy === 'none') return;

    onUpdate((prev) => {
      const prevItems = flattenItems(prev);
      const sorted = [...prevItems].sort((a, b) => {
        switch (sortBy) {
          case 'amount-desc':
            return b.amount - a.amount;
          case 'amount-asc':
            return a.amount - b.amount;
          case 'tag':
            return a.tag.localeCompare(b.tag);
          case 'name':
            return a.name.localeCompare(b.name);
          default:
            return 0;
        }
      });

      return {
        ...prev,
        categories: [{ name: 'Items', items: sorted }]
      };
    });
  };

  const handleIncomeUpdate = (newIncome: number) => {
    onUpdate(prev => ({ ...prev, income: newIncome }));
  };

  const handleMonthUpdate = (newMonth: string) => {
    onUpdate(prev => ({ ...prev, month: newMonth }));
  };

  const handleMobilePanelToggle = () => {
    setMobilePanel(prev => (prev === 'list' ? 'chart' : 'list'));
  };

  const persistMobileEdgeIconY = (value: number) => {
    const normalized = Math.round(value);
    if (!Number.isFinite(normalized) || normalized <= 0) return;
    if (Math.abs(normalized - persistedMobileEdgeIconYRef.current) < 1) return;
    persistedMobileEdgeIconYRef.current = normalized;
    onMobileEdgeIconYChange(normalized);
  };

  const handleMobileEdgeIconClick = () => {
    if (suppressMobileEdgeIconClickRef.current) {
      suppressMobileEdgeIconClickRef.current = false;
      return;
    }
    handleMobilePanelToggle();
  };

  const handleMobileEdgeIconPointerDown = (event: h.JSX.TargetedPointerEvent<HTMLButtonElement>) => {
    if (!isMobileLayout) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    mobileEdgeIconDragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startPointerY: event.clientY,
      startIconY: mobileEdgeIconYRef.current,
      moved: false
    };
    setIsDraggingMobileEdgeIcon(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleMobileEdgeIconPointerMove = (event: h.JSX.TargetedPointerEvent<HTMLButtonElement>) => {
    const dragState = mobileEdgeIconDragRef.current;
    if (!dragState.active || dragState.pointerId !== event.pointerId) return;

    const deltaY = event.clientY - dragState.startPointerY;
    if (Math.abs(deltaY) > MOBILE_EDGE_ICON_TAP_SLOP) {
      dragState.moved = true;
    }

    const viewportHeight = getViewportHeight();
    const nextY = clampMobileEdgeIconY(
      dragState.startIconY + deltaY,
      viewportHeight,
      mobileScaleRef.current
    );
    setMobileEdgeIconY(nextY);
  };

  const finalizeMobileEdgeIconPointer = (pointerId: number) => {
    const dragState = mobileEdgeIconDragRef.current;
    if (!dragState.active || dragState.pointerId !== pointerId) return;

    mobileEdgeIconDragRef.current = {
      active: false,
      pointerId: null,
      startPointerY: 0,
      startIconY: mobileEdgeIconYRef.current,
      moved: false
    };

    if (dragState.moved) {
      suppressMobileEdgeIconClickRef.current = true;
      if (typeof window !== 'undefined') {
        window.setTimeout(() => {
          suppressMobileEdgeIconClickRef.current = false;
        }, 0);
      }
      persistMobileEdgeIconY(mobileEdgeIconYRef.current);
    }

    setIsDraggingMobileEdgeIcon(false);
  };

  const handleMobileEdgeIconPointerUp = (event: h.JSX.TargetedPointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    finalizeMobileEdgeIconPointer(event.pointerId);
  };

  const handleMobileEdgeIconPointerCancel = (event: h.JSX.TargetedPointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    finalizeMobileEdgeIconPointer(event.pointerId);
  };

  const handleTagColorChange = (tag: string, color: string) => {
    const normalizedTag = normalizeTag(tag);
    onUpdate((prev) => ({
      ...prev,
      tagColors: {
        ...normalizeTagColorMap(prev.tagColors),
        [normalizedTag]: color
      }
    }));
  };

  const handleTagRename = (oldTag: string, newTag: string) => {
    const normalizedOld = normalizeTag(oldTag);
    const normalizedNew = normalizeTag(newTag);

    onUpdate((prev) => {
      const prevItems = flattenItems(prev);
      const newItems = prevItems.map(item => {
        const normalizedItemTag = normalizeTag(item.tag);
        if (normalizedItemTag === normalizedOld) {
          return { ...item, tag: normalizedNew };
        }
        return item;
      });

      const newTagColors = normalizeTagColorMap(prev.tagColors);
      if (newTagColors[normalizedOld]) {
        newTagColors[normalizedNew] = newTagColors[normalizedOld];
        delete newTagColors[normalizedOld];
      }

      return {
        ...prev,
        categories: [{ name: 'Items', items: newItems }],
        tagColors: Object.keys(newTagColors).length > 0 ? newTagColors : undefined
      };
    });
  };

  const handleTagDelete = (tag: string) => {
    const normalizedTag = normalizeTag(tag);
    onUpdate((prev) => {
      const prevItems = flattenItems(prev);
      const newItems = prevItems.filter(item => {
        const normalizedItemTag = normalizeTag(item.tag);
        return normalizedItemTag !== normalizedTag;
      });

      const newTagColors = normalizeTagColorMap(prev.tagColors);
      delete newTagColors[normalizedTag];

      return {
        ...prev,
        categories: [{ name: 'Items', items: newItems }],
        tagColors: Object.keys(newTagColors).length > 0 ? newTagColors : undefined
      };
    });
  };

  const handleSplitterPointerDown = (event: h.JSX.TargetedPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    setIsDraggingSplitter(true);
  };

  const handleSplitterReset = () => {
    setSplitRatio(DEFAULT_SPLIT_RATIO);
    persistSplitRatio(DEFAULT_SPLIT_RATIO);
  };

  const handleResolveConflict = async (strategy: ConflictResolutionStrategy) => {
    if (!conflictState || !onResolveConflict || activeConflictAction) {
      return;
    }

    setActiveConflictAction(strategy);
    try {
      await onResolveConflict(strategy);
    } finally {
      setActiveConflictAction(null);
    }
  };

  const handleSplitterKeyDown = (event: h.JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    let delta = 0;
    const step = event.shiftKey ? SPLITTER_STEP_LARGE : SPLITTER_STEP;

    if (event.key === 'ArrowLeft') {
      delta = step;
    } else if (event.key === 'ArrowRight') {
      delta = -step;
    }

    if (!delta) return;

    event.preventDefault();
    const nextRatio = clampSplitRatio(splitRatio + delta);
    setSplitRatio(nextRatio);
    persistSplitRatio(nextRatio);
  };

  const mainPaneStyle = !isMobileLayout
    ? { flexBasis: `${(1 - splitRatio) * 100}%` }
    : undefined;
  const sidebarPaneStyle = !isMobileLayout
    ? { flexBasis: `${splitRatio * 100}%` }
    : undefined;
  const mobileScaleStyle = isMobileLayout
    ? ({ '--budget-mobile-scale': String(mobileScale) } as h.JSX.CSSProperties)
    : undefined;
  const mobileEdgeIconStyle = isMobileLayout
    ? ({
      top: `${Math.round(mobileEdgeIconY)}px`,
      '--budget-mobile-edge-progress': `${mobileEdgeIconProgress}%`
    } as h.JSX.CSSProperties)
    : undefined;
  const conflictDetectedAt = conflictState
    ? new Date(conflictState.detectedAt).toLocaleString()
    : '';

  return (
    <div
      className={`budget-flow ${isMobileLayout ? 'mobile-layout' : ''}`}
      style={mobileScaleStyle}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      {conflictState && (
        <div className="budget-conflict-banner" role="alert">
          <div className="budget-conflict-banner-header">External change detected. Writes paused.</div>
          <div className="budget-conflict-banner-detail">
            Local edits are preserved until you resolve this conflict.
          </div>
          <div className="budget-conflict-banner-meta">
            {conflictState.remoteContentParsable
              ? `Remote content was parsed successfully at ${conflictDetectedAt}.`
              : `Remote content is not parseable as a budget at ${conflictDetectedAt}.`}
          </div>
          <div className="budget-conflict-actions">
            <button
              type="button"
              className="budget-conflict-btn primary"
              disabled={activeConflictAction !== null}
              onClick={() => { void handleResolveConflict('use-remote'); }}
            >
              {activeConflictAction === 'use-remote' ? 'Using Remote...' : 'Use Remote'}
            </button>
            <button
              type="button"
              className="budget-conflict-btn secondary"
              disabled={activeConflictAction !== null}
              onClick={() => { void handleResolveConflict('retry-local'); }}
            >
              {activeConflictAction === 'retry-local' ? 'Retrying...' : 'Retry Local'}
            </button>
            <button
              type="button"
              className="budget-conflict-btn tertiary"
              disabled={activeConflictAction !== null}
              onClick={() => setIsInspectOpen(prev => !prev)}
            >
              {isInspectOpen ? 'Hide Diff' : 'Open Diff'}
            </button>
          </div>
          {isInspectOpen && (
            <div className="budget-conflict-inspect-grid">
              <div className="budget-conflict-inspect-pane">
                <div className="budget-conflict-inspect-title">Local Pending Snapshot</div>
                <pre>{conflictState.pendingLocalSerialized}</pre>
              </div>
              <div className="budget-conflict-inspect-pane">
                <div className="budget-conflict-inspect-title">Remote Current Snapshot</div>
                <pre>{conflictState.latestRemoteContent}</pre>
              </div>
            </div>
          )}
        </div>
      )}
      <BudgetHeader
        month={data.month}
        income={totals.income}
        allocated={totals.totalAllocated}
        unallocated={totals.unallocated}
        onIncomeUpdate={handleIncomeUpdate}
        onMonthUpdate={handleMonthUpdate}
      />

      {isMobileLayout && (
        <button
          type="button"
          className={`budget-mobile-edge-icon ${mobilePanel === 'chart' ? 'chart-open' : ''} ${isDraggingMobileEdgeIcon ? 'dragging' : ''}`}
          aria-label={mobilePanel === 'list' ? 'Open chart panel' : 'Return to list panel'}
          style={mobileEdgeIconStyle}
          onClick={handleMobileEdgeIconClick}
          onPointerDown={handleMobileEdgeIconPointerDown}
          onPointerMove={handleMobileEdgeIconPointerMove}
          onPointerUp={handleMobileEdgeIconPointerUp}
          onPointerCancel={handleMobileEdgeIconPointerCancel}
        >
          <span className="budget-mobile-edge-icon-ring" aria-hidden="true">
            <span className="budget-mobile-edge-icon-hole" />
          </span>
        </button>
      )}

      {isMobileLayout && mobilePanel === 'list' && (
        <div className="budget-mobile-control-bar">
          <select
            className="budget-mobile-sort-select"
            aria-label="Sort items"
            value={mobileSortOption}
            onChange={(e) => {
              const sortBy = (e.target as HTMLSelectElement).value as SortOption;
              setMobileSortOption(sortBy);
              sortItems(sortBy);
            }}
          >
            <option value="none">Manual Order</option>
            <option value="amount-desc">$ High to Low</option>
            <option value="amount-asc">$ Low to High</option>
            <option value="tag">Tag (A to Z)</option>
            <option value="name">Name (A to Z)</option>
          </select>
        </div>
      )}

      <div
        ref={flowBodyRef}
        className={`budget-flow-body ${!isMobileLayout ? 'desktop-resizable' : ''}`}
      >
        {(!isMobileLayout || mobilePanel === 'list') && (
          <div className="budget-flow-main" style={mainPaneStyle}>
            <ItemList
              items={allItems}
              tagColors={normalizedTagColors}
              onItemUpdate={handleItemUpdate}
              onAddItem={handleAddItem}
              onDeleteItem={handleDeleteItem}
              onReorderItem={handleReorderItem}
              onReorderAll={handleReorderAll}
            />
          </div>
        )}

        {!isMobileLayout && (
          <div
            className={`budget-pane-splitter ${isDraggingSplitter ? 'dragging' : ''}`}
            role="separator"
            tabIndex={0}
            aria-label="Resize budget panes"
            aria-orientation="vertical"
            aria-valuemin={Math.round(MIN_SPLIT_RATIO * 100)}
            aria-valuemax={Math.round(MAX_SPLIT_RATIO * 100)}
            aria-valuenow={Math.round(splitRatio * 100)}
            onPointerDown={handleSplitterPointerDown}
            onKeyDown={handleSplitterKeyDown}
            onDblClick={handleSplitterReset}
          />
        )}

        {(!isMobileLayout || mobilePanel === 'chart') && (
          <div ref={chartPaneRef} className="budget-flow-sidebar" style={sidebarPaneStyle}>
            <div className="budget-flow-chart-sticky">
              <AllocationPieChart
                items={allItems}
                totals={totals}
                tagColors={normalizedTagColors}
                chartSize={chartSize}
                onTagColorChange={handleTagColorChange}
                onTagRename={handleTagRename}
                onTagDelete={handleTagDelete}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
