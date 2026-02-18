import { parseReceipt, ParsedReceipt } from './receiptParser';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const SYSTEM_PROMPT = `You are a Hebrew supermarket receipt parser. You receive raw text from an Israeli supermarket receipt (OCR, PDF, or copy-paste) and extract structured data.

Return ONLY valid JSON with this exact structure (no markdown, no explanation, no code fences):
{
  "storeName": "store name or null",
  "purchaseDate": "YYYY-MM-DD or null",
  "items": [
    {
      "name": "item name in Hebrew",
      "quantity": 1,
      "unitPrice": 5.90,
      "totalPrice": 5.90
    }
  ],
  "totalAmount": 123.45
}

Rules:
- Extract every purchased item with its name, quantity, unit price, and total price
- For weight items (e.g. "0.532 ק"ג X 12.90"), calculate quantity as the weight and unitPrice as price per kg
- Ignore discount lines (הנחה), but if a discount applies to a specific item, subtract it from that item's totalPrice
- Ignore VAT (מע"מ), payment method lines, change lines, headers, footers, branch info, cashier info
- Store name: look for known chains (שופרסל, רמי לוי, יוחננוף, ויקטורי, מגא, חצי חינם, אושר עד, טיב טעם, יינות ביתן) or any store name at the top
- Date: extract purchase date in YYYY-MM-DD format (Israeli dates are usually DD/MM/YYYY)
- totalAmount: the final amount paid (סה"כ לתשלום / סכום לתשלום)
- If a field cannot be determined, use null
- Always return valid JSON, nothing else`;

/**
 * Parse receipt text using Google Gemini AI.
 * Falls back to regex parser if Gemini is unavailable.
 */
export async function parseReceiptWithAI(rawText: string): Promise<ParsedReceipt> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;

  if (!apiKey) {
    console.log('[geminiReceiptParser] No GOOGLE_GEMINI_API_KEY, falling back to regex parser');
    return parseReceipt(rawText);
  }

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: SYSTEM_PROMPT },
              { text: `Here is the receipt text to parse:\n\n${rawText}` },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[geminiReceiptParser] Gemini API error (${response.status}):`, errorText);
      return parseReceipt(rawText);
    }

    const data = await response.json();

    const textContent = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textContent) {
      console.error('[geminiReceiptParser] No text in Gemini response, falling back');
      return parseReceipt(rawText);
    }

    // Clean response: remove markdown fences if present
    let jsonStr = textContent.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    const parsed = JSON.parse(jsonStr);

    // Validate and normalize the response
    const result: ParsedReceipt = {
      storeName: typeof parsed.storeName === 'string' ? parsed.storeName : null,
      purchaseDate: typeof parsed.purchaseDate === 'string' ? parsed.purchaseDate : null,
      items: [],
      totalAmount: typeof parsed.totalAmount === 'number' ? parsed.totalAmount : null,
    };

    if (Array.isArray(parsed.items)) {
      result.items = parsed.items
        .filter((item: Record<string, unknown>) => item && typeof item.name === 'string' && item.name.trim())
        .map((item: Record<string, unknown>) => ({
          name: String(item.name).trim(),
          quantity: typeof item.quantity === 'number' ? item.quantity : 1,
          unitPrice: typeof item.unitPrice === 'number' ? item.unitPrice : null,
          totalPrice: typeof item.totalPrice === 'number' ? item.totalPrice : null,
        }));
    }

    return result;
  } catch (err) {
    console.error('[geminiReceiptParser] Failed, falling back to regex parser:', err);
    return parseReceipt(rawText);
  }
}
