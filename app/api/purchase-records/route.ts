import { NextRequest, NextResponse } from 'next/server';
import { createPurchaseRecord, fetchPurchaseRecords, fetchPurchaseRecordsByListId } from '@/lib/purchaseRecords';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, groceryListId, storeName, purchaseDate, totalAmount, source, receiptImageUrl, rawText, items } = body;

    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId is required' }, { status: 400 });
    }
    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ success: false, error: 'items array is required' }, { status: 400 });
    }

    const record = await createPurchaseRecord({
      userId,
      groceryListId: groceryListId || null,
      storeName: storeName || null,
      purchaseDate: purchaseDate || null,
      totalAmount: totalAmount != null ? totalAmount : null,
      source: source || 'copy_paste',
      receiptImageUrl: receiptImageUrl || null,
      rawText: rawText || null,
      items,
    });

    return NextResponse.json({ success: true, data: record });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: false, error: 'Unknown error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const listId = searchParams.get('listId');

    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId is required' }, { status: 400 });
    }

    let records;
    if (listId) {
      records = await fetchPurchaseRecordsByListId(listId, userId);
    } else {
      records = await fetchPurchaseRecords(userId);
    }

    return NextResponse.json({ success: true, data: records });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: false, error: 'Unknown error' }, { status: 500 });
  }
}
