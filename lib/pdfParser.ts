/**
 * Server-side PDF text extraction using pdf-parse.
 * Imports from pdf-parse/lib/pdf-parse to bypass the wrapper's
 * test-file read that crashes in Next.js/Turbopack.
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse/lib/pdf-parse');
  const data = await pdfParse(buffer);
  return data.text as string;
}
