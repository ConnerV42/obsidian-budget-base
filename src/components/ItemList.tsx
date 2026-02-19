import { h } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import { BudgetItem, getTagColor } from '../parser';
import { normalizeTag } from './tagSelection';
import { EditCommitGuard } from './editCommitGuard';

interface ItemListProps {
  items: BudgetItem[];
  tagColors: Record<string, string>;
  disabled?: boolean;
  disabledMessage?: string;
  onItemUpdate: (index: number, field: 'tag' | 'name' | 'amount', value: string | number) => void;
  onAddItem: (tag: string, name: string, amount: number) => void;
  onDeleteItem: (index: number) => void;
  onReorderItem: (fromIndex: number, toIndex: number) => void;
  onReorderAll: (newItems: BudgetItem[]) => void;
}

type EditingField = { index: number; field: 'tag' | 'name' | 'amount' } | null;

type SortOption = 'none' | 'amount-desc' | 'amount-asc' | 'tag' | 'name';

// Capitalize first letter of a string
const capitalizeFirst = (str: string) => {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

// Calculate relative luminance and return appropriate text color
const getContrastTextColor = (bgColor: string): string => {
  // Parse hex color
  const hex = bgColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16) / 255;
  const g = parseInt(hex.substr(2, 2), 16) / 255;
  const b = parseInt(hex.substr(4, 2), 16) / 255;
  
  // Calculate relative luminance (WCAG formula)
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  
  // Return black for light backgrounds, white for dark
  return luminance > 0.5 ? '#000000' : '#ffffff';
};

export function ItemList({ 
  items,
  tagColors,
  disabled = false,
  disabledMessage = 'Set compensation first to unlock allocation editing.',
  onItemUpdate, 
  onAddItem, 
  onDeleteItem, 
  onReorderItem,
  onReorderAll
}: ItemListProps) {
  // Get color for tag (custom colors override defaults)
  const getColor = (tag: string) => {
    const normalized = normalizeTag(tag);
    return tagColors[normalized] || getTagColor(tag);
  };
  const [editing, setEditing] = useState<EditingField>(null);
  const [editValue, setEditValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newItem, setNewItem] = useState({ tag: 'Item', name: '', amount: '0' });
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dragOverRef = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const deleteTimeoutRef = useRef<number | null>(null);
  const editCommitGuardRef = useRef(new EditCommitGuard());

  const setItemRef = (index: number) => (el: HTMLDivElement | null) => {
    itemRefs.current[index] = el;
  };

  const handleSort = (sortBy: SortOption) => {
    if (disabled) return;
    if (sortBy === 'none') return;
    
    const sorted = [...items].sort((a, b) => {
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
    onReorderAll(sorted);
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      const length = inputRef.current.value.length;
      inputRef.current.setSelectionRange(length, length);
    }
  }, [editing]);

  useEffect(() => {
    return () => {
      if (deleteTimeoutRef.current !== null) {
        window.clearTimeout(deleteTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handlePointerDownOutside = (event: PointerEvent) => {
      if (!listRef.current?.contains(event.target as Node)) {
        setFocusedRowIndex(null);
        setPendingDeleteIndex(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDownOutside);
    return () => document.removeEventListener('pointerdown', handlePointerDownOutside);
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const startEditing = (index: number, field: 'tag' | 'name' | 'amount', currentValue: string | number) => {
    if (disabled) return;
    editCommitGuardRef.current.startEditing();
    setFocusedRowIndex(index);
    setPendingDeleteIndex(null);
    setEditing({ index, field });
    setEditValue(String(currentValue));
  };

  const saveEdit = () => {
    if (disabled) return;
    if (!editing) return;
    if (!editCommitGuardRef.current.beginCommit()) return;
    
    const { index, field } = editing;
    let value: string | number = editValue;
    
    if (field === 'amount') {
      value = parseFloat(editValue.replace(/[^0-9.-]/g, '')) || 0;
    } else if (field === 'tag') {
      value = capitalizeFirst(editValue.trim());
    }
    
    setEditing(null);
    onItemUpdate(index, field, value);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      editCommitGuardRef.current.reset();
      setEditing(null);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      navigateField(e.shiftKey ? 'prev' : 'next');
    }
  };

  const navigateField = (direction: 'next' | 'prev') => {
    if (disabled) return;
    if (!editing) return;
    
    const { index, field } = editing;
    const fields: ('tag' | 'name' | 'amount')[] = ['tag', 'name', 'amount'];
    const currentFieldIndex = fields.indexOf(field);
    
    saveEdit();
    
    if (direction === 'next') {
      if (currentFieldIndex < fields.length - 1) {
        const nextField = fields[currentFieldIndex + 1];
        const item = items[index];
        startEditing(index, nextField, item[nextField]);
      } else if (index < items.length - 1) {
        const item = items[index + 1];
        startEditing(index + 1, 'tag', item.tag);
      }
    } else {
      if (currentFieldIndex > 0) {
        const prevField = fields[currentFieldIndex - 1];
        const item = items[index];
        startEditing(index, prevField, item[prevField]);
      } else if (index > 0) {
        const item = items[index - 1];
        startEditing(index - 1, 'amount', item.amount);
      }
    }
  };

  useEffect(() => {
    if (!editing) {
      editCommitGuardRef.current.reset();
    }
  }, [editing]);

  useEffect(() => {
    if (!disabled) return;
    setEditing(null);
    setIsAdding(false);
    setPendingDeleteIndex(null);
    setFocusedRowIndex(null);
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, [disabled]);

  // PointerEvent-based drag and drop (works on both mouse and touch)
  const handlePointerDown = (e: PointerEvent, index: number) => {
    if (disabled) return;
    if (e.button !== 0) return;
    e.preventDefault();

    const draggedEl = itemRefs.current[index];
    const startY = e.clientY;
    const itemHeight = draggedEl?.getBoundingClientRect().height ?? 0;

    setDraggedIndex(index);
    dragOverRef.current = null;

    // Snapshot midpoints of all items before any transforms
    const midpoints: number[] = [];
    for (let i = 0; i < itemRefs.current.length; i++) {
      const el = itemRefs.current[i];
      if (el) {
        const rect = el.getBoundingClientRect();
        midpoints[i] = rect.top + rect.height / 2;
      }
    }

    // Add transition to non-dragged items for smooth shifting
    for (let i = 0; i < itemRefs.current.length; i++) {
      const el = itemRefs.current[i];
      if (!el || i === index) continue;
      el.style.transition = 'transform 150ms ease';
    }

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const y = moveEvent.clientY;

      // Move the dragged element to follow the pointer
      if (draggedEl) {
        draggedEl.style.transform = `translateY(${y - startY}px)`;
        draggedEl.style.zIndex = '100';
      }

      // Calculate insertion index by counting how many midpoints
      // the pointer has crossed past the dragged item's original position
      let insertionIndex = index;

      // Check items below: each crossed midpoint moves insertion down
      for (let i = index + 1; i < midpoints.length; i++) {
        if (midpoints[i] !== undefined && y > midpoints[i]) {
          insertionIndex = i;
        } else {
          break;
        }
      }

      // Check items above: each crossed midpoint moves insertion up
      if (insertionIndex === index) {
        for (let i = index - 1; i >= 0; i--) {
          if (midpoints[i] !== undefined && y < midpoints[i]) {
            insertionIndex = i;
          } else {
            break;
          }
        }
      }

      const newOverIndex = insertionIndex === index ? null : insertionIndex;

      if (newOverIndex !== dragOverRef.current) {
        dragOverRef.current = newOverIndex;

        // Shift items between original position and insertion point
        for (let i = 0; i < itemRefs.current.length; i++) {
          const el = itemRefs.current[i];
          if (!el || i === index) continue;

          let offset = 0;
          if (newOverIndex !== null) {
            if (index < newOverIndex && i > index && i <= newOverIndex) {
              offset = -itemHeight;
            }
            if (index > newOverIndex && i >= newOverIndex && i < index) {
              offset = itemHeight;
            }
          }

          el.style.transform = offset ? `translateY(${offset}px)` : '';
        }
      }
    };

    const handlePointerUp = () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);

      // Reset all element styles
      for (let i = 0; i < itemRefs.current.length; i++) {
        const el = itemRefs.current[i];
        if (!el) continue;
        el.style.transition = '';
        el.style.transform = '';
        el.style.zIndex = '';
      }

      const toIndex = dragOverRef.current;
      if (toIndex !== null && toIndex !== index) {
        onReorderItem(index, toIndex);
      }

      dragOverRef.current = null;
      setDraggedIndex(null);
      setDragOverIndex(null);
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  };

  const handleAddItem = () => {
    if (disabled) return;
    if (newItem.name.trim()) {
      const amount = parseFloat(newItem.amount.replace(/[^0-9.-]/g, '')) || 0;
      const tag = capitalizeFirst(newItem.tag.trim()) || 'Item';
      onAddItem(tag, newItem.name.trim(), amount);
      setNewItem({ tag: 'Item', name: '', amount: '0' });
      setIsAdding(false);
    }
  };

  const schedulePendingDeleteReset = () => {
    if (deleteTimeoutRef.current !== null) {
      window.clearTimeout(deleteTimeoutRef.current);
    }
    deleteTimeoutRef.current = window.setTimeout(() => {
      setPendingDeleteIndex(null);
    }, 2500);
  };

  const handleDeleteClick = (e: h.JSX.TargetedMouseEvent<HTMLButtonElement>, index: number) => {
    if (disabled) return;
    e.stopPropagation();
    setFocusedRowIndex(index);
    if (pendingDeleteIndex === index) {
      if (deleteTimeoutRef.current !== null) {
        window.clearTimeout(deleteTimeoutRef.current);
      }
      setPendingDeleteIndex(null);
      setFocusedRowIndex(null);
      onDeleteItem(index);
      return;
    }
    setPendingDeleteIndex(index);
    schedulePendingDeleteReset();
  };

  const renderEditableField = (item: BudgetItem, index: number, field: 'tag' | 'name' | 'amount') => {
    if (disabled) {
      if (field === 'amount') {
        return (
          <span className="budget-item-amount">
            {formatCurrency(item.amount)}
          </span>
        );
      }
      if (field === 'tag') {
        const bgColor = getColor(item.tag);
        return (
          <span className="budget-item-tag" style={{ backgroundColor: bgColor, color: getContrastTextColor(bgColor) }}>
            {item.tag}
          </span>
        );
      }
      return <span className="budget-item-name">{item.name}</span>;
    }

    const isEditing = editing?.index === index && editing?.field === field;
    
    if (field === 'tag') {
      if (isEditing) {
        return (
          <input
            ref={inputRef}
            type="text"
            className="budget-item-tag-input budget-inline-edit-input"
            value={editValue}
            size={Math.min(Math.max(editValue.length, 4), 14)}
            onInput={(e) => setEditValue((e.target as HTMLInputElement).value)}
            onBlur={saveEdit}
            onKeyDown={handleKeyDown}
          />
        );
      }
      const bgColor = getColor(item.tag);
      return (
        <span 
          className="budget-item-tag clickable"
          style={{ backgroundColor: bgColor, color: getContrastTextColor(bgColor) }}
          onClick={(e) => { e.stopPropagation(); startEditing(index, 'tag', item.tag); }}
        >
          {item.tag}
        </span>
      );
    }
    
    if (field === 'name') {
      if (isEditing) {
        return (
          <input
            ref={inputRef}
            type="text"
            className="budget-item-name-input budget-inline-edit-input"
            value={editValue}
            size={Math.min(Math.max(editValue.length, 6), 32)}
            onInput={(e) => setEditValue((e.target as HTMLInputElement).value)}
            onBlur={saveEdit}
            onKeyDown={handleKeyDown}
          />
        );
      }
      return (
        <span 
          className="budget-item-name clickable"
          onClick={(e) => { e.stopPropagation(); startEditing(index, 'name', item.name); }}
        >
          {item.name}
        </span>
      );
    }
    
    if (field === 'amount') {
      if (isEditing) {
        return (
          <input
            ref={inputRef}
            type="text"
            className="budget-item-input budget-inline-edit-input"
            value={editValue}
            size={Math.min(Math.max(editValue.length, 4), 10)}
            enterKeyHint="done"
            autoCapitalize="off"
            autoComplete="off"
            spellCheck={false}
            onInput={(e) => setEditValue((e.target as HTMLInputElement).value)}
            onBlur={saveEdit}
            onKeyDown={handleKeyDown}
          />
        );
      }
      return (
        <span 
          className="budget-item-amount clickable"
          onClick={(e) => { e.stopPropagation(); startEditing(index, 'amount', item.amount); }}
        >
          {formatCurrency(item.amount)}
        </span>
      );
    }
  };

  return (
    <div className={`budget-item-list ${disabled ? 'locked' : ''}`} ref={listRef}>
      {disabled && (
        <div className="budget-item-lock-note" role="note">
          {disabledMessage}
        </div>
      )}
      <div className="budget-sort-controls">
        <span className="budget-sort-label">Sort:</span>
        <button className="budget-sort-btn" disabled={disabled} onClick={() => handleSort('amount-desc')}>$ High→Low</button>
        <button className="budget-sort-btn" disabled={disabled} onClick={() => handleSort('amount-asc')}>$ Low→High</button>
        <button className="budget-sort-btn" disabled={disabled} onClick={() => handleSort('tag')}>Tag</button>
        <button className="budget-sort-btn" disabled={disabled} onClick={() => handleSort('name')}>Name</button>
      </div>
      {items.map((item, index) => (
        <div
          ref={setItemRef(index)}
          key={`${index}-${item.name}`}
          className={`budget-item ${draggedIndex === index ? 'dragging' : ''} ${dragOverIndex === index ? 'drag-over' : ''} ${focusedRowIndex === index ? 'row-focused' : ''}`}
          onClick={() => {
            setFocusedRowIndex(index);
            if (pendingDeleteIndex !== index) {
              setPendingDeleteIndex(null);
            }
          }}
        >
          <div className="budget-item-left">
            <span
              className="budget-item-drag-handle"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => handlePointerDown(e as unknown as PointerEvent, index)}
            >⋮⋮</span>
            {renderEditableField(item, index, 'name')}
            {renderEditableField(item, index, 'tag')}
          </div>
          <div className="budget-item-right">
            {renderEditableField(item, index, 'amount')}
            <button
              className={`budget-item-delete ${pendingDeleteIndex === index ? 'confirming' : ''}`}
              disabled={disabled}
              onClick={(e) => handleDeleteClick(e, index)}
              title={pendingDeleteIndex === index ? 'Tap again to confirm delete' : 'Delete item'}
            >
              {pendingDeleteIndex === index ? 'Delete?' : '×'}
            </button>
          </div>
        </div>
      ))}
      
      {!disabled && isAdding ? (
        <div className="budget-item budget-item-adding">
          <div className="budget-item-left">
            <span className="budget-item-drag-handle" style={{ opacity: 0 }}>⋮⋮</span>
            <input
              type="text"
              className="budget-item-tag-input budget-inline-edit-input"
              placeholder="tag"
              value={newItem.tag}
              size={Math.min(Math.max(newItem.tag.length, 4), 10)}
              onInput={(e) => setNewItem({ ...newItem, tag: (e.target as HTMLInputElement).value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddItem();
                if (e.key === 'Escape') setIsAdding(false);
              }}
              autoFocus
            />
            <input
              type="text"
              className="budget-item-name-input budget-inline-edit-input budget-inline-edit-flex"
              placeholder="Item name"
              value={newItem.name}
              onInput={(e) => setNewItem({ ...newItem, name: (e.target as HTMLInputElement).value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddItem();
                if (e.key === 'Escape') setIsAdding(false);
              }}
            />
          </div>
          <div className="budget-item-right">
            <input
              type="text"
              className="budget-item-input budget-inline-edit-input"
              placeholder="0"
              value={newItem.amount}
              size={Math.min(Math.max(newItem.amount.length, 4), 10)}
              enterKeyHint="done"
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
              onInput={(e) => setNewItem({ ...newItem, amount: (e.target as HTMLInputElement).value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddItem();
                if (e.key === 'Escape') setIsAdding(false);
              }}
            />
            <button className="budget-item-save" onClick={handleAddItem}>✓</button>
            <button className="budget-item-cancel" onClick={() => setIsAdding(false)}>×</button>
          </div>
        </div>
      ) : !disabled ? (
        <button className="budget-add-item-btn" onClick={() => setIsAdding(true)}>
          + Add item
        </button>
      ) : null
      }
    </div>
  );
}
