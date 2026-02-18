import { NextRequest, NextResponse } from 'next/server';
import { parseReceiptWithAI, parseReceiptMultimodal } from '@/lib/geminiReceiptParser';

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

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json(
          { success: false, error: 'file is required' },
          { status: 400 }
        );
      }

      const fileMime = file.type;
      const fileName = file.name.toLowerCase();
      const isPdf = fileMime === 'application/pdf' || fileName.endsWith('.pdf');
      const isImage = isImageMime(fileMime);

      if (isPdf || isImage) {
        const arrayBuffer = await file.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        const mimeType = isPdf ? 'application/pdf' : fileMime;

        const parsed = await parseReceiptMultimodal(base64, mimeType);

        return NextResponse.json({
          success: true,
          data: { ...parsed, rawText: '' },
        });
      }

      // Plain text files (.txt, .csv, .html) -- parse as text
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
