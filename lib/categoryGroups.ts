import { useCallback, useState } from 'react';
import { CATEGORIES } from '@/lib/categories';

export const UNCATEGORIZED = 'ללא קטגוריה';

/** Old category names still found on some saved items → their current name. */
const LEGACY_CATEGORIES: Record<string, string> = {
  'חלב וביצים': 'מוצרי חלב וביצים',
};

/**
 * Group items by category, ordered like CATEGORIES (store-walk order) with
 * unknown categories after the known ones and "ללא קטגוריה" last, so the
 * items that still need sorting out are easy to find.
 */
export function groupItemsByCategory<T extends { name: string; category?: string | null }>(
  items: T[]
): Array<[string, T[]]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const raw = item.category || UNCATEGORIZED;
    const category = LEGACY_CATEGORIES[raw] ?? raw;
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category)!.push(item);
  }
  const rank = (c: string) => {
    if (c === UNCATEGORIZED) return Number.MAX_SAFE_INTEGER;
    const i = CATEGORIES.indexOf(c);
    return i === -1 ? CATEGORIES.length : i;
  };
  return Array.from(grouped.entries())
    .map(([c, list]) => [c, [...list].sort((a, b) => a.name.localeCompare(b.name, 'he'))] as [string, T[]])
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0], 'he'));
}

function readCollapsed(storageKey: string | null): Set<string> {
  if (!storageKey || typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(storageKey);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/**
 * Collapsed-category state, remembered per list in localStorage so a
 * collapsed section stays collapsed across reloads and mode switches.
 */
export function useCollapsedCategories(scopeKey: string | null) {
  const storageKey = scopeKey ? `collapsed_categories:${scopeKey}` : null;
  const [state, setState] = useState(() => ({ key: storageKey, set: readCollapsed(storageKey) }));
  // Switching lists: reload that list's saved state (render-time reset, no effect).
  let collapsed = state.set;
  if (state.key !== storageKey) {
    const next = { key: storageKey, set: readCollapsed(storageKey) };
    setState(next);
    collapsed = next.set;
  }
  const setCollapsed = useCallback(
    (fn: (prev: Set<string>) => Set<string>) => setState((s) => ({ key: s.key, set: fn(s.set) })),
    []
  );

  const persist = useCallback((next: Set<string>) => {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify(Array.from(next))); } catch { /* storage unavailable */ }
  }, [storageKey]);

  const update = useCallback((fn: (prev: Set<string>) => Set<string>) => {
    setCollapsed((prev) => {
      const next = fn(prev);
      persist(next);
      return next;
    });
  }, [persist, setCollapsed]);

  const toggle = useCallback((key: string) => update((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  }), [update]);

  const setAll = useCallback((keys: string[], value: boolean) => update((prev) => {
    const next = new Set(prev);
    for (const k of keys) { if (value) next.add(k); else next.delete(k); }
    return next;
  }), [update]);

  return { collapsed, toggle, setAll };
}
