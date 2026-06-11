import { NextRequest, NextResponse } from 'next/server';
import { parseReceiptWithAI, parseReceiptMultimodal } from '@/lib/geminiReceiptParser';
import { extractTextFromPdf } from '@/lib/pdfParser';

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

const MIN_USEFUL_TEXT_LENGTH = 50;

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
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

      const file = files[0];
      const fileMime = file.type;
      const fileName = file.name.toLowerCase();
      const isPdf = fileMime === 'application/pdf' || fileName.endsWith('.pdf');
      const allImages = files.every((f) => isImageMime(f.type));

      if (isPdf) {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const rawText = await extractTextFromPdf(buffer);

        if (rawText && rawText.trim().length >= MIN_USEFUL_TEXT_LENGTH) {
          const parsed = await parseReceiptWithAI(rawText);
          return NextResponse.json({
            success: true,
            data: { ...parsed, rawText },
          });
        }

        // Scanned PDF with little/no extractable text -- try multimodal
        const base64 = buffer.toString('base64');
        const parsed = await parseReceiptMultimodal([
          { base64, mimeType: 'application/pdf' },
        ]);
        return NextResponse.json({
          success: true,
          data: { ...parsed, rawText: rawText || '' },
        });
      }

      if (allImages) {
        // One or more photos; multiple = overlapping segments of one long
        // receipt, merged by Gemini in a single multimodal request.
        const images = await Promise.all(
          files.map(async (f) => ({
            base64: Buffer.from(await f.arrayBuffer()).toString('base64'),
            mimeType: f.type,
          }))
        );
        const parsed = await parseReceiptMultimodal(images);
        return NextResponse.json({
          success: true,
          data: { ...parsed, rawText: '' },
        });
      }

      // Plain text files (.txt, .csv, .html)
      const rawText = await file.text();
      if (!rawText || typeof rawText !== 'string') {
        return NextResponse.json(
          { success: false, error: 'No text content found in file' },
          { status: 400 }
        );
      }

      const parsed = await parseReceiptWithAI(rawText);
      return NextResponse.json({
        success: true,
        data: { ...parsed, rawText },
      });
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

    const parsed = await parseReceiptWithAI(rawText);
    return NextResponse.json({
      success: true,
      data: { ...parsed, rawText },
    });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Unknown error' },
      { status: 500 }
    );
  }
}
