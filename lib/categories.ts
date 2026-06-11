export const CATEGORIES = [
  'ללא קטגוריה',
  'מזווה',
  'ירקות ופירות',
  'מוצרי חלב וביצים',
  'בשר ודגים',
  'משקאות',
  'מוצרי ניקיון והיגיינה',
  'קפואים',
  'אחר',
];

// Virtual category: most-frequently-ordered items (not a real DB category).
export const MOST_ORDERED = 'הכי נמכרים';
// An item counts as "most ordered" once bought/listed at least this many times.
export const MOST_ORDERED_MIN_FREQUENCY = 2;

// Icons for the storefront category bar and image-less product tiles
export const CATEGORY_ICONS: Record<string, string> = {
  [MOST_ORDERED]: '🔥',
  'ללא קטגוריה': '🛒',
  'מזווה': '🥫',
  'ירקות ופירות': '🥦',
  'מוצרי חלב וביצים': '🥛',
  'בשר ודגים': '🥩',
  'משקאות': '🥤',
  'מוצרי ניקיון והיגיינה': '🧼',
  'קפואים': '🧊',
  'אחר': '📦',
};
