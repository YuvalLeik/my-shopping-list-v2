import { supabase } from './supabase';

export interface PurchaseItem {
  id: string;
  purchase_record_id: string;
  name: string;
  quantity: number;
  unit_price: number | null;
  total_price: number | null;
  matched_grocery_item_id: string | null;
  created_at: string;
}

export interface PurchaseRecord {
  id: string;
  local_user_id: string;
  grocery_list_id: string | null;
  store_name: string | null;
  purchase_date: string | null;
  total_amount: number | null;
  source: 'photo_ocr' | 'pdf_upload' | 'copy_paste';
  receipt_image_url: string | null;
  raw_text: string | null;
  created_at: string;
}

export interface PurchaseRecordWithItems extends PurchaseRecord {
  items: PurchaseItem[];
}

export interface CreatePurchaseRecordInput {
  userId: string;
  groceryListId?: string | null;
  storeName?: string | null;
  purchaseDate?: string | null;
  totalAmount?: number | null;
  source: 'photo_ocr' | 'pdf_upload' | 'copy_paste';
  receiptImageUrl?: string | null;
  rawText?: string | null;
  items: Array<{
    name: string;
    quantity?: number;
    unitPrice?: number | null;
    totalPrice?: number | null;
  }>;
}

export async function createPurchaseRecord(input: CreatePurchaseRecordInput): Promise<PurchaseRecordWithItems> {
  const { data: record, error: recordError } = await supabase
    .from('purchase_records')
    .insert([{
      local_user_id: input.userId,
      grocery_list_id: input.groceryListId || null,
      store_name: input.storeName || null,
      purchase_date: input.purchaseDate || null,
      total_amount: input.totalAmount || null,
      source: input.source,
      receipt_image_url: input.receiptImageUrl || null,
      raw_text: input.rawText || null,
    }])
    .select()
    .single();

  if (recordError || !record) {
    throw new Error(`Failed to create purchase record: ${recordError?.message || 'No data returned'}`);
  }

  let items: PurchaseItem[] = [];

  if (input.items.length > 0) {
    const itemRows = input.items.map(item => ({
      purchase_record_id: record.id,
      name: item.name,
      quantity: item.quantity ?? 1,
      unit_price: item.unitPrice ?? null,
      total_price: item.totalPrice ?? null,
    }));

    const { data: insertedItems, error: itemsError } = await supabase
      .from('purchase_items')
      .insert(itemRows)
      .select();

    if (itemsError) {
      throw new Error(`Failed to insert purchase items: ${itemsError.message}`);
    }

    items = insertedItems || [];
  }

  return { ...record, items };
}

export async function fetchPurchaseRecords(userId: string): Promise<PurchaseRecordWithItems[]> {
  const { data: records, error } = await supabase
    .from('purchase_records')
    .select('*')
    .eq('local_user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch purchase records: ${error.message}`);
  }

  if (!records || records.length === 0) return [];

  const recordIds = records.map(r => r.id);

  const { data: allItems, error: itemsError } = await supabase
    .from('purchase_items')
    .select('*')
    .in('purchase_record_id', recordIds)
    .order('created_at', { ascending: true });

  if (itemsError) {
    throw new Error(`Failed to fetch purchase items: ${itemsError.message}`);
  }

  const itemsByRecord = new Map<string, PurchaseItem[]>();
  (allItems || []).forEach(item => {
    const list = itemsByRecord.get(item.purchase_record_id) || [];
    list.push(item);
    itemsByRecord.set(item.purchase_record_id, list);
  });

  return records.map(record => ({
    ...record,
    items: itemsByRecord.get(record.id) || [],
  }));
}

export async function fetchStandalonePurchaseRecords(userId: string): Promise<PurchaseRecordWithItems[]> {
  const { data: records, error } = await supabase
    .from('purchase_records')
    .select('*')
    .eq('local_user_id', userId)
    .is('grocery_list_id', null)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch standalone purchase records: ${error.message}`);
  }

  if (!records || records.length === 0) return [];

  const recordIds = records.map(r => r.id);

  const { data: allItems, error: itemsError } = await supabase
    .from('purchase_items')
    .select('*')
    .in('purchase_record_id', recordIds)
    .order('created_at', { ascending: true });

  if (itemsError) {
    throw new Error(`Failed to fetch purchase items: ${itemsError.message}`);
  }

  const itemsByRecord = new Map<string, PurchaseItem[]>();
  (allItems || []).forEach(item => {
    const list = itemsByRecord.get(item.purchase_record_id) || [];
    list.push(item);
    itemsByRecord.set(item.purchase_record_id, list);
  });

  return records.map(record => ({
    ...record,
    items: itemsByRecord.get(record.id) || [],
  }));
}

export async function fetchPurchaseRecordsByListId(listId: string, userId: string): Promise<PurchaseRecordWithItems[]> {
  const { data: records, error } = await supabase
    .from('purchase_records')
    .select('*')
    .eq('grocery_list_id', listId)
    .eq('local_user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch purchase records for list: ${error.message}`);
  }

  if (!records || records.length === 0) return [];

  const recordIds = records.map(r => r.id);

  const { data: allItems, error: itemsError } = await supabase
    .from('purchase_items')
    .select('*')
    .in('purchase_record_id', recordIds)
    .order('created_at', { ascending: true });

  if (itemsError) {
    throw new Error(`Failed to fetch purchase items: ${itemsError.message}`);
  }

  const itemsByRecord = new Map<string, PurchaseItem[]>();
  (allItems || []).forEach(item => {
    const list = itemsByRecord.get(item.purchase_record_id) || [];
    list.push(item);
    itemsByRecord.set(item.purchase_record_id, list);
  });

  return records.map(record => ({
    ...record,
    items: itemsByRecord.get(record.id) || [],
  }));
}

export async function deletePurchaseRecord(recordId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('purchase_records')
    .delete()
    .eq('id', recordId)
    .eq('local_user_id', userId);

  if (error) {
    throw new Error(`Failed to delete purchase record: ${error.message}`);
  }
}

export async function uploadReceiptImage(file: File, recordId: string): Promise<{ publicUrl: string; path: string }> {
  const bucket = 'receipt-images';
  const ext = file.name.split('.').pop() || 'jpg';
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const path = `public/receipts/${recordId}/${fileName}`;

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    throw new Error(`Failed to upload receipt image: ${error.message}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);

  if (!data?.publicUrl) {
    throw new Error('Failed to get public URL for uploaded receipt');
  }

  return { publicUrl: data.publicUrl, path };
}
