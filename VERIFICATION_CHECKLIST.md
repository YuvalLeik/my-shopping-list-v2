# Verification Checklist - Shopping List App

## ✅ Current Status

**Build Status:** ✅ PASSING
- TypeScript: ✅ No errors
- ESLint: ✅ No errors
- Next.js Build: ✅ Successful

**Git Status:** ⚠️ Uncommitted changes detected

---

## 1. Supabase Verification

### Step 1: Check Database Tables Exist

1. Open **Supabase Dashboard** → **Table Editor**
2. Verify these tables exist:
   - ✅ `local_users`
   - ✅ `grocery_lists`
   - ✅ `grocery_items`

### Step 2: Run Migration (if tables don't exist)

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Copy the content from `supabase/migrations/20260114105200_initial_schema.sql`
3. Paste and click **Run**
4. Verify no errors

### Step 3: Test Database Connection

1. Check `.env.local` file exists with:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   ```

2. Test connection:
   ```bash
   npm run dev
   ```
   - Open browser to `http://localhost:3000`
   - Check browser console for errors
   - App should load without "Failed to fetch" errors

### Step 4: Add Test Data (Optional)

In Supabase SQL Editor, run:
```sql
-- Add a test user
INSERT INTO local_users (name) VALUES ('Test User');

-- Get the user ID (copy it)
SELECT id, name FROM local_users;

-- Add a test list (replace USER_ID with actual ID)
INSERT INTO grocery_lists (local_user_id, title) 
VALUES ('USER_ID', 'Test List');

-- Add a test item (replace LIST_ID with actual ID)
INSERT INTO grocery_items (list_id, name, quantity) 
VALUES ('LIST_ID', 'Milk', 2);
```

---

## 2. Git Verification

### Step 1: Check Current Status

```bash
git status
```

**Expected:** You should see uncommitted changes (this is normal after rollback)

### Step 2: Review Changes

```bash
git diff
```

Review what files were changed to ensure rollback was correct.

### Step 3: Commit Current Working State (Recommended)

```bash
# Stage all changes
git add .

# Commit with descriptive message
git commit -m "Rollback to working version with grocery_lists and local_users"
```

### Step 4: Verify Git History

```bash
git log --oneline -5
```

Should show your commits in order.

---

## 3. Application Functionality Test

### Step 1: Start Development Server

```bash
npm run dev
```

### Step 2: Test User Selection

1. Open `http://localhost:3000`
2. Check sidebar loads
3. If no users exist, add one via Supabase Table Editor
4. Verify user appears in dropdown
5. Select a user

### Step 3: Test List Creation

1. Enter a list title
2. Click "Create"
3. Verify:
   - ✅ Toast notification appears
   - ✅ List appears in the list
   - ✅ List is automatically selected

### Step 4: Test Item Management

1. With a list selected:
   - Add an item (name + quantity)
   - Verify item appears
   - Delete an item
   - Verify item is removed

### Step 5: Test List Deletion

1. Click delete on a list
2. Verify:
   - ✅ List is removed
   - ✅ Items are removed (cascade)
   - ✅ Toast notification appears

### Step 6: Test Language Switching

1. Click language switcher
2. Verify:
   - ✅ UI switches to Hebrew/English
   - ✅ RTL/LTR layout changes
   - ✅ All text is translated

---

## 4. Code Quality Checks

### TypeScript

```bash
npx tsc --noEmit
```

**Expected:** No errors

### ESLint

```bash
npm run lint
```

**Expected:** No errors

### Build

```bash
npm run build
```

**Expected:** 
- ✅ Compiled successfully
- ✅ No TypeScript errors
- ✅ Static pages generated

---

## 5. Environment Variables Check

### Verify `.env.local` exists:

```bash
# Windows PowerShell
Test-Path .env.local

# Should return: True
```

### Verify variables are set:

```bash
# Check file contents (don't commit this!)
cat .env.local
```

**Required:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## 6. File Structure Verification

### Key Files Should Exist:

```
✅ app/page.tsx                    # Main page (using grocery_lists)
✅ lib/groceryLists.ts             # List functions
✅ lib/groceryItems.ts             # Item functions
✅ lib/localUsers.ts               # User functions
✅ lib/supabase.ts                 # Supabase client
✅ components/Sidebar.tsx          # Sidebar component
✅ supabase/migrations/20260114105200_initial_schema.sql  # DB schema
```

### Files That Should NOT Be Used (from new version):

```
❌ lib/db.ts                       # New version (not used)
❌ lib/supabaseClient.ts           # Duplicate (not used)
❌ app/components/AddItemForm.tsx  # New version (not used)
❌ app/components/ItemsList.tsx    # New version (not used)
❌ app/components/PreviousListsSidebar.tsx  # New version (not used)
```

---

## 7. Database Schema Verification

### Run this query in Supabase SQL Editor:

```sql
-- Check tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('local_users', 'grocery_lists', 'grocery_items');

-- Check indexes exist
SELECT indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
AND tablename IN ('grocery_lists', 'grocery_items');

-- Check foreign keys
SELECT
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
AND tc.table_schema = 'public';
```

**Expected Results:**
- ✅ 3 tables found
- ✅ 2 indexes found
- ✅ 2 foreign keys found

---

## 8. Quick Test Script

Run this to verify everything:

```bash
# 1. TypeScript check
npx tsc --noEmit && echo "✅ TypeScript OK"

# 2. Build check
npm run build && echo "✅ Build OK"

# 3. Lint check
npm run lint && echo "✅ Lint OK"

# 4. Git status
git status && echo "✅ Git OK"
```

---

## 9. Common Issues & Solutions

### Issue: "Failed to fetch users"
**Solution:** 
- Check Supabase tables exist
- Verify `.env.local` has correct credentials
- Check browser console for specific error

### Issue: "Table does not exist"
**Solution:**
- Run migration: `supabase/migrations/20260114105200_initial_schema.sql`
- Verify in Supabase Dashboard → Table Editor

### Issue: Build fails
**Solution:**
- Run `npm install` to ensure dependencies are installed
- Check TypeScript errors: `npx tsc --noEmit`
- Check for missing imports

### Issue: Git shows many untracked files
**Solution:**
- This is normal after rollback
- Review files before committing
- Consider adding to `.gitignore` if needed

---

## ✅ Final Verification Checklist

Before continuing development, verify:

- [ ] Supabase tables exist and are accessible
- [ ] `.env.local` is configured correctly
- [ ] `npm run dev` starts without errors
- [ ] App loads in browser
- [ ] Can create users (via Supabase or app)
- [ ] Can create lists
- [ ] Can add/delete items
- [ ] Language switching works
- [ ] `npm run build` passes
- [ ] TypeScript has no errors
- [ ] Git status is clean (or changes committed)
- [ ] All tests pass manually

---

## Next Steps After Verification

Once everything is verified:

1. **Commit current state:**
   ```bash
   git add .
   git commit -m "Working version verified - ready for development"
   ```

2. **Create a new branch for features:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Document any issues found** in this checklist

---

**Last Verified:** [Date]
**Status:** ✅ Ready for Development
