import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const CHEAPERSAL_BASE = "https://api.cheapersal.co.il/api/v1";
const apiKey = process.env.CHEAPERSAL_API_KEY;

async function cheapersalFetch(path: string) {
  if (!apiKey) throw new Error("CHEAPERSAL_API_KEY not configured");
  const res = await fetch(`${CHEAPERSAL_BASE}${path}`, {
    headers: { "X-API-Key": apiKey },
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Cheapersal ${res.status}: ${text}`);
  }
  return res.json();
}

export async function POST(request: NextRequest) {
  try {
    if (!apiKey) {
      return NextResponse.json(
        { error: "CHEAPERSAL_API_KEY not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { action, barcodes, barcode } = body as {
      action: string;
      barcodes?: string[];
      barcode?: string;
    };

    if (action === "compare_prices" && barcodes?.length) {
      const results: Record<
        string,
        { name: string; prices: { chain: string; branch: string; price: number }[] }
      > = {};

      for (const bc of barcodes.slice(0, 10)) {
        try {
          const data = await cheapersalFetch(`/products/${bc}/prices`);
          results[bc] = {
            name: data.product?.name || data.name || bc,
            prices: Array.isArray(data.prices)
              ? data.prices.map((p: any) => ({
                  chain: p.chain_name || p.chain || "",
                  branch: p.branch_name || p.branch || "",
                  price: typeof p.price === "number" ? p.price : parseFloat(p.price) || 0,
                }))
              : [],
          };
        } catch {
          results[bc] = { name: bc, prices: [] };
        }
      }

      return NextResponse.json({ results });
    }

    if (action === "product_info" && barcode) {
      const data = await cheapersalFetch(`/products/${barcode}`);
      return NextResponse.json({ product: data });
    }

    if (action === "product_prices" && barcode) {
      const data = await cheapersalFetch(`/products/${barcode}/prices`);
      return NextResponse.json(data);
    }

    if (action === "chains") {
      const data = await cheapersalFetch("/chains");
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    console.error("Cheapersal API error:", err);
    return NextResponse.json(
      { error: err.message || "Cheapersal API error" },
      { status: 500 }
    );
  }
}
