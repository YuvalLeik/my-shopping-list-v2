'use client';

import { Plus, Minus, Trash2 } from 'lucide-react';
import { CatalogEntry } from '@/lib/catalogView';
import { CATEGORY_ICONS } from '@/lib/categories';
import { GroceryItem } from '@/lib/groceryItems';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/translations';

interface ProductCardProps {
  entry: CatalogEntry;
  inListItem?: GroceryItem;
  busy?: boolean;
  onAdd: (entry: CatalogEntry) => void;
  onQuantityChange: (item: GroceryItem, newQuantity: number) => void;
  onRemove: (item: GroceryItem) => void;
}

/** Supermarket-style price: large integer part, superscript decimals. */
export function PriceTag({ value, className = '' }: { value: number; className?: string }) {
  const [whole, cents] = value.toFixed(2).split('.');
  return (
    <span dir="ltr" className={`inline-flex items-start font-bold leading-none ${className}`}>
      <span className="text-sm mt-0.5 me-0.5">₪</span>
      <span className="text-xl">{whole}</span>
      <span className="text-xs mt-0.5">.{cents}</span>
    </span>
  );
}

export default function ProductCard({
  entry,
  inListItem,
  busy,
  onAdd,
  onQuantityChange,
  onRemove,
}: ProductCardProps) {
  const icon = CATEGORY_ICONS[entry.category] ?? '🛒';

  return (
    <div className="group flex flex-col rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Image */}
      <div className="relative w-full aspect-square bg-white dark:bg-slate-700/40 flex items-center justify-center overflow-hidden">
        {entry.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.image_url}
            alt={entry.name}
            loading="lazy"
            className="h-full w-full object-contain p-2"
          />
        ) : (
          <span className="text-5xl opacity-60" aria-hidden>
            {icon}
          </span>
        )}
        {entry.cheapestChain && entry.cheapestPrice != null && (
          <span className="absolute top-1.5 start-1.5 rounded-full bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 shadow">
            {t.cheapestToday}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-1 p-2.5 pt-1.5">
        <div
          className="text-sm font-medium text-slate-800 dark:text-slate-100 leading-snug line-clamp-2 min-h-[2.5em]"
          title={entry.name}
        >
          {entry.name}
        </div>

        <div className="flex items-end justify-between gap-1 min-h-[1.75rem]">
          {entry.avgPrice != null ? (
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-none">
                {t.avgPaidPrice}
              </span>
              <PriceTag value={entry.avgPrice} className="text-slate-900 dark:text-slate-100" />
            </div>
          ) : (
            <span />
          )}
          {entry.cheapestChain && entry.cheapestPrice != null && (
            <span
              className="text-[10px] text-red-600 dark:text-red-400 font-medium text-end leading-tight"
              title={`${entry.cheapestChain}: ₪${entry.cheapestPrice.toFixed(2)}`}
            >
              {entry.cheapestChain}
              <br />
              <span dir="ltr">₪{entry.cheapestPrice.toFixed(2)}</span>
            </span>
          )}
        </div>

        {/* Action: add button or quantity stepper */}
        {inListItem ? (
          <div className="flex items-center justify-between rounded-full border border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 px-1 py-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900"
              disabled={busy}
              aria-label={`הוסף עוד ${entry.name}`}
              onClick={() => onQuantityChange(inListItem, inListItem.quantity + 1)}
            >
              <Plus className="size-4" />
            </Button>
            <span className="text-sm font-bold text-emerald-800 dark:text-emerald-200 min-w-6 text-center">
              {inListItem.quantity}
            </span>
            {inListItem.quantity > 1 ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900"
                disabled={busy}
                aria-label={`הפחת כמות ${entry.name}`}
                onClick={() => onQuantityChange(inListItem, inListItem.quantity - 1)}
              >
                <Minus className="size-4" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                disabled={busy}
                aria-label={`הסר ${entry.name} מהרשימה`}
                onClick={() => onRemove(inListItem)}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        ) : (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onAdd(entry)}
            className="h-10 rounded-full border-blue-500 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 font-semibold"
            aria-label={`הוסף ${entry.name} לרשימה`}
          >
            <Plus className="size-4" />
            {t.addToList}
          </Button>
        )}
      </div>
    </div>
  );
}
