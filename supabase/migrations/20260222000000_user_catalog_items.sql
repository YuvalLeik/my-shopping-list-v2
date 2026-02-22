-- User catalog items: manually-added personal items (from Settings page)
CREATE TABLE IF NOT EXISTS user_catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_user_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
  name text NOT NULL,
  image_url text,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_catalog_user_name
  ON user_catalog_items(local_user_id, lower(name));

ALTER TABLE user_catalog_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read user_catalog_items" ON user_catalog_items;
CREATE POLICY "Public read user_catalog_items" ON user_catalog_items FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Public insert user_catalog_items" ON user_catalog_items;
CREATE POLICY "Public insert user_catalog_items" ON user_catalog_items FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "Public update user_catalog_items" ON user_catalog_items;
CREATE POLICY "Public update user_catalog_items" ON user_catalog_items FOR UPDATE TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public delete user_catalog_items" ON user_catalog_items;
CREATE POLICY "Public delete user_catalog_items" ON user_catalog_items FOR DELETE TO public USING (true);

GRANT ALL ON public.user_catalog_items TO anon;
GRANT ALL ON public.user_catalog_items TO authenticated;
GRANT ALL ON public.user_catalog_items TO service_role;
