import { NextRequest, NextResponse } from 'next/server';
import { parseReceiptWithAI } from '@/lib/geminiReceiptParser';
import { extractTextFromPdf } from '@/lib/pdfParser';

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    let rawText: string;

    if (contentType.includes('multipart/form-data')) {
      // File upload (PDF or text file)
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json(
          { success: false, error: 'file is required' },
          { status: 400 }
        );
      }

      const fileName = file.name.toLowerCase();
      if (fileName.endsWith('.pdf')) {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        rawText = await extractTextFromPdf(buffer);
      } else {
        // .txt, .csv, .html - read as text
        rawText = await file.text();
      }
    } else {
      // JSON body with rawText
      const body = await request.json();
      rawText = body.rawText;
    }

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
