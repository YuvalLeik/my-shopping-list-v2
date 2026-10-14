import { getItemCategoryByName } from '@/lib/groceryItems';
import { guessCategoryByKeywords } from '@/lib/categoryKeywords';
import { upsertShoppingItemToCatalog } from '@/lib/shoppingItems';
import { UNCATEGORIZED } from '@/lib/categoryGroups';

export type CategorySource = 'history' | 'keywords' | 'ai';

/**
 * Hybrid category suggestion for a product name:
 *   1. what the family used before (shopping_items catalog)
 *   2. the built-in Hebrew keyword dictionary (instant, offline)
 *   3. Gemini via /api/categorize — the answer is cached into the catalog,
 *      so the next lookup for this name is a history hit.
 */
export async function suggestCategory(
  name: string,
  userId: string
): Promise<{ category: string; source: CategorySource } | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const known = await getItemCategoryByName(trimmed, userId);
  if (known && known !== UNCATEGORIZED) return { category: known, source: 'history' };

  const guessed = guessCategoryByKeywords(trimmed);
  if (guessed) return { category: guessed, source: 'keywords' };

  const ai = await categorizeWithAI([trimmed]);
  const category = ai[trimmed];
  if (category) {
    upsertShoppingItemToCatalog(trimmed, category).catch(() => {});
    return { category, source: 'ai' };
  }
  return null;
}

/** Batch AI categorization (used for backfilling uncategorized items). */
export async function categorizeWithAI(names: string[]): Promise<Record<string, string>> {
  if (names.length === 0) return {};
  try {
    const res = await fetch('/api/categorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names }),
    });
    if (!res.ok) return {};
    const json = await res.json();
    return (json?.categories as Record<string, string>) ?? {};
  } catch {
    return {};
  }
}
