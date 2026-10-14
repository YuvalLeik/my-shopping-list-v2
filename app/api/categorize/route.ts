import { NextRequest, NextResponse } from 'next/server';
import { CATEGORIES } from '@/lib/categories';

// Last-resort categorizer for names the history lookup and keyword dictionary
// both missed. Results are cached client-side into shopping_items, so each
// distinct name costs at most one call.
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const MAX_NAMES = 40;
const ASSIGNABLE = CATEGORIES.filter((c) => c !== 'ללא קטגוריה');

export async function POST(request: NextRequest) {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ categories: {} });

  let names: string[];
  try {
    const body = await request.json();
    names = (Array.isArray(body?.names) ? body.names : [])
      .filter((n: unknown): n is string => typeof n === 'string' && n.trim().length > 0)
      .map((n: string) => n.trim().slice(0, 80))
      .slice(0, MAX_NAMES);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (names.length === 0) return NextResponse.json({ categories: {} });

  const prompt = `You categorize Israeli supermarket products (names are in Hebrew).
Allowed categories (use the exact Hebrew string): ${ASSIGNABLE.map((c) => `"${c}"`).join(', ')}.
Bread, snacks, sweets, spices, canned goods and dry goods go to "מזווה". Use "אחר" only if nothing fits.
Return ONLY a JSON object mapping each input name (exactly as given) to its category.
Names:
${names.map((n) => `- ${n}`).join('\n')}`;

  try {
    const res = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.error(`categorize: Gemini ${res.status}`);
      return NextResponse.json({ categories: {} });
    }
    const json = await res.json();
    const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const categories: Record<string, string> = {};
    for (const name of names) {
      const c = parsed[name];
      if (typeof c === 'string' && ASSIGNABLE.includes(c)) categories[name] = c;
    }
    return NextResponse.json({ categories });
  } catch (err) {
    console.error('categorize: failed', err);
    return NextResponse.json({ categories: {} });
  }
}
