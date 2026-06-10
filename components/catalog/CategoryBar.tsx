'use client';

import { CATEGORIES, CATEGORY_ICONS } from '@/lib/categories';
import { t } from '@/lib/translations';

interface CategoryBarProps {
  selected: string | null; // null = all categories
  counts: Map<string, number>;
  onSelect: (category: string | null) => void;
}

export default function CategoryBar({ selected, counts, onSelect }: CategoryBarProps) {
  const visibleCategories = CATEGORIES.filter((c) => (counts.get(c) ?? 0) > 0);

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 -mb-2 scrollbar-thin" role="tablist" aria-label="קטגוריות">
      <CategoryChip
        label={t.allCategories}
        icon="🏪"
        active={selected === null}
        onClick={() => onSelect(null)}
      />
      {visibleCategories.map((category) => (
        <CategoryChip
          key={category}
          label={category}
          icon={CATEGORY_ICONS[category] ?? '🛒'}
          active={selected === category}
          onClick={() => onSelect(category)}
        />
      ))}
    </div>
  );
}

function CategoryChip({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 min-w-[72px] shrink-0 border text-xs font-medium transition-colors ${
        active
          ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-500'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
      }`}
    >
      <span className="text-xl leading-none" aria-hidden>
        {icon}
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}
