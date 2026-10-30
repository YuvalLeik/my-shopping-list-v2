import { parseReceipt, ParsedReceipt, ParsedItem } from './receiptParser';

// 2.5-flash occasionally hangs past the timeout on real receipts; 3.5-flash
// is faster and writes more compact JSON. 2.5 stays as a fallback.
const GEMINI_MODELS = ['gemini-3.5-flash', 'gemini-2.5-flash'];
const geminiUrl = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
/** One Gemini call; a hung call must leave time for the fallback model. */
const GEMINI_TIMEOUT_MS = 45_000;
/** Whole parse (fallback model, mismatch retry) must end before the route's maxDuration (120s). */
export const PARSE_BUDGET_MS = 100_000;
/** Don't start another call with less time than this left. */
const MIN_CALL_MS = 15_000;
/** Receipt total vs. sum of lines: beyond this we retry once, then warn. */
const MISMATCH_TOLERANCE = 0.02;

export type ParserMeta = {
  parserUsed: 'gemini' | 'regex' | 'vision_failed';
  parserError?: string;
};

export interface ParseOptions {
  /** The user's own item names (open list first); the model maps lines onto them. */
  candidateNames?: string[];
  /** Epoch ms by which parsing must finish (default: PARSE_BUDGET_MS from now). */
  deadline?: number;
}

const SYSTEM_PROMPT = `You are an expert parser of Israeli supermarket receipts (Hebrew). You receive a receipt as a PDF, photo(s) or text: a paper slip, a digital receipt (e.g. Weezmo / "ReadMe"), or an online order. Extract every purchased line.

Output JSON only, matching the schema. Item fields:
- n: the product name as printed, in correct Hebrew reading order (fix reversed word order if the text came out mirrored).
- g: a short generic name a person would write on a shopping list (e.g. "חלב תנובה 1 ליטר קרטון" -> "חלב", "קוטג' תנובה 5% 250 גר" -> "קוטג'", "פילה אמנון ללא עור 5" -> "פילה אמנון").
- q: quantity. For items sold by weight ("X 0.21 ק"ג", "1.19 ק"ג") q is the weight in kg.
- u: unit price (per unit, or per kg for weighed items).
- t: the line total AFTER the discounts that belong to it (see below).
- b: the numeric barcode/item code printed under or next to the line (3-13 digits), or null. Never invent one.
- w: true if sold by weight.
- k: true for bags, packaging, tare and deposits ("שקית", "טרה אריזה", "פיקדון"), else false.
- m: if a candidate list is given, the EXACT candidate string this line is (same product, any size/brand variation), else null.

Rules:
- Discount lines (negative amounts such as "₪-3.57", "3ב25", "2ב20", "הורדת טרה", "*מבצע*") belong to the product line directly ABOVE them: subtract them from that product's t. Never output a discount as its own item.
- The same product bought several times may appear as several lines: output each line separately (they are merged later).
- Quantity and price may be printed glued together (e.g. "1246.80" can mean qty 12, total 46.80): use the unit price and other lines to make it consistent so that q * u ≈ t before discounts.
- Ignore headers, store address, phone, cashier, payment method, change, VAT, loyalty-club text, links, "סה"כ הנחות".
- storeName: the chain name (e.g. "יוחננוף", "שופרסל", "רמי לוי", "ויקטורי", "שוק העיר") without branch details.
- purchaseDate: YYYY-MM-DD. Israeli receipts print DD/MM/YYYY, DD.MM.YY or YYYY-MM-DD, sometimes glued to the time (e.g. "תאריך 18:36 2026-10-13").
- totalAmount: the final amount paid ("סה"כ לתשלום").`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    storeName: { type: 'STRING', nullable: true },
    purchaseDate: { type: 'STRING', nullable: true },
    totalAmount: { type: 'NUMBER', nullable: true },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          n: { type: 'STRING' },
          g: { type: 'STRING', nullable: true },
          q: { type: 'NUMBER' },
          u: { type: 'NUMBER', nullable: true },
          t: { type: 'NUMBER', nullable: true },
          b: { type: 'STRING', nullable: true },
          w: { type: 'BOOLEAN' },
          k: { type: 'BOOLEAN' },
          m: { type: 'STRING', nullable: true },
        },
        required: ['n', 'g', 'q', 't', 'w', 'k'],
      },
    },
  },
  required: ['items', 'totalAmount', 'purchaseDate', 'storeName'],
};

function getApiKey(): string | undefined {
  return process.env.GOOGLE_GEMINI_API_KEY;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const round2 = (v: number) => Math.round(v * 100) / 100;

function normalizeItems(rawItems: unknown, candidates: Set<string>): ParsedItem[] {
  if (!Array.isArray(rawItems)) return [];
  return rawItems
    .filter((it): it is Record<string, unknown> => !!it && typeof it.n === 'string' && it.n.trim().length > 0)
    .map((it) => {
      const barcode = typeof it.b === 'string' ? it.b.replace(/\D/g, '') : '';
      const match = typeof it.m === 'string' ? it.m.trim() : '';
      return {
        name: String(it.n).trim(),
        genericName: typeof it.g === 'string' && it.g.trim() ? it.g.trim() : null,
        quantity: num(it.q) ?? 1,
        unitPrice: num(it.u),
        totalPrice: num(it.t),
        barcode: /^\d{3,13}$/.test(barcode) ? barcode : null,
        weighed: it.w === true,
        isBag: it.k === true,
        // Only accept a proposed match that really is one of the user's names.
        matchName: match && candidates.has(match) ? match : null,
      };
    });
}

/**
 * Merge repeated lines of the same product (same barcode, or same name and
 * unit price) into one line with summed quantity and total.
 */
export function mergeDuplicateLines(items: ParsedItem[]): ParsedItem[] {
  const out: ParsedItem[] = [];
  const index = new Map<string, number>();
  for (const it of items) {
    const key = it.barcode && it.barcode.length >= 7
      ? `b:${it.barcode}`
      : `n:${it.name}|${it.unitPrice ?? ''}`;
    const at = index.get(key);
    if (at === undefined) {
      index.set(key, out.length);
      out.push({ ...it });
      continue;
    }
    const cur = out[at];
    cur.quantity = round2(cur.quantity + it.quantity);
    cur.totalPrice = cur.totalPrice != null || it.totalPrice != null
      ? round2((cur.totalPrice ?? 0) + (it.totalPrice ?? 0))
      : null;
    cur.matchName = cur.matchName ?? it.matchName;
    if (!cur.weighed && cur.totalPrice != null && cur.quantity > 0) cur.unitPrice = round2(cur.totalPrice / cur.quantity);
  }
  return out;
}

function mismatchOf(items: ParsedItem[], total: number | null): number | null {
  if (total == null || !items.length) return null;
  const sum = items.reduce((s, i) => s + (i.totalPrice ?? 0), 0);
  return round2(total - sum);
}

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

/** Errors worth retrying on the fallback model: timeouts, overload, rate limits. */
class RetryableGeminiError extends Error {}

async function callGemini(parts: GeminiPart[], apiKey: string, deadline: number): Promise<Record<string, unknown>> {
  let lastError: unknown;
  for (const model of GEMINI_MODELS) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_CALL_MS) break;
    try {
      return await callGeminiModel(model, parts, apiKey, Math.min(GEMINI_TIMEOUT_MS, remaining));
    } catch (err) {
      lastError = err;
      const retryable = err instanceof RetryableGeminiError
        || (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError'));
      console.error(`[geminiReceiptParser] ${model} failed:`, err instanceof Error ? err.message : err);
      if (!retryable) throw err;
    }
  }
  throw lastError ?? new Error('Not enough time left to read the receipt');
}

async function callGeminiModel(model: string, parts: GeminiPart[], apiKey: string, timeoutMs: number): Promise<Record<string, unknown>> {
  const response = await fetch(geminiUrl(model), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.1,
        // Thinking tokens count against the output budget and truncated long
        // receipts; the schema does the structuring work instead.
        thinkingConfig: { thinkingBudget: 0 },
        // Bounds a runaway repetition loop; 100+ line receipts need ~8k.
        maxOutputTokens: 16384,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errMsg = `Gemini API error (${response.status})`;
    try {
      const errJson = JSON.parse(errorText);
      errMsg = errJson?.error?.message ?? errMsg;
    } catch {
      if (errorText) errMsg = errorText.slice(0, 200);
    }
    if (response.status === 429 || response.status >= 500) throw new RetryableGeminiError(errMsg);
    throw new Error(errMsg);
  }

  const data = await response.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new RetryableGeminiError('Gemini returned no content');
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(salvageTruncatedJson(text));
  }
}

/** Close a JSON answer cut off mid-array, keeping every complete item. */
function salvageTruncatedJson(text: string): string {
  const start = text.indexOf('"items"');
  const lastItemEnd = text.lastIndexOf('}');
  if (start === -1 || lastItemEnd === -1) throw new Error('Gemini returned invalid JSON');
  return `${text.slice(0, lastItemEnd + 1)}]}`;
}

function candidatesPart(candidateNames: string[]): GeminiPart[] {
  if (!candidateNames.length) return [];
  return [{
    text: `Candidate list for "m" (the family's own item names; use the exact string or null):\n${candidateNames.map((n) => `- ${n}`).join('\n')}`,
  }];
}

async function parseWithGemini(
  content: GeminiPart[],
  opts: ParseOptions,
  extraNote = '',
): Promise<ParsedReceipt & ParserMeta> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Gemini API key not configured');

  const candidateNames = (opts.candidateNames ?? []).slice(0, 200);
  const candidates = new Set(candidateNames);
  const deadline = opts.deadline ?? Date.now() + PARSE_BUDGET_MS;
  const run = async (hint: string) => {
    const parsed = await callGemini(
      [{ text: SYSTEM_PROMPT + extraNote + hint }, ...candidatesPart(candidateNames), ...content],
      apiKey,
      deadline,
    );
    const items = mergeDuplicateLines(normalizeItems(parsed.items, candidates));
    const totalAmount = num(parsed.totalAmount);
    return {
      storeName: typeof parsed.storeName === 'string' ? parsed.storeName : null,
      purchaseDate: typeof parsed.purchaseDate === 'string' ? parsed.purchaseDate : null,
      items,
      totalAmount,
      totalMismatch: mismatchOf(items, totalAmount),
    };
  };

  let result = await run('');
  const off = (r: ParsedReceipt) =>
    r.totalAmount != null && r.totalMismatch != null && Math.abs(r.totalMismatch) > r.totalAmount * MISMATCH_TOLERANCE;
  if (off(result) && deadline - Date.now() >= MIN_CALL_MS) {
    const retry = await run(
      `\n\nIMPORTANT: a previous attempt's lines summed to ₪${round2((result.totalAmount ?? 0) - (result.totalMismatch ?? 0))} but the receipt total is ₪${result.totalAmount}. Re-read carefully: do not skip lines, and subtract every discount line from the product above it.`,
    ).catch(() => null);
    if (retry && Math.abs(retry.totalMismatch ?? Infinity) < Math.abs(result.totalMismatch ?? Infinity)) result = retry;
  }
  return { ...result, parserUsed: 'gemini' };
}

/** Find a purchase date in raw receipt text (fallback when the model returns none). */
export function findDateInText(text: string): string | null {
  const iso = text.match(/(20\d{2})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const il = text.match(/(\d{1,2})[./](\d{1,2})[./](20\d{2}|\d{2})/);
  if (il) {
    const y = il[3].length === 2 ? `20${il[3]}` : il[3];
    return `${y}-${il[2].padStart(2, '0')}-${il[1].padStart(2, '0')}`;
  }
  return null;
}

export interface ReceiptImage {
  base64: string;
  mimeType: string;
}

/** Extra instruction when the receipt was photographed in several
    overlapping close-up segments (long supermarket receipts). */
function segmentNote(count: number): string {
  if (count <= 1) return '';
  return `

IMPORTANT - MULTIPLE SEGMENTS: You are receiving ${count} photos that are sequential, slightly OVERLAPPING segments of ONE single receipt, ordered top to bottom. Merge them into ONE receipt:
- Items that appear in the overlap between consecutive segments (same item name and price near the end of one photo and again near the start of the next) must appear only ONCE in the output.
- storeName and purchaseDate usually appear in the first segment; totalAmount usually appears in the last segment.
- Never duplicate items because of the overlap, and never drop items that appear in only one segment.`;
}

/**
 * Parse a receipt (PDF or one-or-more image segments) using Gemini
 * multimodal vision. Multiple images are treated as overlapping
 * top-to-bottom segments of a single long receipt and merged.
 */
export async function parseReceiptMultimodal(
  images: ReceiptImage[],
  opts: ParseOptions = {},
): Promise<ParsedReceipt & ParserMeta> {
  if (!images.length) {
    return { storeName: null, purchaseDate: null, items: [], totalAmount: null, parserUsed: 'vision_failed', parserError: 'No images provided' };
  }
  try {
    return await parseWithGemini(
      images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.base64 } })),
      opts,
      segmentNote(images.length),
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[geminiReceiptParser] multimodal failed:', errMsg);
    return { storeName: null, purchaseDate: null, items: [], totalAmount: null, parserUsed: 'vision_failed', parserError: errMsg };
  }
}

/**
 * Parse receipt text using Gemini; falls back to the regex parser if Gemini
 * is unavailable. Text extracted from PDFs often has mirrored Hebrew word
 * order: prefer parseReceiptMultimodal for PDFs.
 */
export async function parseReceiptWithAI(
  rawText: string,
  opts: ParseOptions = {},
): Promise<ParsedReceipt & ParserMeta> {
  try {
    return await parseWithGemini([{ text: `Here is the receipt text to parse:\n\n${rawText}` }], opts);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[geminiReceiptParser] text parse failed, using regex:', errMsg);
    return { ...parseReceipt(rawText), parserUsed: 'regex', parserError: errMsg };
  }
}
