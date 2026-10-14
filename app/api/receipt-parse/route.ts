import { NextRequest, NextResponse } from 'next/server';
import { parseReceiptWithAI, parseReceiptMultimodal, findDateInText, ParseOptions } from '@/lib/geminiReceiptParser';
import { parsePdfBuffer } from '@/lib/receiptIngest';

// Long digital receipts (100+ lines) take Gemini ~30s.
export const maxDuration = 60;

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

function isImageMime(mime: string): boolean {
  return IMAGE_MIME_TYPES.has(mime) || mime.startsWith('image/');
}

function isPdfFile(f: File): boolean {
  return f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
}

function readOptions(raw: unknown): ParseOptions {
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const names = JSON.parse(raw);
    return Array.isArray(names) ? { candidateNames: names.filter((n) => typeof n === 'string') } : {};
  } catch {
    return {};
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const opts = readOptions(formData.get('candidates'));
      const files = formData
        .getAll('file')
        .filter((f): f is File => f instanceof File);
      if (files.length === 0) {
        return NextResponse.json(
          { success: false, error: 'file is required' },
          { status: 400 }
        );
      }
      if (files.length > 6) {
        return NextResponse.json(
          { success: false, error: 'Maximum 6 receipt segments per request' },
          { status: 400 }
        );
      }

      const pdf = files.find(isPdfFile);
      if (pdf) {
        const data = await parsePdfBuffer(Buffer.from(await pdf.arrayBuffer()), opts);
        return NextResponse.json({ success: true, data });
      }

      if (files.every((f) => isImageMime(f.type))) {
        // One or more photos; multiple = overlapping segments of one long
        // receipt, merged by Gemini in a single multimodal request.
        const images = await Promise.all(
          files.map(async (f) => ({
            base64: Buffer.from(await f.arrayBuffer()).toString('base64'),
            mimeType: f.type,
          }))
        );
        const parsed = await parseReceiptMultimodal(images, opts);
        return NextResponse.json({ success: true, data: { ...parsed, rawText: '' } });
      }

      // Plain text files (.txt, .csv, .html)
      const rawText = await files[0].text();
      if (!rawText) {
        return NextResponse.json(
          { success: false, error: 'No text content found in file' },
          { status: 400 }
        );
      }
      const parsed = await parseReceiptWithAI(rawText, opts);
      if (!parsed.purchaseDate) parsed.purchaseDate = findDateInText(rawText);
      return NextResponse.json({ success: true, data: { ...parsed, rawText } });
    }

    // JSON body with rawText (paste flow)
    const body = await request.json();
    const rawText = body.rawText;
    if (!rawText || typeof rawText !== 'string') {
      return NextResponse.json(
        { success: false, error: 'No text content found' },
        { status: 400 }
      );
    }
    const opts: ParseOptions = Array.isArray(body.candidates) ? { candidateNames: body.candidates } : {};
    const parsed = await parseReceiptWithAI(rawText, opts);
    if (!parsed.purchaseDate) parsed.purchaseDate = findDateInText(rawText);
    return NextResponse.json({ success: true, data: { ...parsed, rawText } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
