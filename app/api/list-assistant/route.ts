import { NextRequest, NextResponse } from 'next/server';
import { allowRequest, rateKey } from '@/lib/rateLimit';

// The list assistant: one small Gemini call per user message. The client sends
// a compact context (current list + the family's usual items); the model
// answers with proposed actions that the user confirms before anything changes.
// Flash plans meals and budgets far better than lite, for a fraction of a cent
// per question; lite is the fallback. 3.x lite takes thinkingLevel, not thinkingBudget.
const MODELS = [
  { id: 'gemini-3.5-flash', thinking: { thinkingBudget: 0 } },
  { id: 'gemini-3.5-flash-lite', thinking: { thinkingLevel: 'minimal' } },
];
const TIMEOUT_MS = 20_000;
const MAX_PER_DAY = 50;
const MAX_MESSAGE = 400;
const MAX_FAMILY_ITEMS = 80;
const MAX_LIST_ITEMS = 120;

export const maxDuration = 45;

interface ListItem { name: string; qty: number; price?: number | null }
interface FamilyItem { name: string; qty: number; every?: number | null; ago: number; times: number; price?: number | null }

const SYSTEM_PROMPT = `You are the shopping-list assistant of an Israeli family's grocery app. The family writes in Hebrew; always answer in short, friendly Hebrew (1–3 sentences).

You receive: the family's request, the CURRENT LIST (name, qty, price ₪ per unit if known) and FAMILY ITEMS — what they usually buy (name, usual qty, usual gap in days "every", days since last bought "ago", times bought, typical price).

Respond with JSON matching the schema:
- answer: your short Hebrew reply. Nothing changes until the family confirms, so phrase it as a proposal ("מציע להוסיף…", "אפשר להוריד…"), never "הוספתי". Don't list every proposed item again; the app shows them.
- add: items to add {name, qty, why}. "why" is a very short Hebrew reason (2–5 words), e.g. "נגמר בד״כ כל 7 ימים", "לבולונז".
- remove: names (exactly as on the CURRENT LIST) to remove.
- setQty: {name, qty} for items already on the list whose quantity should change.

Rules:
- When an item is one the family already buys, use their EXACT name from FAMILY ITEMS, and their usual qty unless the request says otherwise.
- Never add an item that is already on the current list; use setQty to change its quantity instead.
- "מה חסר" / "מה שכחתי" / "תשלים": propose family items that are due (ago ≥ ~every) or bought very often, that are not on the list. At most 12, most likely first.
- A meal, recipe or occasion ("פסטה בולונז", "ארוחת שישי ל-8", "על האש"): first decide the actual dishes (e.g. ארוחת שישי: חלות, עוף בתנור, אורז, סלט ירקות, חומוס/טחינה, יין, קינוח), say them briefly in the answer, then propose ONLY the ingredients those dishes need that are NOT on the list, with quantities for the number of people. Use a family item name only when it is that same ingredient. Do not pad the proposal with the family's usual items.
- Budget ("יש לי 150 ₪", "תוריד ב-50"): using the known prices, first reduce quantities and remove snacks, sweets and treats; keep basics (dairy, bread, eggs, produce, main protein) unless there is no other way. Use LIST TOTAL as the current total; the new total is LIST TOTAL minus qty × price of what you remove or reduce. Never invent prices; if prices are missing, say so.
- Explicit commands ("תוסיף 2 חלב", "תוריד את הבמבה", "עוד ביצים") map directly to add/remove/setQty.
- If the request is not about shopping, answer briefly and return empty arrays.
- Keep names short, as a person writes on a shopping list.`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    answer: { type: 'STRING' },
    add: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { name: { type: 'STRING' }, qty: { type: 'NUMBER' }, why: { type: 'STRING', nullable: true } },
        required: ['name', 'qty'],
      },
    },
    remove: { type: 'ARRAY', items: { type: 'STRING' } },
    setQty: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { name: { type: 'STRING' }, qty: { type: 'NUMBER' } },
        required: ['name', 'qty'],
      },
    },
  },
  required: ['answer', 'add', 'remove', 'setQty'],
};

const str = (v: unknown, max = 80) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const price = (p: number | null | undefined) => (p != null ? ` ₪${p}` : '');

function formatContext(list: ListItem[], family: FamilyItem[], planned: string[]): string {
  const listText = list.length ? list.map((i) => `- ${i.name} ×${i.qty}${price(i.price)}`).join('\n') : '(empty)';
  const familyText = family.length
    ? family.map((f) => `- ${f.name} | qty ${f.qty} | every ${f.every ?? '?'} | ago ${f.ago} | times ${f.times}${price(f.price)}`).join('\n')
    : '(no history yet)';
  // Models add up badly: hand them the total.
  const priced = list.filter((i) => i.price != null);
  const total = Math.round(priced.reduce((sum, i) => sum + i.qty * (i.price ?? 0), 0) * 100) / 100;
  const totalText = priced.length
    ? `LIST TOTAL (estimated): ₪${total}${priced.length < list.length ? ` (prices known for ${priced.length} of ${list.length} items)` : ''}`
    : 'LIST TOTAL: unknown (no prices)';
  const plannedText = planned.length
    ? `\n\nALREADY PROPOSED (treat as on the list; never propose these again):\n${planned.map((n) => `- ${n}`).join('\n')}`
    : '';
  return `CURRENT LIST:\n${listText}\n${totalText}${plannedText}\n\nFAMILY ITEMS:\n${familyText}`;
}

async function callModel(model: (typeof MODELS)[number], parts: { text: string }[], apiKey: string) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.3,
        thinkingConfig: model.thinking,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${model.id} error (${res.status})`);
  const data = await res.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no content');
  return JSON.parse(text) as Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ success: false, error: 'העוזר לא מוגדר (חסר מפתח AI)' }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const message = str(body.message, MAX_MESSAGE);
  if (!message) return NextResponse.json({ success: false, error: 'כתבו מה צריך' }, { status: 400 });
  if (!allowRequest(rateKey(request, body.userId), MAX_PER_DAY)) {
    return NextResponse.json({ success: false, error: 'הגעתם למגבלת השאלות היומית לעוזר. נסו שוב מחר.' }, { status: 429 });
  }

  const list: ListItem[] = (Array.isArray(body.list) ? body.list : []).slice(0, MAX_LIST_ITEMS)
    .map((i: Record<string, unknown>) => ({ name: str(i?.name), qty: num(i?.qty) ?? 1, price: num(i?.price) }))
    .filter((i: ListItem) => i.name);
  const family: FamilyItem[] = (Array.isArray(body.family) ? body.family : []).slice(0, MAX_FAMILY_ITEMS)
    .map((f: Record<string, unknown>) => ({
      name: str(f?.name), qty: num(f?.qty) ?? 1, every: num(f?.every), ago: num(f?.ago) ?? 0,
      times: num(f?.times) ?? 1, price: num(f?.price),
    }))
    .filter((f: FamilyItem) => f.name);
  // Proposed earlier in the conversation but not applied yet.
  const planned: string[] = (Array.isArray(body.planned) ? body.planned : []).slice(0, 60)
    .map((n: unknown) => str(n)).filter(Boolean);

  const parts = [
    { text: SYSTEM_PROMPT },
    { text: formatContext(list, family, planned) },
    { text: `REQUEST: ${message}` },
  ];

  let lastError: unknown;
  for (const model of MODELS) {
    try {
      const out = await callModel(model, parts, apiKey);
      const onList = new Set(list.map((i) => i.name.trim()));
      const alreadyProposed = new Set(planned);
      const clampQty = (q: unknown) => Math.min(50, Math.max(1, Math.round(num(q) ?? 1)));
      const data = {
        answer: str(out.answer, 600),
        add: (Array.isArray(out.add) ? out.add : [])
          .map((a: Record<string, unknown>) => ({ name: str(a?.name), qty: clampQty(a?.qty), why: str(a?.why, 60) || null }))
          .filter((a: { name: string }) => a.name && !onList.has(a.name) && !alreadyProposed.has(a.name))
          .slice(0, 25),
        // Only names that really are on the list.
        remove: (Array.isArray(out.remove) ? out.remove : []).map((n: unknown) => str(n)).filter((n: string) => onList.has(n)),
        setQty: (Array.isArray(out.setQty) ? out.setQty : [])
          .map((s: Record<string, unknown>) => ({ name: str(s?.name), qty: clampQty(s?.qty) }))
          .filter((s: { name: string }) => onList.has(s.name)),
      };
      return NextResponse.json({ success: true, data });
    } catch (err) {
      lastError = err;
      console.error('[list-assistant]', err instanceof Error ? err.message : err);
    }
  }
  return NextResponse.json(
    { success: false, error: `העוזר לא זמין כרגע. נסו שוב. (${lastError instanceof Error ? lastError.message : 'error'})` },
    { status: 502 },
  );
}
