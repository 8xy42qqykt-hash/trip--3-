import React, { useState, useRef } from 'react';
import { CaretDown, Trash, PencilSimple } from '@phosphor-icons/react';
import { useTrip } from '../../context/TripContext';
import { GroceryItem } from '../../types';
import { CustomCheckbox } from '../common/CustomCheckbox';
import { BottomSheet } from '../common/BottomSheet';
import { CollapsingHeaderLayout } from '../common/CollapsingHeaderLayout';

export const GroceriesView: React.FC = () => {
  const { groceries, addGrocery, toggleGrocery, editGrocery, deleteGrocery } = useTrip();
  const [quickAdd, setQuickAdd] = useState('');
  const [doneCollapsed, setDoneCollapsed] = useState(true);

  // Edit item state
  const [editingItem, setEditingItem] = useState<GroceryItem | null>(null);
  const [editText, setEditText] = useState('');

  // Delete confirmation state
  const [itemToDelete, setItemToDelete] = useState<GroceryItem | null>(null);

  // Animation tracker
  const [animatingItemId, setAnimatingItemId] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = quickAdd.trim();
    if (!clean) return;
    setQuickAdd('');
    await addGrocery(clean);
  };

  const startEdit = (item: GroceryItem) => {
    setEditingItem(item);
    setEditText(item.quantity ? `${item.text} ${item.quantity}` : item.text);
    setItemToDelete(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editText.trim()) return;
    await editGrocery(editingItem.id, editText.trim());
    setEditingItem(null);
  };

  const handleToggle = (id: string) => {
    setAnimatingItemId(id);
    toggleGrocery(id);
    setTimeout(() => {
      setAnimatingItemId(null);
    }, 400);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    await deleteGrocery(itemToDelete.id);
    setItemToDelete(null);
  };

  const activeItems = groceries.filter((g) => !g.is_done);
  const doneItems = groceries.filter((g) => g.is_done);

  const categoriesOrder = ['Produce', 'Dairy', 'Bakery', 'Meat', 'Drinks', 'Pantry', 'Snacks', 'Household', 'Other'];
  const groupedActive: Record<string, GroceryItem[]> = {};
  for (const item of activeItems) {
    const cat = item.category || 'Other';
    if (!groupedActive[cat]) groupedActive[cat] = [];
    groupedActive[cat].push(item);
  }

  return (
    <CollapsingHeaderLayout
      title="Groceries"
      headerSubContent={
        <form onSubmit={handleAdd} className="mt-1 mb-2">
          <div className="flex items-center bg-[#1c1c1e] rounded-[18px] px-3.5 py-1 border border-white/[0.08]">
            <input
              type="text"
              inputMode="text"
              enterKeyHint="done"
              placeholder="Add item (e.g. 2 milk, pasta 500g)..."
              value={quickAdd}
              onChange={(e) => setQuickAdd(e.target.value)}
              className="flex-1 bg-transparent text-white placeholder:text-slate-500 text-[17px] h-10 outline-none"
            />
            {quickAdd.trim() && (
              <button
                type="submit"
                className="text-sm font-bold text-[#0A84FF] active-press cursor-pointer px-2 py-1"
              >
                Add
              </button>
            )}
          </div>
        </form>
      }
    >
      <div className="space-y-4 pt-1">
        {categoriesOrder.map((cat) => {
          const items = groupedActive[cat];
          if (!items || items.length === 0) return null;

          return (
            <div key={cat} className="space-y-0.5 animate-spring-in">
              <div className="text-xs font-semibold text-slate-400 px-2 py-0.5">
                {cat}
              </div>

              {/* Direct divided list (NO heavy card panel) */}
              <div className="divide-y divide-white/[0.08] overflow-hidden">
                {items.map((item) => (
                  <GroceryRow
                    key={item.id}
                    item={item}
                    isAnimating={animatingItemId === item.id}
                    onToggle={() => handleToggle(item.id)}
                    onLongPress={() => setItemToDelete(item)}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Collapsed Done Group */}
        {doneItems.length > 0 && (
          <div className="pt-3 space-y-0.5">
            <button
              type="button"
              onClick={() => setDoneCollapsed(!doneCollapsed)}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 px-2 active-press cursor-pointer"
            >
              <span>Done ({doneItems.length})</span>
              <CaretDown
                size={14}
                weight="bold"
                className={`transition-transform duration-200 ${doneCollapsed ? '' : 'rotate-180'}`}
              />
            </button>

            {!doneCollapsed && (
              <div className="divide-y divide-white/[0.08] overflow-hidden opacity-75 animate-calm-fade-in">
                {doneItems.map((item) => (
                  <GroceryRow
                    key={item.id}
                    item={item}
                    isAnimating={animatingItemId === item.id}
                    onToggle={() => handleToggle(item.id)}
                    onLongPress={() => setItemToDelete(item)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {groceries.length === 0 && (
          <div className="py-16 text-center text-slate-500 text-sm">
            No grocery items yet
          </div>
        )}
      </div>

      {/* Delete/Edit Prompt Modal */}
      <BottomSheet isOpen={Boolean(itemToDelete)} onClose={() => setItemToDelete(null)}>
        {itemToDelete && (
          <div className="flex flex-col gap-3 py-1">
            <div className="px-1 text-center sm:text-left">
              <h3 className="text-lg font-bold text-white">
                Item Options
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                &ldquo;{itemToDelete.text}&rdquo; {itemToDelete.quantity && `(${itemToDelete.quantity})`}
              </p>
            </div>
            <div className="flex flex-col gap-2.5 pt-2 mb-4">
              <button
                type="button"
                onClick={() => startEdit(itemToDelete)}
                className="w-full h-12 rounded-[20px] bg-white/10 text-white font-bold text-sm flex items-center justify-center gap-2 active-press cursor-pointer hover:bg-white/15 transition-colors"
              >
                <PencilSimple size={18} weight="bold" />
                <span>Edit Item</span>
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="w-full h-12 rounded-[20px] bg-red-500/90 text-white font-bold text-sm flex items-center justify-center gap-2 active-press cursor-pointer shadow-sm hover:bg-red-600 transition-colors"
              >
                <Trash size={18} weight="bold" />
                <span>Delete Item</span>
              </button>
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="w-full h-11 rounded-[18px] text-slate-400 font-semibold text-xs flex items-center justify-center active-press cursor-pointer hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* Edit Item Bottom Sheet */}
      <BottomSheet isOpen={Boolean(editingItem)} onClose={() => setEditingItem(null)}>
        <form onSubmit={handleSaveEdit} className="flex flex-col gap-3.5">
          <div className="text-base font-bold text-white px-1">
            Edit Item
          </div>
          <input
            type="text"
            autoFocus
            inputMode="text"
            enterKeyHint="done"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full h-12 px-4 rounded-[18px] bg-white/10 text-white text-[17px] outline-none border border-white/[0.08]"
          />
          <div className="pt-2 mb-4 flex gap-2.5">
            <button
              type="button"
              onClick={() => setEditingItem(null)}
              className="flex-1 h-12 rounded-[20px] bg-white/10 text-slate-300 font-bold text-sm flex items-center justify-center active-press cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 h-12 rounded-[20px] bg-[#0A84FF] text-white font-bold text-sm flex items-center justify-center active-press cursor-pointer shadow-sm hover:bg-[#007AFF]"
            >
              Save
            </button>
          </div>
        </form>
      </BottomSheet>
    </CollapsingHeaderLayout>
  );
};

interface GroceryRowProps {
  item: GroceryItem;
  isAnimating: boolean;
  onToggle: () => void;
  onLongPress: () => void;
}

const GroceryRow: React.FC<GroceryRowProps> = ({
  item,
  isAnimating,
  onToggle,
  onLongPress,
}) => {
  const pressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    startPosRef.current = { x: e.clientX, y: e.clientY };
    pressTimerRef.current = setTimeout(() => {
      onLongPress();
    }, 420);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!startPosRef.current) return;
    const dx = Math.abs(e.clientX - startPosRef.current.x);
    const dy = Math.abs(e.clientY - startPosRef.current.y);
    if (dx > 8 || dy > 8) {
      if (pressTimerRef.current) {
        clearTimeout(pressTimerRef.current);
        pressTimerRef.current = null;
      }
    }
  };

  const handlePointerUp = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={`relative z-10 flex items-center justify-between min-h-[48px] py-1.5 px-2 hover:bg-white/5 active:bg-white/10 transition-all select-none cursor-pointer ${
        isAnimating ? 'scale-[1.01] bg-white/[0.08]' : ''
      }`}
    >
      <div className="flex items-center gap-3 flex-1 pr-2 truncate">
        <div className={`transition-transform duration-200 ${isAnimating ? 'scale-125' : 'scale-100'}`}>
          <CustomCheckbox checked={item.is_done} onChange={onToggle} size={22} />
        </div>
        <span
          className={`text-[15px] font-medium text-white truncate transition-all duration-300 ${
            item.is_done ? 'line-through text-slate-500' : ''
          }`}
        >
          {item.text}
        </span>
        {item.quantity && (
          <span className="text-xs font-semibold text-slate-400 shrink-0 ml-1.5">
            {item.quantity}
          </span>
        )}
      </div>
    </div>
  );
};
