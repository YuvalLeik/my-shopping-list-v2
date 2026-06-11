'use client';

import { ShoppingCart, ChevronUp } from 'lucide-react';
import { t } from '@/lib/translations';

interface CartBarProps {
  itemCount: number;
  estimatedTotal: number;
  /** True when every item has a (stored or estimated) price; false shows a "~" prefix */
  allPriced?: boolean;
  onOpen: () => void;
}

/**
 * Mobile-only fixed bottom bar showing the current list size and estimated
 * total (like the checkout bar on supermarket sites). Tapping opens the cart.
 */
export default function CartBar({ itemCount, estimatedTotal, allPriced = true, onOpen }: CartBarProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t.openCart}
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex items-center justify-between gap-3 bg-blue-600 text-white px-4 py-3 shadow-[0_-2px_10px_rgba(0,0,0,0.15)] active:bg-blue-700"
    >
      <span className="flex items-center gap-2 font-semibold text-sm">
        <span className="relative">
          <ShoppingCart className="size-6" />
          {itemCount > 0 && (
            <span className="absolute -top-2 -end-2 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold size-5">
              {itemCount}
            </span>
          )}
        </span>
        {t.cartItemsCount(itemCount)}
      </span>
      <span className="flex items-center gap-2 text-sm font-bold">
        {estimatedTotal > 0 && (
          <span dir="ltr">{allPriced ? '' : '~'}₪{estimatedTotal.toFixed(2)}</span>
        )}
        <ChevronUp className="size-5" />
      </span>
    </button>
  );
}
