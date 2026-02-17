/**
 * Hebrew receipt parser.
 * Extracts store name, date, line items (name, quantity, unit price, total price),
 * and receipt total from raw text (OCR output, PDF text, or pasted text).
 */

export interface ParsedItem {
  name: string;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number | null;
}

export interface ParsedReceipt {
  storeName: string | null;
  purchaseDate: string | null; // YYYY-MM-DD
  items: ParsedItem[];
  totalAmount: number | null;
}

// Store name patterns (common Israeli chains)
const STORE_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /שופרסל/i, name: 'שופרסל' },
  { pattern: /shufersal/i, name: 'שופרסל' },
  { pattern: /רמי\s*לוי/i, name: 'רמי לוי' },
  { pattern: /rami\s*levy/i, name: 'רמי לוי' },
  { pattern: /יוחננוף/i, name: 'יוחננוף' },
  { pattern: /מגא/i, name: 'מגא' },
  { pattern: /ויקטורי/i, name: 'ויקטורי' },
  { pattern: /victory/i, name: 'ויקטורי' },
  { pattern: /חצי\s*חינם/i, name: 'חצי חינם' },
  { pattern: /אושר\s*עד/i, name: 'אושר עד' },
  { pattern: /osher\s*ad/i, name: 'אושר עד' },
  { pattern: /טיב\s*טעם/i, name: 'טיב טעם' },
  { pattern: /tiv\s*taam/i, name: 'טיב טעם' },
  { pattern: /יינות\s*ביתן/i, name: 'יינות ביתן' },
  { pattern: /זול\s*ו?בגדול/i, name: 'זול ובגדול' },
  { pattern: /am[:\s]*pm/i, name: 'AM:PM' },
  { pattern: /קרפור/i, name: 'קרפור' },
];

// Lines to skip (headers, VAT, discounts, totals come later)
const SKIP_PATTERNS = [
  /^[-=_*]+$/,           // separator lines
  /^\s*$/,               // empty lines
  /מע["״]מ/,            // VAT
  /עוסק\s*מורשה/,       // business number
  /ח\.?פ\.?\s*\d/,      // company registration
  /טלפון|טל[:.]|פקס/,   // phone / fax
  /כתובת|רחוב/,          // address
  /סניף/,               // branch
  /קופ[הא]/,            // register / cashier
  /מזומן|אשראי|ויזה|מסטרקארד|ישראכרט|visa|mastercard/i, // payment methods
  /שינוי|החזר/,          // change / refund header
  /תודה|thank/i,         // thanks
  /^\d{2}[/:]\d{2}[/:]\d{2}\s*$/,  // time-only lines (HH:MM:SS)
];

// Total line patterns
const TOTAL_PATTERNS = [
  /סה["״]?כ\s*(?:לתשלום|כולל|הכל)?[:\s]*([0-9,.]+)/,
  /סכום\s*(?:לתשלום|כולל)?[:\s]*([0-9,.]+)/,
  /לתשלום[:\s]*([0-9,.]+)/,
  /total[:\s]*([0-9,.]+)/i,
  /TOTAL[:\s]*([0-9,.]+)/,
];

// Date patterns
const DATE_PATTERNS = [
  // DD/MM/YYYY or DD/MM/YY
  /(\d{1,2})[/.](\d{1,2})[/.](\d{4}|\d{2})/,
  // YYYY-MM-DD (ISO)
  /(\d{4})-(\d{1,2})-(\d{1,2})/,
];

/**
 * Detect store name from receipt text.
 */
function detectStore(text: string): string | null {
  for (const { pattern, name } of STORE_PATTERNS) {
    if (pattern.test(text)) {
      return name;
    }
  }
  return null;
}

/**
 * Extract purchase date from receipt text. Returns YYYY-MM-DD or null.
 */
function extractDate(text: string): string | null {
  const lines = text.split('\n');
  for (const line of lines) {
    // Try ISO format first
    const isoMatch = line.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch) {
      const [, y, m, d] = isoMatch;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    // Try DD/MM/YYYY or DD.MM.YYYY
    const dmyMatch = line.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{4}|\d{2})/);
    if (dmyMatch) {
      const [, d, m, y] = dmyMatch;
      const fullYear = y.length === 2 ? `20${y}` : y;
      const month = parseInt(m, 10);
      const day = parseInt(d, 10);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
  }
  return null;
}

/**
 * Extract total amount from receipt text.
 */
function extractTotal(text: string): number | null {
  const lines = text.split('\n');
  // Search from the bottom since total is usually at the end
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    for (const pattern of TOTAL_PATTERNS) {
      const match = line.match(pattern);
      if (match && match[1]) {
        const value = parseFloat(match[1].replace(',', ''));
        if (!isNaN(value) && value > 0) {
          return value;
        }
      }
    }
  }
  return null;
}

/**
 * Check if a line should be skipped.
 */
function shouldSkipLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  for (const pattern of SKIP_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  // Skip total lines (we extract those separately)
  for (const pattern of TOTAL_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  return false;
}

/**
 * Parse a single line from a receipt into an item.
 * Israeli receipt formats:
 *   "item name     quantity  X  unit_price    total_price"
 *   "item name     total_price"
 *   "0.XXX ק"ג  X  XX.XX   total_price"  (weight items)
 */
function parseItemLine(line: string): ParsedItem | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Skip discount lines (negative amounts or הנחה)
  if (/הנחה|הנח[הת]|discount/i.test(trimmed)) return null;
  if (/מבצע/i.test(trimmed) && !/\d/.test(trimmed)) return null;

  // Pattern 1: weight items - "0.XXX ק"ג X XX.XX   total"
  // Sometimes: "name  0.XXX ק"ג  X XX.XX/ק"ג  total"
  const weightMatch = trimmed.match(
    /^(.+?)\s+([\d.]+)\s*(?:ק["״]ג|קג|kg)\s*[xX×*]\s*([\d.]+)\s+([\d.]+)\s*$/
  );
  if (weightMatch) {
    const [, name, qty, unitP, totalP] = weightMatch;
    const quantity = parseFloat(qty);
    const unitPrice = parseFloat(unitP);
    const totalPrice = parseFloat(totalP);
    if (!isNaN(quantity) && !isNaN(totalPrice) && name.trim().length > 0) {
      return {
        name: name.trim(),
        quantity,
        unitPrice: isNaN(unitPrice) ? null : unitPrice,
        totalPrice,
      };
    }
  }

  // Pattern 2: "name  qty X unitprice  total"
  const qtyMatch = trimmed.match(
    /^(.+?)\s+(\d+)\s*[xX×*]\s*([\d.]+)\s+([\d.]+)\s*$/
  );
  if (qtyMatch) {
    const [, name, qty, unitP, totalP] = qtyMatch;
    const quantity = parseInt(qty, 10);
    const unitPrice = parseFloat(unitP);
    const totalPrice = parseFloat(totalP);
    if (!isNaN(quantity) && !isNaN(totalPrice) && name.trim().length > 0) {
      return {
        name: name.trim(),
        quantity,
        unitPrice: isNaN(unitPrice) ? null : unitPrice,
        totalPrice,
      };
    }
  }

  // Pattern 3: "name  qty  unitprice  total" (no X separator)
  const threeNumMatch = trimmed.match(
    /^(.+?)\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s*$/
  );
  if (threeNumMatch) {
    const [, name, qty, unitP, totalP] = threeNumMatch;
    const quantity = parseInt(qty, 10);
    const unitPrice = parseFloat(unitP);
    const totalPrice = parseFloat(totalP);
    if (!isNaN(quantity) && quantity > 0 && quantity < 100 && !isNaN(totalPrice) && name.trim().length > 0) {
      return {
        name: name.trim(),
        quantity,
        unitPrice: isNaN(unitPrice) ? null : unitPrice,
        totalPrice,
      };
    }
  }

  // Pattern 4: "name   price" (single item, quantity 1)
  const singlePriceMatch = trimmed.match(
    /^(.+?)\s{2,}([\d,.]+)\s*$/
  );
  if (singlePriceMatch) {
    const [, name, price] = singlePriceMatch;
    const totalPrice = parseFloat(price.replace(',', ''));
    if (!isNaN(totalPrice) && totalPrice > 0 && totalPrice < 10000 && name.trim().length > 1) {
      return {
        name: name.trim(),
        quantity: 1,
        unitPrice: totalPrice,
        totalPrice,
      };
    }
  }

  // Pattern 5: Shufersal online format "name\tqty\tprice"
  const tabMatch = trimmed.split('\t').map(s => s.trim()).filter(Boolean);
  if (tabMatch.length >= 2) {
    const name = tabMatch[0];
    const lastVal = parseFloat(tabMatch[tabMatch.length - 1]?.replace(',', '') || '');
    if (!isNaN(lastVal) && lastVal > 0 && name.length > 1) {
      let quantity = 1;
      let unitPrice: number | null = lastVal;
      if (tabMatch.length >= 3) {
        const qVal = parseFloat(tabMatch[1]);
        if (!isNaN(qVal) && qVal > 0 && qVal < 100) {
          quantity = qVal;
          unitPrice = lastVal / quantity || lastVal;
        }
      }
      return {
        name,
        quantity,
        unitPrice,
        totalPrice: lastVal,
      };
    }
  }

  return null;
}

/**
 * Main parsing function. Takes raw receipt text and returns structured data.
 */
export function parseReceipt(rawText: string): ParsedReceipt {
  const storeName = detectStore(rawText);
  const purchaseDate = extractDate(rawText);
  const totalAmount = extractTotal(rawText);

  const lines = rawText.split('\n');
  const items: ParsedItem[] = [];

  for (const line of lines) {
    if (shouldSkipLine(line)) continue;

    const parsed = parseItemLine(line);
    if (parsed) {
      items.push(parsed);
    }
  }

  return {
    storeName,
    purchaseDate,
    items,
    totalAmount,
  };
}
