'use client';

import { useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import type { ItemSuggestion, SuggestionKind } from '@/lib/suggestions';

const SECTIONS: Array<{ kind: SuggestionKind; title: string; icon: string }> = [
  { kind: 'due', title: 'כנראה נגמר', icon: '⏰' },
  { kind: 'staple', title: 'קונים כמעט תמיד', icon: '⭐' },
  { kind: 'forgotten', title: 'מזמן לא קניתם', icon: '🕰️' },
];

interface Props {
  suggestions: Record<SuggestionKind, ItemSuggestion[]> | null;
  busyNames: Set<string>;
  onAdd: (s: ItemSuggestion) => void;
  onAddAll: (list: ItemSuggestion[]) => void;
}

/** One-tap suggestions from purchase history, shown while building a list. */
export function SuggestionsRail({ suggestions, busyNames, onAdd, onAddAll }: Props) {
  const [open, setOpen] = useState(true);
  if (!suggestions) return null;
  const sections = SECTIONS.filter((s) => suggestions[s.kind].length > 0);
  if (sections.length === 0) return null;
  const total = sections.reduce((n, s) => n + suggestions[s.kind].length, 0);

  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/30">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 min-h-[44px] text-start"
      >
        <span aria-hidden>💡</span>
        <span className="flex-1 text-sm font-semibold text-blue-900 dark:text-blue-100">הצעות לרשימה לפי ההיסטוריה שלכם</span>
        <span className="text-xs text-blue-700 dark:text-blue-300">{total}</span>
        <ChevronDown className={`h-4 w-4 text-blue-600 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          {sections.map(({ kind, title, icon }) => {
            const list = suggestions[kind];
            return (
              <div key={kind}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{icon} {title}</span>
                  {list.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onAddAll(list)}
                      className="text-xs text-blue-700 dark:text-blue-300 hover:underline min-h-[32px] px-1"
                    >
                      הוסף הכל ({list.length})
                    </button>
                  )}
                </div>
                {/* Horizontal scroll on phones, wraps on wide screens */}
                <div className="flex gap-2 overflow-x-auto sm:flex-wrap sm:overflow-visible pb-1 -mx-1 px-1 snap-x">
                  {list.map((s) => {
                    const busy = busyNames.has(s.name.trim().toLowerCase().replace(/\s+/g, ' '));
                    return (
                      <button
                        key={s.name}
                        type="button"
                        onClick={() => onAdd(s)}
                        disabled={busy}
                        title={s.reason}
                        className="snap-start flex-shrink-0 inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 hover:border-blue-400 active:scale-95 transition disabled:opacity-50"
                      >
                        <Plus className="h-3.5 w-3.5 text-blue-600" />
                        <span className="whitespace-nowrap">{s.name}</span>
                        {kind !== 'staple' && (
                          <span className="text-[10px] text-slate-400 whitespace-nowrap">לפני {s.daysSinceLast} ימים</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
