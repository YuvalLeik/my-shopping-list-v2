-- Item aliases: maps receipt item names to canonical catalog names (per user)
CREATE TABLE IF NOT EXISTS item_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_user_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  canonical_name text NOT NULL,
  alias_name text NOT NULL,
  store_name text,
  confirmed boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_item_aliases_user_alias
  ON item_aliases(local_user_id, lower(alias_name));

CREATE INDEX IF NOT EXISTS idx_item_aliases_user_canonical
  ON item_aliases(local_user_id, lower(canonical_name));

ALTER TABLE item_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read item_aliases" ON item_aliases;
CREATE POLICY "Public read item_aliases" ON item_aliases FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Public insert item_aliases" ON item_aliases;
CREATE POLICY "Public insert item_aliases" ON item_aliases FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "Public update item_aliases" ON item_aliases;
CREATE POLICY "Public update item_aliases" ON item_aliases FOR UPDATE TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public delete item_aliases" ON item_aliases;
CREATE POLICY "Public delete item_aliases" ON item_aliases FOR DELETE TO public USING (true);

-- Item prices: tracks per-item prices from receipts over time
CREATE TABLE IF NOT EXISTS item_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_user_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  store_name text,
  price numeric(12,2) NOT NULL,
  quantity numeric(10,2) DEFAULT 1,
  unit_price numeric(12,2),
  purchase_date date,
  purchase_record_id uuid REFERENCES purchase_records(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_item_prices_user_item
  ON item_prices(local_user_id, lower(item_name));

CREATE INDEX IF NOT EXISTS idx_item_prices_user_date
  ON item_prices(local_user_id, purchase_date);

ALTER TABLE item_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read item_prices" ON item_prices;
CREATE POLICY "Public read item_prices" ON item_prices FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Public insert item_prices" ON item_prices;
CREATE POLICY "Public insert item_prices" ON item_prices FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "Public update item_prices" ON item_prices;
CREATE POLICY "Public update item_prices" ON item_prices FOR UPDATE TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public delete item_prices" ON item_prices;
CREATE POLICY "Public delete item_prices" ON item_prices FOR DELETE TO public USING (true);
