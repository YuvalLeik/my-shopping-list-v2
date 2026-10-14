import { chainFamily } from './chains';

const BASE_URL = 'https://api.cheapersal.co.il/api/v1';

function getApiKey(): string {
  const key = process.env.CHEAPERSAL_API_KEY;
  if (!key) throw new Error('CHEAPERSAL_API_KEY is not set');
  return key;
}

function headers(): HeadersInit {
  return {
    'X-API-Key': getApiKey(),
    'Accept': 'application/json',
  };
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
}

export interface CheapersalChain {
  id: string;
  name: string;
}

export interface CheapersalProduct {
  barcode: string;
  name: string;
  manufacturer?: string;
  category?: string;
}

export interface CheapersalPriceEntry {
  chainId: string;
  chainName: string;
  branchId?: string;
  branchName?: string;
  price: number;
}

interface RawPriceEntry {
  price: number;
  chain: { id: string; name: string };
  branch: { id: string; name: string; city?: string; isOnline?: boolean };
  promo: { description: string; discountRate?: number } | null;
}

interface PricesResponseData {
  product: CheapersalProduct;
  prices: RawPriceEntry[];
  summary?: unknown;
}

export interface CheapersalPromo {
  description: string;
  discountRate?: number;
  startDate?: string;
  endDate?: string;
  rewardType?: string;
}

async function apiFetch<T>(path: string, params?: Record<string, string>): Promise<T | null> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  try {
    const res = await fetch(url.toString(), { headers: headers(), next: { revalidate: 0 } });
    if (!res.ok) {
      console.error(`Cheapersal API ${res.status}: ${path}`);
      return null;
    }
    const json: ApiResponse<T> = await res.json();
    if (!json.success) return null;
    return json.data;
  } catch (err) {
    console.error(`Cheapersal API error: ${path}`, err);
    return null;
  }
}

export async function getChains(): Promise<CheapersalChain[]> {
  const data = await apiFetch<CheapersalChain[]>('/chains');
  return data || [];
}

export async function getProductByBarcode(barcode: string): Promise<CheapersalProduct | null> {
  const data = await apiFetch<CheapersalProduct>(`/products/${barcode}`);
  return data;
}

export type PriceLookupStatus = 'ok' | 'not_found' | 'quota' | 'error';

export interface AreaPriceEntry {
  /** Preferred chain family, e.g. "שופרסל" (covers דיל / שלי / אקספרס). */
  chainName: string;
  /** Median shelf price across the family's physical branches in the area. */
  price: number;
  /** Human description of where the price comes from. */
  branchName: string;
  /** False when no in-area branch had the product and a national median was used. */
  inArea: boolean;
}

export interface AreaPriceLookup {
  status: PriceLookupStatus;
  entries: AreaPriceEntry[];
  productName: string | null;
  /** Requests left today on the Cheapersal plan, when the API reports it. */
  remaining: number | null;
}

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * Prices for one barcode, reduced to one price per preferred chain family.
 * Uses physical branches in `areaCities`; falls back to the national median
 * of physical branches (excluding VAT-free Eilat) when the area has none.
 */
export async function getAreaPrices(
  barcode: string,
  opts: { families: string[]; areaCities: string[]; excludedCities: string[] },
): Promise<AreaPriceLookup> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/products/${encodeURIComponent(barcode)}/prices`, {
      headers: headers(),
      cache: 'no-store',
      signal: AbortSignal.timeout(45000),
    });
  } catch (err) {
    console.error(`Cheapersal network error for ${barcode}:`, err);
    return { status: 'error', entries: [], productName: null, remaining: null };
  }

  let json: { success?: boolean; data?: PricesResponseData; meta?: { usage?: { remaining?: number } } } | null = null;
  try { json = await res.json(); } catch { /* non-JSON body */ }
  const remaining = typeof json?.meta?.usage?.remaining === 'number' ? json.meta.usage.remaining : null;

  if (res.status === 404) return { status: 'not_found', entries: [], productName: null, remaining };
  if (res.status === 429 || res.status === 402) {
    console.error(`Cheapersal quota/rate limit (${res.status}) for ${barcode}`);
    return { status: 'quota', entries: [], productName: null, remaining: remaining ?? 0 };
  }
  if (!res.ok || !json?.success || !json.data) {
    console.error(`Cheapersal API ${res.status} for ${barcode}`);
    return { status: 'error', entries: [], productName: null, remaining };
  }

  const inArea = new Map<string, number[]>();
  const national = new Map<string, number[]>();
  for (const p of json.data.prices ?? []) {
    if (!(p.price > 0) || p.branch?.isOnline) continue;
    const family = chainFamily(p.chain?.name ?? '', opts.families);
    if (!family) continue;
    const city = p.branch?.city ?? '';
    if (opts.excludedCities.includes(city)) continue;
    if (!national.has(family)) national.set(family, []);
    national.get(family)!.push(p.price);
    if (opts.areaCities.includes(city)) {
      if (!inArea.has(family)) inArea.set(family, []);
      inArea.get(family)!.push(p.price);
    }
  }

  const entries: AreaPriceEntry[] = [];
  for (const [family, all] of national) {
    const local = inArea.get(family);
    entries.push({
      chainName: family,
      price: Math.round(median(local ?? all) * 100) / 100,
      branchName: local ? `${local.length} סניפים באזור` : 'ממוצע ארצי',
      inArea: !!local,
    });
  }
  return {
    status: entries.length ? 'ok' : 'not_found',
    entries,
    productName: json.data.product?.name ?? null,
    remaining,
  };
}

export async function getProductPromos(barcode: string): Promise<CheapersalPromo[]> {
  const data = await apiFetch<CheapersalPromo[]>(`/promos/product/${barcode}`);
  return data || [];
}
