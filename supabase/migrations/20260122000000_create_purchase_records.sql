-- Create purchase_records table: stores imported receipts / online orders
CREATE TABLE IF NOT EXISTS purchase_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_user_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  grocery_list_id uuid REFERENCES grocery_lists(id) ON DELETE SET NULL,
  store_name text,
  purchase_date date,
  total_amount numeric(12,2),
  source text NOT NULL DEFAULT 'copy_paste', -- 'photo_ocr' | 'pdf_upload' | 'copy_paste'
  receipt_image_url text,
  raw_text text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_records_user ON purchase_records(local_user_id);
CREATE INDEX IF NOT EXISTS idx_purchase_records_list ON purchase_records(grocery_list_id);

-- Enable RLS
ALTER TABLE purchase_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read purchase_records" ON purchase_records;
CREATE POLICY "Public read purchase_records"
ON purchase_records FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Public insert purchase_records" ON purchase_records;
CREATE POLICY "Public insert purchase_records"
ON purchase_records FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "Public update purchase_records" ON purchase_records;
CREATE POLICY "Public update purchase_records"
ON purchase_records FOR UPDATE TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public delete purchase_records" ON purchase_records;
CREATE POLICY "Public delete purchase_records"
ON purchase_records FOR DELETE TO public USING (true);


-- Create purchase_items table: individual line items from a receipt
CREATE TABLE IF NOT EXISTS purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_record_id uuid NOT NULL REFERENCES purchase_records(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity numeric(10,2) DEFAULT 1,
  unit_price numeric(12,2),
  total_price numeric(12,2),
  matched_grocery_item_id uuid REFERENCES grocery_items(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_items_record ON purchase_items(purchase_record_id);

-- Enable RLS
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read purchase_items" ON purchase_items;
CREATE POLICY "Public read purchase_items"
ON purchase_items FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Public insert purchase_items" ON purchase_items;
CREATE POLICY "Public insert purchase_items"
ON purchase_items FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "Public update purchase_items" ON purchase_items;
CREATE POLICY "Public update purchase_items"
ON purchase_items FOR UPDATE TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public delete purchase_items" ON purchase_items;
CREATE POLICY "Public delete purchase_items"
ON purchase_items FOR DELETE TO public USING (true);
