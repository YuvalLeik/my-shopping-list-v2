'use client';

import { useState } from 'react';
import { ChevronDown, Loader2, RefreshCw } from 'lucide-react';
import type { DailyPriceRecommendationResult } from '@/lib/analytics';

interface Props {
  result: DailyPriceRecommendationResult | null;
  /** Items still to buy, for the "priced X of Y" coverage line. */
  listItemCount: number;
  refreshing: boolean;
  onRefresh: () => void;
  compact?: boolean;
}

function timeAgo(iso: string, now: number): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hours = Math.round(mins / 60);
  if (hours < 36) return `לפני ${hours} שע׳`;
  return `לפני ${Math.round(hours / 24)} ימים`;
}

const shekel = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`;

/**
 * "Cheapest today for this list" among the family's own chains, priced on
 * the same basket at every chain. Says plainly when coverage is too thin.
 */
export function CheapestStoreBanner({ result, listItemCount, refreshing, onRefresh, compact }: Props) {
  const [open, setOpen] = useState(false);
  // Captured once per mount; "updated 3h ago" doesn't need to tick.
  const [now] = useState(() => Date.now());
  const ranked = result?.recommendations.filter((r) => !r.isLowCoverage) ?? [];
  const best = ranked[0];
  const priciest = ranked[ranked.length - 1];
  const stale = result?.fetchedAt ? now - new Date(result.fetchedAt).getTime() > 36 * 3600_000 : false;

  const refreshButton = (
    <button
      type="button"
      onClick={onRefresh}
      disabled={refreshing}
      aria-label="רענן מחירים"
      title="רענן מחירים לרשימה הזו"
      className="flex-shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-full text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 disabled:opacity-60"
    >
      {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
    </button>
  );

  if (!best) {
    if (listItemCount === 0) return null;
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
        <span className="flex-1">
          💰 {result && result.coveredItems > 0
            ? `יש מחירים רק ל-${result.coveredItems} פריטים — מעט מדי כדי להמליץ על סופר`
            : 'עדיין אין מחירי סופרים לפריטים ברשימה'}
        </span>
        {refreshButton}
      </div>
    );
  }

  // Under ~30% of the list priced: still useful, but say so up front.
  const partial = result!.coveredItems < Math.max(3, listItemCount * 0.3);
  const savings = priciest && priciest !== best ? priciest.totalBasketCost - best.totalBasketCost : 0;

  return (
    <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/25 text-emerald-900 dark:text-emerald-100">
      <div className="flex items-start gap-2 px-3 py-2">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex-1 min-w-0 text-start">
          <div className={compact ? 'text-xs' : 'text-sm'}>
            💰 {partial ? `לפי ${result!.coveredItems} פריטים מתומחרים, הכי זול: ` : 'הכי זול היום לרשימה: '}
            <strong>{best.chainName}</strong> {shekel(best.totalBasketCost)}
            {savings >= 1 && (
              <span className="text-emerald-700 dark:text-emerald-300"> · חוסך {shekel(savings)} מול {priciest.chainName}</span>
            )}
          </div>
          <div className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 mt-0.5 flex items-center gap-1">
            <span>מחירים ל-{result!.coveredItems} מתוך {listItemCount} פריטים</span>
            {result!.fetchedAt && (
              <span className={stale ? 'text-amber-700 dark:text-amber-400 font-medium' : ''}>
                · עודכן {timeAgo(result!.fetchedAt, now)}
              </span>
            )}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
          </div>
        </button>
        {refreshButton}
      </div>
      {open && (
        <ul className="border-t border-emerald-200 dark:border-emerald-800 px-3 py-2 space-y-1 text-xs">
          {result!.recommendations.map((r) => (
            <li key={r.chainName} className="flex items-center gap-2">
              <span className={`flex-1 ${r === best ? 'font-bold' : ''}`}>{r.chainName}</span>
              <span className="text-emerald-700/70 dark:text-emerald-300/70">
                {r.isLowCoverage ? `רק ${r.realItemCount} פריטים` : `${r.realItemCount}/${result!.coveredItems} פריטים`}
              </span>
              <span dir="ltr" className="w-16 text-end font-medium">{r.isLowCoverage ? '—' : shekel(r.totalBasketCost)}</span>
            </li>
          ))}
          <li className="pt-1 text-[11px] text-emerald-700/70 dark:text-emerald-300/70">
            כל הרשתות מתומחרות על אותו סל; פריט שחסר ברשת מוערך לפי ממוצע הרשתות האחרות.
          </li>
        </ul>
      )}
    </div>
  );
}
