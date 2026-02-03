# Apply total_cost migration (fix "column not in schema cache" error)

If you see **"Could not find the 'total_cost' column of 'grocery_lists' in the schema cache"**, the migration that adds this column has not been run on your Supabase project.

## Steps (Supabase Dashboard)

1. Open the [Supabase Dashboard](https://supabase.com/dashboard) and select the project your app uses.
2. Go to **SQL Editor**.
3. Paste and run this SQL:

```sql
-- Add total_cost column to grocery_lists for optional cost of completed list
ALTER TABLE grocery_lists
ADD COLUMN IF NOT EXISTS total_cost numeric(12,2) DEFAULT NULL;
```

4. Click **Run**. After it succeeds, add/edit cost on completed lists should work.

## Alternative (Supabase CLI)

If you use the Supabase CLI and have linked your project:

```bash
supabase db push
```

This applies all pending migrations in `supabase/migrations/`, including the one above.
