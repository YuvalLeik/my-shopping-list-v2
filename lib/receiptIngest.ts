import { parseReceiptWithAI, parseReceiptMultimodal, findDateInText, ParseOptions } from '@/lib/geminiReceiptParser';
import { extractTextFromPdf } from '@/lib/pdfParser';

/**
 * PDFs always go to Gemini as a document: text extracted from Hebrew PDFs
 * comes out with mirrored word order and glued numbers, which made long
 * digital receipts (Weezmo etc.) unreadable. The extracted text is only used
 * as a fallback and to recover the date.
 */
export async function parsePdfBuffer(buffer: Buffer, opts: ParseOptions) {
  const rawText = await extractTextFromPdf(buffer).catch(() => '');
  let parsed = await parseReceiptMultimodal([{ base64: buffer.toString('base64'), mimeType: 'application/pdf' }], opts);
  if (parsed.items.length === 0 && rawText.trim().length >= 50) {
    parsed = await parseReceiptWithAI(rawText, opts);
  }
  if (!parsed.purchaseDate && rawText) parsed.purchaseDate = findDateInText(rawText);
  return { ...parsed, rawText };
}
