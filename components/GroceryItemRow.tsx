'use client';

import { Loader2, ShoppingCart, Plus, Trash2, Minus, Camera, Ban, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/translations';
import type { GroceryItem } from '@/lib/groceryItems';

interface GroceryItemRowProps {
  item: GroceryItem;
  variant: 'active' | 'unavailable' | 'purchased';
  onTogglePurchased: (item: GroceryItem) => void;
  onToggleUnavailable: (item: GroceryItem) => void;
  onQuantityChange: (item: GroceryItem, delta: number) => void;
  onDelete: (itemId: string) => void;
  onUpdateImage: (itemId: string, file: File) => void;
  updatingItemId: string | null;
  deletingItemId: string | null;
  uploadingImageForItem: string | null;
  selectionModeActive: boolean;
  selectedItemIds: Set<string>;
  toggleItemSelection: (itemId: string) => void;
  bulkDeleting: boolean;
}

export function GroceryItemRow({
  item,
  variant,
  onTogglePurchased,
  onToggleUnavailable,
  onQuantityChange,
  onDelete,
  onUpdateImage,
  updatingItemId,
  deletingItemId,
  uploadingImageForItem,
  selectionModeActive,
  selectedItemIds,
  toggleItemSelection,
  bulkDeleting,
}: GroceryItemRowProps) {
  if (variant === 'unavailable') {
    return (
      <li className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-4 border border-amber-200 dark:border-amber-800 rounded-lg bg-amber-50/50 dark:bg-amber-900/10 transition-colors [dir=rtl]:flex-row-reverse">
        <div className="w-10 h-10 sm:w-16 sm:h-16 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 overflow-hidden opacity-60">
          {item.image_url ? (
            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
          ) : (
            <ShoppingCart className="h-4 w-4 sm:h-6 sm:w-6 text-slate-400" />
          )}
        </div>
        <div className="flex-1 text-right min-w-0">
          <div className="font-medium text-sm sm:text-base text-amber-700 dark:text-amber-300 truncate">
            {item.name}
          </div>
          <div className="text-xs sm:text-sm text-amber-500 dark:text-amber-500 mt-0.5">
            {item.category || 'ללא קטגוריה'} · כמות: {item.quantity}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onToggleUnavailable(item)}
          disabled={updatingItemId === item.id}
          className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 flex-shrink-0 h-8 px-2"
          title={t.markAvailable}
        >
          <Undo2 className="h-4 w-4 ml-1" />
          <span className="text-xs hidden sm:inline">{t.markAvailable}</span>
        </Button>
      </li>
    );
  }

  if (variant === 'purchased') {
    return (
      <li className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/30 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors opacity-75 [dir=rtl]:flex-row-reverse">
        {selectionModeActive && (
          <input
            type="checkbox"
            checked={selectedItemIds.has(item.id)}
            onChange={() => toggleItemSelection(item.id)}
            disabled={bulkDeleting}
            className="w-4 h-4 rounded border-slate-400 text-slate-600 focus:ring-slate-500 cursor-pointer flex-shrink-0"
            aria-label={t.selectAll}
          />
        )}
        <input
          type="checkbox"
          checked={item.purchased || false}
          onChange={() => onTogglePurchased(item)}
          disabled={updatingItemId === item.id}
          className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
        />
        <div className="w-10 h-10 sm:w-16 sm:h-16 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {item.image_url ? (
            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
          ) : (
            <ShoppingCart className="h-4 w-4 sm:h-6 sm:w-6 text-slate-400" />
          )}
        </div>
        <div className="flex-1 text-right min-w-0">
          <div className="font-medium text-sm sm:text-base text-slate-700 dark:text-slate-200 line-through truncate">
            {item.name}
          </div>
          <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {item.category || 'ללא קטגוריה'}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 w-6 sm:w-8 text-center">
            {item.quantity}
          </span>
        </div>
      </li>
    );
  }

  // variant === 'active'
  return (
    <li className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors [dir=rtl]:flex-row-reverse">
      {selectionModeActive && (
        <input
          type="checkbox"
          checked={selectedItemIds.has(item.id)}
          onChange={() => toggleItemSelection(item.id)}
          disabled={bulkDeleting}
          className="w-4 h-4 rounded border-slate-400 text-slate-600 focus:ring-slate-500 cursor-pointer flex-shrink-0"
          aria-label={t.selectAll}
        />
      )}
      <input
        type="checkbox"
        checked={item.purchased || false}
        onChange={() => onTogglePurchased(item)}
        disabled={updatingItemId === item.id}
        className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer flex-shrink-0"
      />
      <div className="relative w-10 h-10 sm:w-16 sm:h-16 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 overflow-hidden group">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <ShoppingCart className="h-4 w-4 sm:h-6 sm:w-6 text-slate-400" />
        )}
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpdateImage(item.id, file);
            e.target.value = '';
          }}
          disabled={uploadingImageForItem === item.id}
          className="hidden"
          id={`image-upload-${item.id}`}
        />
        <label
          htmlFor={`image-upload-${item.id}`}
          className={`absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer ${uploadingImageForItem === item.id ? 'opacity-100' : ''}`}
          title="עדכן תמונה"
        >
          {uploadingImageForItem === item.id ? (
            <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 text-white animate-spin" />
          ) : (
            <Camera className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
          )}
        </label>
      </div>
      <div className="flex-1 min-w-0 text-right overflow-hidden">
        <div className="font-medium text-sm sm:text-base text-slate-700 dark:text-slate-200 truncate">
          {item.name}
        </div>
        <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5 truncate">
          {item.category || 'ללא קטגוריה'}
          {item.estimated_price != null && item.estimated_price > 0 && (
            <span className="text-emerald-600 dark:text-emerald-400 mr-2">
              · ₪{(item.estimated_price * item.quantity).toFixed(2)}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 [dir=rtl]:flex-row-reverse">
        <div className="flex items-center gap-1 sm:gap-2">
          <Button variant="outline" size="sm" onClick={() => onQuantityChange(item, -1)} disabled={item.quantity <= 1 || updatingItemId === item.id} className="h-7 w-7 sm:h-8 sm:w-8 p-0">
            <Minus className="h-3 w-3 sm:h-4 sm:w-4" />
          </Button>
          <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 w-6 sm:w-8 text-center">
            {item.quantity}
          </span>
          <Button variant="outline" size="sm" onClick={() => onQuantityChange(item, 1)} disabled={updatingItemId === item.id} className="h-7 w-7 sm:h-8 sm:w-8 p-0">
            <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onToggleUnavailable(item)}
          disabled={updatingItemId === item.id}
          className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 flex-shrink-0 h-7 w-7 sm:h-8 sm:w-auto p-0 sm:px-2"
          title={t.markUnavailable}
        >
          <Ban className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(item.id)}
          disabled={deletingItemId === item.id || bulkDeleting}
          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0 h-7 w-7 sm:h-8 sm:w-auto p-0 sm:px-2"
        >
          {deletingItemId === item.id ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Trash2 className="h-4 w-4 sm:hidden" />
              <span className="hidden sm:inline">{t.delete}</span>
            </>
          )}
        </Button>
      </div>
    </li>
  );
}
