/**
 * Which supermarket chains the family actually shops at, and where.
 *
 * Cheapersal reports sub-chains separately ("שופרסל דיל", "שופרסל שלי",
 * "רמי לוי בשכונה"…); a preferred chain is a *family* matched by prefix.
 * Prices are taken from physical branches in the family's area, because a
 * chain's price differs by branch (Eilat is VAT-free, ~15% cheaper).
 */
export const DEFAULT_PREFERRED_CHAINS = ['שוק העיר', 'שופרסל', 'רמי לוי', 'ויקטורי'];
export const DEFAULT_AREA_CITIES = ['חולון', 'בת ים', 'ראשון לציון', 'אזור'];

/** Chains offered in the settings picker (families, not sub-chains). */
export const SELECTABLE_CHAINS = [
  'שוק העיר', 'שופרסל', 'רמי לוי', 'ויקטורי', 'יוחננוף', 'אושר עד', 'מחסני השוק',
  'חצי חינם', 'טיב טעם', 'קרפור', 'יינות ביתן', 'יילו', 'סטופ מרקט', 'קשת טעמים',
  'מגה', 'סופר ספיר', 'פרש מרקט', 'קינג סטור', 'סופר-פארם',
];

/** Never used for area-less fallbacks: VAT-free, not comparable. */
export const EXCLUDED_CITIES = ['אילת'];

export interface ChainPrefs {
  preferredChains: string[];
  areaCities: string[];
}

export function prefsFromUserRow(row: { preferred_chains?: string[] | null; price_area_cities?: string[] | null } | null | undefined): ChainPrefs {
  return {
    preferredChains: row?.preferred_chains?.length ? row.preferred_chains : DEFAULT_PREFERRED_CHAINS,
    areaCities: row?.price_area_cities?.length ? row.price_area_cities : DEFAULT_AREA_CITIES,
  };
}

/** Map a reported (sub-)chain name to one of the given families, or null. */
export function chainFamily(chainName: string, families: string[]): string | null {
  const name = chainName.trim();
  // Longest family first so e.g. "שופרסל" doesn't shadow a more specific family.
  const sorted = [...families].sort((a, b) => b.length - a.length);
  return sorted.find((f) => name === f || name.startsWith(f)) ?? null;
}
