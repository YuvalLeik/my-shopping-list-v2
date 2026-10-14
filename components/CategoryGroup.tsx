'use client';

import { ChevronDown } from 'lucide-react';
import { CATEGORY_ICONS } from '@/lib/categories';

interface CategoryGroupProps {
  category: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  /** Visual weight: 'primary' for the active list, 'muted' inside collected/unavailable sections. */
  tone?: 'primary' | 'muted';
  /** Optional small text shown next to the count (e.g. a subtotal). */
  meta?: string;
  children: React.ReactNode;
}

/** A collapsible category section: tap the header to fold its items away. */
export function CategoryGroup({ category, count, collapsed, onToggle, tone = 'primary', meta, children }: CategoryGroupProps) {
  const icon = CATEGORY_ICONS[category] ?? '📦';
  return (
    <section className={tone === 'primary' ? 'mb-3' : 'mb-2'}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className={`w-full flex items-center gap-2 min-h-[44px] px-3 rounded-lg text-right transition-colors ${
          tone === 'primary'
            ? 'bg-slate-100/80 hover:bg-slate-200/70 dark:bg-slate-800/70 dark:hover:bg-slate-800'
            : 'hover:bg-slate-100 dark:hover:bg-slate-800/60'
        }`}
      >
        <span aria-hidden className="text-base">{icon}</span>
        <span className={`flex-1 font-semibold ${tone === 'primary' ? 'text-sm text-slate-700 dark:text-slate-200' : 'text-xs text-slate-500 dark:text-slate-400'}`}>
          {category}
        </span>
        {meta && <span className="text-xs text-slate-400 dark:text-slate-500" dir="ltr">{meta}</span>}
        <span className="min-w-6 text-center text-xs font-bold rounded-full px-2 py-0.5 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300">
          {count}
        </span>
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
        />
      </button>
      {!collapsed && <div className="mt-2">{children}</div>}
    </section>
  );
}

/** "Collapse all / expand all" toggle for a set of category groups. */
export function CollapseAllButton({ allCollapsed, onClick }: { allCollapsed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline px-2 py-1.5 min-h-[36px]"
    >
      {allCollapsed ? 'פתח הכל' : 'כווץ הכל'}
    </button>
  );
}
