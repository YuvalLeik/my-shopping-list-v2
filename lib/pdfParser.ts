/**
 * PDF text extraction using pdf-parse (v1).
 * Server-side only (uses Node.js Buffer).
 */

/**
 * Extract text content from a PDF buffer.
 * Returns the raw text which can then be fed into receiptParser.
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  // Dynamic import to avoid Turbopack static analysis issues
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse/lib/pdf-parse');
  const data = await pdfParse(buffer);
  return data.text || '';
}
