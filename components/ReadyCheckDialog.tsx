'use client';

import { useState } from 'react';
import { Loader2, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ItemSuggestion } from '@/lib/suggestions';
import type { StoreRecommendation } from '@/lib/analytics';

interface Props {
  open: boolean;
  /** Regular items not on the list — "usually you also buy…". */
  forgotten: ItemSuggestion[];
  cheapest: StoreRecommendation | null;
  /** Estimated list total and the family's usual spend per shop. */
  estimatedTotal: number;
  usualSpend: number | null;
  onCancel: () => void;
  onConfirm: (add: ItemSuggestion[]) => Promise<void>;
}

/** Last look before shopping: likely-forgotten items, cheapest chain, spend vs. usual. */
export function ReadyCheckDialog({ open, forgotten, cheapest, estimatedTotal, usualSpend, onCancel, onConfirm }: Props) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const toggle = (name: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm(forgotten.filter((f) => picked.has(f.name)));
      setPicked(new Set());
    } finally {
      setBusy(false);
    }
  };

  const diff = usualSpend != null && estimatedTotal > 0 ? Math.round(estimatedTotal - usualSpend) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onCancel(); }}>
      <DialogContent dir="rtl" className="text-right max-h-[85vh] overflow-y-auto">
        <DialogHeader className="text-right sm:text-right ps-8">
          <DialogTitle>רגע לפני הקנייה</DialogTitle>
          <DialogDescription>בדיקה אחרונה שלא שכחתם כלום.</DialogDescription>
        </DialogHeader>

        {forgotten.length > 0 && (
          <div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-1.5">בד״כ אתם קונים גם:</p>
            <div className="space-y-0.5">
              {forgotten.map((f) => (
                <label key={f.name} className="flex items-center gap-2 min-h-[40px] px-2 rounded-md cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                  <input type="checkbox" checked={picked.has(f.name)} onChange={() => toggle(f.name)} className="h-4 w-4 accent-blue-600" />
                  <span className="flex-1 text-sm">
                    {f.name}{f.typicalQty > 1 && <b className="ms-1">×{f.typicalQty}</b>}
                    <span className="ms-1.5 text-[11px] text-slate-500 dark:text-slate-400">{f.reason}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {(cheapest || estimatedTotal > 0) && (
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3 space-y-1 text-sm">
            {estimatedTotal > 0 && (
              <p>
                💰 עלות משוערת: <b dir="ltr">₪{Math.round(estimatedTotal)}</b>
                {diff != null && Math.abs(diff) >= 20 && (
                  <span className={diff > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}>
                    {' '}({diff > 0 ? `₪${diff} מעל` : `₪${-diff} מתחת ל`}קנייה רגילה)
                  </span>
                )}
              </p>
            )}
            {cheapest && (
              <p className="flex items-center gap-1.5">
                <Store className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                הכי זול היום: <b>{cheapest.chainName}</b> <span dir="ltr">~₪{Math.round(cheapest.totalBasketCost)}</span>
              </p>
            )}
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button onClick={confirm} disabled={busy} className="bg-blue-600 hover:bg-blue-700 text-white min-h-[44px]">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : picked.size ? `הוסף ${picked.size} ויוצאים לקנות` : 'יוצאים לקנות'}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={busy} className="min-h-[44px]">חזרה לרשימה</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
