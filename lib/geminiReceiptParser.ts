import { parseReceipt, ParsedReceipt } from './receiptParser';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const SYSTEM_PROMPT = `You are a Hebrew supermarket receipt parser. You receive either raw text or a visual document (PDF/image) from an Israeli supermarket receipt or online grocery order, and extract structured data.

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
- Extract ONLY actual purchased grocery/food/household products
- For weight items (e.g. "0.532 ק"ג X 12.90"), calculate quantity as the weight and unitPrice as price per kg
- Ignore discount lines (הנחה), but if a discount applies to a specific item, subtract it from that item's totalPrice
- Ignore VAT (מע"מ), payment method lines, change lines

CRITICAL - Ignore all of the following (these are NOT items):
- Delivery addresses, street names, apartment/floor info (e.g. "ז'בוטינסקי 7 קומה:.")
- City names, zip codes, building/entrance details
- Phone numbers, email addresses, customer names
- Order numbers, transaction IDs, reference numbers
- Branch info, cashier info, register numbers
- Headers, footers, logos, barcodes
- Delivery time slots, shipping details
- Terms and conditions, return policy text

- Store name: look for known chains (שופרסל, רמי לוי, יוחננוף, ויקטורי, מגא, חצי חינם, אושר עד, טיב טעם, יינות ביתן) or any store name at the top
- Date: extract purchase date in YYYY-MM-DD format (Israeli dates are usually DD/MM/YYYY)
- totalAmount: the final amount paid (סה"כ לתשלום / סכום לתשלום)
- If a field cannot be determined, use null
- Always return valid JSON, nothing else`;

function getApiKey(): string | undefined {
  return process.env.GOOGLE_GEMINI_API_KEY;
}

function validateAndNormalize(parsed: Record<string, unknown>): ParsedReceipt {
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
}

function cleanJsonResponse(text: string): string {
  let jsonStr = text.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return jsonStr;
}

/**
 * Parse a receipt file (PDF or image) using Gemini multimodal vision.
 * Sends the raw file bytes so Gemini can see the visual layout.
 */
export async function parseReceiptMultimodal(
  base64Data: string,
  mimeType: string
): Promise<ParsedReceipt> {
  const apiKey = getApiKey();

  if (!apiKey) {
    console.log('[geminiReceiptParser] No GOOGLE_GEMINI_API_KEY, cannot do multimodal parse');
    return { storeName: null, purchaseDate: null, items: [], totalAmount: null };
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
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[geminiReceiptParser] Gemini multimodal error (${response.status}):`, errorText);
      return { storeName: null, purchaseDate: null, items: [], totalAmount: null };
    }

    const data = await response.json();
    const textContent = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textContent) {
      console.error('[geminiReceiptParser] No text in multimodal Gemini response');
      return { storeName: null, purchaseDate: null, items: [], totalAmount: null };
    }

    const parsed = JSON.parse(cleanJsonResponse(textContent));
    return validateAndNormalize(parsed);
  } catch (err) {
    console.error('[geminiReceiptParser] Multimodal parse failed:', err);
    return { storeName: null, purchaseDate: null, items: [], totalAmount: null };
  }
}

/**
 * Parse receipt text using Google Gemini AI.
 * Falls back to regex parser if Gemini is unavailable.
 */
export async function parseReceiptWithAI(rawText: string): Promise<ParsedReceipt> {
  const apiKey = getApiKey();

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

    const parsed = JSON.parse(cleanJsonResponse(textContent));
    return validateAndNormalize(parsed);
  } catch (err) {
    console.error('[geminiReceiptParser] Failed, falling back to regex parser:', err);
    return parseReceipt(rawText);
  }
}
