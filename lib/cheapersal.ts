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
  branch: { id: string; name: string; city?: string };
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

export async function getProductPrices(barcode: string): Promise<CheapersalPriceEntry[]> {
  const data = await apiFetch<PricesResponseData>(`/products/${barcode}/prices`);
  if (!data?.prices) return [];
  const seen = new Set<string>();
  const results: CheapersalPriceEntry[] = [];
  for (const entry of data.prices) {
    if (seen.has(entry.chain.id)) continue;
    seen.add(entry.chain.id);
    results.push({
      chainId: entry.chain.id,
      chainName: entry.chain.name,
      branchId: entry.branch?.id,
      branchName: entry.branch?.name,
      price: entry.price,
    });
  }
  return results;
}

export async function getProductPromos(barcode: string): Promise<CheapersalPromo[]> {
  const data = await apiFetch<CheapersalPromo[]>(`/promos/product/${barcode}`);
  return data || [];
}
