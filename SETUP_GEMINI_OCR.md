# Setup: Gemini OCR for receipts

The receipt OCR feature uses Google's Gemini API. You need a free API key.

## 1. Get a free Gemini API key

1. Go to https://aistudio.google.com/apikey
2. Sign in with your Google account
3. Click **Create API key** → choose any project (or "create new project")
4. Copy the key (looks like `AIzaSy...`)

Free tier limit: ~1500 requests/day on Gemini 2.0 Flash. More than enough for receipts.

## 2. Add the key to Vercel

1. Open your Vercel project: https://vercel.com/dashboard → `my-shopping-list-v2`
2. **Settings** → **Environment Variables**
3. Click **Add New**:
   - **Name**: `GEMINI_API_KEY`
   - **Value**: paste your key
   - **Environments**: check all three (Production, Preview, Development)
4. Click **Save**
5. Go to **Deployments** → click the latest one → **⋯** → **Redeploy** (so the new env var is loaded)

## 3. Add the key to local dev (optional)

If you want OCR to work in `npm run dev`, add to `.env.local`:

```
GEMINI_API_KEY=AIzaSy...your-key-here...
```

Then restart `npm run dev`.

## 4. Run the SQL migration

In Supabase SQL Editor, run `MIGRATION_PRICES_NO_AUTH.sql`. This creates the `receipts`, `receipt_lines`, and `price_memories` tables and adds price columns to `grocery_items` and `grocery_lists`.

## How it works

1. You photograph or upload a receipt image (JPG/PNG, up to 8MB)
2. The image is sent to `/api/receipts/process` along with your local user ID
3. The server calls Gemini 2.0 Flash with a Hebrew-aware prompt that extracts:
   - vendor name (store)
   - per-item: name, quantity, unit price, line total
   - total
4. Extracted items are fuzzy-matched to your current list items
5. You review the matches, fix any mismatches, then apply
6. Applied prices: update `grocery_items` (unit_price, line_total, vendor_name), save to `price_memories` for future suggestions, update `grocery_lists.total_cost`

The raw photo, OCR text, and structured JSON are saved in the `receipts` table — you can re-process or audit later.
