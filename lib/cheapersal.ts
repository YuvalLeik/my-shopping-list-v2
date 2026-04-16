const BASE_URL = 'https://cheapersal.co.il/api/v1';

function getApiKey(): string {
  const key = process.env.CHEAPERSAL_API_KEY;
  if (!key) throw new Error('CHEAPERSAL_API_KEY is not set');
  return key;
}

function headers(): HeadersInit {
  return {
    'Authorization': `Bearer ${getApiKey()}`,
    'Accept': 'application/json',
  };
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
    return await res.json();
  } catch (err) {
    console.error(`Cheapersal API error: ${path}`, err);
    return null;
  }
}

export async function getChains(): Promise<CheapersalChain[]> {
  const data = await apiFetch<CheapersalChain[]>('/chains');
  return data || [];
}

export async function searchProduct(name: string): Promise<CheapersalProduct[]> {
  const data = await apiFetch<CheapersalProduct[]>('/products', { q: name });
  return data || [];
}

export async function getProductPrices(barcode: string): Promise<CheapersalPriceEntry[]> {
  const data = await apiFetch<CheapersalPriceEntry[]>(`/products/${barcode}/prices`);
  return data || [];
}

export async function getProductPromos(barcode: string): Promise<CheapersalPromo[]> {
  const data = await apiFetch<CheapersalPromo[]>(`/promos/product/${barcode}`);
  return data || [];
}
