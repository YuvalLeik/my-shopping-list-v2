'use client';

import { useState } from 'react';
import { ShoppingCart, Ban, ChevronDown, Plus, CheckCircle2, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/translations';
import type { GroceryItem } from '@/lib/groceryItems';
import type { DailyPriceRecommendationResult } from '@/lib/analytics';

interface ShoppingViewProps {
  items: GroceryItem[];
  listTitle: string;
  listAvgPrices: Map<string, number>;
  marketBanner: DailyPriceRecommendationResult | null;
  updatingItemId: string | null;
  onToggleCollected: (item: GroceryItem) => void;
  onToggleUnavailable: (item: GroceryItem) => void;
  onAddItem: () => void;
  onFinish: () => void;
  onBackToEdit: () => void;
}

/** Big-touch-target row: the WHOLE row toggles collected (the action done
    dozens of times per trip, one-handed). Secondary actions stop propagation. */
function ShoppingItemRow({
  item,
  variant,
  unitPrice,
  busy,
  onToggle,
  onUnavailable,
}: {
  item: GroceryItem;
  variant: 'pending' | 'collected' | 'unavailable';
  unitPrice: number | null;
  busy: boolean;
  onToggle: () => void;
  onUnavailable?: () => void;
}) {
  const rowStyles =
    variant === 'collected'
      ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/15 opacity-75'
      : variant === 'unavailable'
        ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 opacity-75'
        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 active:bg-emerald-50 dark:active:bg-emerald-900/20';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !busy && onToggle()}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !busy) { e.preventDefault(); onToggle(); } }}
      className={`flex items-center gap-3 min-h-[64px] w-full rounded-xl border p-3 select-none cursor-pointer transition-all duration-150 active:scale-[0.99] ${rowStyles}`}
    >
      {/* Collected indicator */}
      <span
        className={`flex items-center justify-center h-7 w-7 rounded-full border-2 flex-shrink-0 transition-colors ${
          variant === 'collected'
            ? 'bg-emerald-500 border-emerald-500 text-white'
            : variant === 'unavailable'
              ? 'border-amber-400 text-amber-500'
              : 'border-slate-300 dark:border-slate-600'
        }`}
        aria-hidden
      >
        {variant === 'collected' && <CheckCircle2 className="h-5 w-5" />}
        {variant === 'unavailable' && <Ban className="h-4 w-4" />}
      </span>

      {/* Image */}
      <span className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_url} alt="" loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <ShoppingCart className="h-5 w-5 text-slate-300 dark:text-slate-600" />
        )}
      </span>

      {/* Name + meta */}
      <span className="flex-1 min-w-0 text-right">
        <span
          className={`block text-base font-medium leading-snug break-words ${
            variant === 'collected'
              ? 'line-through text-slate-500 dark:text-slate-400'
              : variant === 'unavailable'
                ? 'text-amber-700 dark:text-amber-300'
                : 'text-slate-800 dark:text-slate-100'
          }`}
        >
          {item.name}
        </span>
        {unitPrice != null && unitPrice > 0 && (
          <span className="block text-xs text-slate-400 dark:text-slate-500 mt-0.5" dir="ltr">
            ₪{(unitPrice * item.quantity).toFixed(2)}
          </span>
        )}
      </span>

      {/* Quantity badge */}
      {item.quantity > 1 && (
        <span className="flex-shrink-0 text-sm font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-full px-2.5 py-1">
          ×{item.quantity}
        </span>
      )}

      {/* Mark unavailable (pending rows only) */}
      {variant === 'pending' && onUnavailable && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); if (!busy) onUnavailable(); }}
          title={t.unavailableInStore}
          aria-label={t.unavailableInStore}
          className="flex-shrink-0 p-2.5 rounded-lg text-slate-300 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
        >
          <Ban className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

export default function ShoppingView({
  items,
  listTitle,
  listAvgPrices,
  marketBanner,
  updatingItemId,
  onToggleCollected,
  onToggleUnavailable,
  onAddItem,
  onFinish,
  onBackToEdit,
}: ShoppingViewProps) {
  const [collectedExpanded, setCollectedExpanded] = useState(false);
  const [unavailableExpanded, setUnavailableExpanded] = useState(true);
  const [hintDismissed, setHintDismissed] = useState(false);

  const unitPrice = (item: GroceryItem): number | null => {
    if (item.estimated_price != null && item.estimated_price > 0) return item.estimated_price;
    const avg = listAvgPrices.get(item.name);
    return avg != null && avg > 0 ? avg : null;
  };

  const pending = items.filter((i) => !i.purchased && !i.unavailable);
  const collected = items.filter((i) => i.purchased);
  const unavailable = items.filter((i) => i.unavailable && !i.purchased);

  const collectible = items.length - unavailable.length;
  const progress = collectible > 0 ? Math.round((collected.length / collectible) * 100) : 0;

  const collectedTotal = collected.reduce((s, i) => s + (unitPrice(i) ?? 0) * i.quantity, 0);
  const estimatedTotal = items.reduce((s, i) => s + (unitPrice(i) ?? 0) * i.quantity, 0);

  // Group pending items by category (Hebrew-sorted, same convention as the cart)
  const grouped = new Map<string, GroceryItem[]>();
  for (const item of pending) {
    const cat = item.category || 'ללא קטגוריה';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(item);
  }
  grouped.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name, 'he')));

  const cheapest = marketBanner?.recommendations?.[0];

  return (
    <div className="flex-1 min-h-0 flex flex-col w-full max-w-2xl mx-auto">
      {/* Sticky shopping header */}
      <div className="shrink-0 px-3 sm:px-4 pt-3 pb-2 space-y-2 bg-gradient-to-b from-white to-transparent dark:from-slate-950">
        <div className="flex items-center gap-2 [dir=rtl]:flex-row-reverse">
          <div className="flex-1 min-w-0 text-right">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50 truncate">
              🛒 {listTitle || t.myList}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t.collectedProgress(collected.length, collectible)}
              {unavailable.length > 0 ? ` · ${unavailable.length} ${t.unavailableShort}` : ''}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onBackToEdit} className="flex-shrink-0 text-slate-500">
            <Pencil className="h-4 w-4 me-1" />
            {t.backToEditing}
          </Button>
          <Button
            onClick={onFinish}
            size="sm"
            className="flex-shrink-0 bg-green-600 hover:bg-green-700 text-white"
          >
            <CheckCircle2 className="h-4 w-4 me-1" />
            {t.finishShopping}
          </Button>
        </div>

        {/* Progress bar */}
        <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Running totals */}
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 [dir=rtl]:flex-row-reverse">
          <span dir="ltr">₪{collectedTotal.toFixed(0)} / ~₪{estimatedTotal.toFixed(0)}</span>
          <span>{progress}%</span>
        </div>

        {/* Cheapest store hint */}
        {cheapest && !hintDismissed && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/25 border border-emerald-200 dark:border-emerald-800 px-3 py-1.5 text-xs text-emerald-800 dark:text-emerald-300">
            <span className="flex-1 text-right">
              💡 {t.cheapestHint(cheapest.chainName, Math.round(cheapest.totalBasketCost))}
            </span>
            <button onClick={() => setHintDismissed(true)} aria-label={t.cancel} className="flex-shrink-0 text-emerald-500 hover:text-emerald-700">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Scrollable item list */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y px-3 sm:px-4 pb-28 space-y-4">
        {pending.length === 0 && collected.length === 0 && unavailable.length === 0 ? (
          <div className="py-16 text-center text-slate-400 dark:text-slate-500">
            <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>{t.noItems}</p>
          </div>
        ) : pending.length === 0 ? (
          <div className="py-10 text-center">
            <div className="text-4xl mb-2">🎉</div>
            <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t.allCollected}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t.allCollectedHint}</p>
          </div>
        ) : (
          Array.from(grouped.entries()).map(([category, categoryItems]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2 text-right">
                {category} ({categoryItems.length})
              </h3>
              <div className="space-y-2">
                {categoryItems.map((item) => (
                  <ShoppingItemRow
                    key={item.id}
                    item={item}
                    variant="pending"
                    unitPrice={unitPrice(item)}
                    busy={updatingItemId === item.id}
                    onToggle={() => onToggleCollected(item)}
                    onUnavailable={() => onToggleUnavailable(item)}
                  />
                ))}
              </div>
            </div>
          ))
        )}

        {/* Unavailable section */}
        {unavailable.length > 0 && (
          <div>
            <button
              onClick={() => setUnavailableExpanded(!unavailableExpanded)}
              className="w-full flex items-center justify-between p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-right [dir=rtl]:flex-row-reverse"
            >
              <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                🚫 {t.unavailableInStore} ({unavailable.length})
              </h3>
              <ChevronDown className={`h-4 w-4 text-amber-500 transition-transform ${unavailableExpanded ? 'rotate-180' : ''}`} />
            </button>
            {unavailableExpanded && (
              <div className="space-y-2 mt-2">
                {unavailable.map((item) => (
                  <ShoppingItemRow
                    key={item.id}
                    item={item}
                    variant="unavailable"
                    unitPrice={unitPrice(item)}
                    busy={updatingItemId === item.id}
                    onToggle={() => onToggleUnavailable(item)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Collected section */}
        {collected.length > 0 && (
          <div>
            <button
              onClick={() => setCollectedExpanded(!collectedExpanded)}
              className="w-full flex items-center justify-between p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-right [dir=rtl]:flex-row-reverse"
            >
              <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                ✔️ {t.collectedSection} ({collected.length})
              </h3>
              <ChevronDown className={`h-4 w-4 text-emerald-500 transition-transform ${collectedExpanded ? 'rotate-180' : ''}`} />
            </button>
            {collectedExpanded && (
              <div className="space-y-2 mt-2">
                {collected.map((item) => (
                  <ShoppingItemRow
                    key={item.id}
                    item={item}
                    variant="collected"
                    unitPrice={unitPrice(item)}
                    busy={updatingItemId === item.id}
                    onToggle={() => onToggleCollected(item)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Forgotten-item FAB */}
      <button
        onClick={onAddItem}
        aria-label={t.addNewItem}
        className="fixed z-40 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg flex items-center justify-center right-5 [dir=rtl]:right-auto [dir=rtl]:left-5"
        style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <Plus className="h-6 w-6" />
      </button>
    </div>
  );
}
