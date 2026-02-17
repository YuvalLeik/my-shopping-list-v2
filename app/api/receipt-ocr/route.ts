import { NextRequest, NextResponse } from 'next/server';

const GOOGLE_VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate';

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'Google Cloud Vision API key not configured. Set GOOGLE_CLOUD_VISION_API_KEY in .env.local' },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'Image file is required' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { success: false, error: 'File must be an image' },
        { status: 400 }
      );
    }

    // Read file as base64
    const arrayBuffer = await file.arrayBuffer();
    const base64Content = Buffer.from(arrayBuffer).toString('base64');

    // Call Google Cloud Vision API
    const visionResponse = await fetch(`${GOOGLE_VISION_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: base64Content },
            features: [
              { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 },
            ],
            imageContext: {
              languageHints: ['he', 'en'],
            },
          },
        ],
      }),
    });

    if (!visionResponse.ok) {
      const errorBody = await visionResponse.text();
      throw new Error(`Google Vision API error (${visionResponse.status}): ${errorBody}`);
    }

    const visionData = await visionResponse.json();

    // Extract text from response
    const annotations = visionData.responses?.[0];
    if (annotations?.error) {
      throw new Error(`Vision API error: ${annotations.error.message}`);
    }

    const fullText = annotations?.fullTextAnnotation?.text || annotations?.textAnnotations?.[0]?.description || '';

    if (!fullText) {
      return NextResponse.json({
        success: true,
        data: { text: '', imageUrl: null },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        text: fullText,
        imageUrl: null,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Unknown OCR error' },
      { status: 500 }
    );
  }
}
