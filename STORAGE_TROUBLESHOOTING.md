# פתרון בעיות Storage - מדריך מפורט

## בעיה: "new row violates row-level security policy"

אם אתה מקבל שגיאה זו, בצע את השלבים הבאים **בסדר**:

### שלב 1: בדוק שה-bucket קיים

1. לך ל-Supabase Dashboard > Storage
2. ודא שיש bucket בשם `item-images`
3. אם אין, צור אותו:
   - לחץ על "New bucket"
   - שם: `item-images`
   - **Public bucket: כן** (חשוב מאוד!)
   - File size limit: 5MB
   - Allowed MIME types: `image/*`
   - לחץ "Create bucket"

### שלב 2: בדוק את ה-bucket ID (חובה!)

1. לך ל-Supabase Dashboard > SQL Editor
2. הרץ את השאילתה הבאה:
   ```sql
   SELECT id, name, public FROM storage.buckets WHERE name = 'item-images';
   ```
3. **העתק את ה-ID (UUID)** שמופיע בעמודה `id` - תצטרך אותו בשלב הבא!
4. אם אין תוצאות, זה אומר שה-bucket לא קיים - חזור לשלב 1 וצור אותו

### שלב 3: בדוק את המדיניות הקיימת

1. לך ל-Supabase Dashboard > Storage > Policies
2. בדוק אם יש policies עבור `item-images`
3. אם יש, מחק אותן (לחץ על X ליד כל policy)

### שלב 4: הרץ את ה-migration (הגישה הפשוטה)

**אם קיבלת שגיאה "must be owner of table buckets", השתמש בגישה הזו:**

1. לך ל-Supabase Dashboard > SQL Editor
2. פתח את הקובץ `supabase/migrations/20260119000004_final_storage_policies.sql`
3. **החלף את `YOUR_BUCKET_ID_HERE` ב-ID שהעתקת בשלב 2** (החלף בכל המקומות - יש 4)
4. העתק והדבק את התוכן המעודכן
5. לחץ על "Run"

### שלב 5: אם עדיין לא עובד - נסה גישה ישירה

אם עדיין לא עובד, נסה את זה (החלף `YOUR_BUCKET_ID` ב-ID מהשלב 2):

```sql
-- Drop all existing policies
DROP POLICY IF EXISTS "Public Access for item-images" ON storage.objects;
DROP POLICY IF EXISTS "Public Upload for item-images" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete for item-images" ON storage.objects;
DROP POLICY IF EXISTS "Public Update for item-images" ON storage.objects;

-- Allow public to see bucket
DROP POLICY IF EXISTS "Public can see item-images bucket" ON storage.buckets;
CREATE POLICY "Public can see item-images bucket"
ON storage.buckets
FOR SELECT
TO public
USING (true);

-- Simple policies using bucket_id directly
CREATE POLICY "Public Access for item-images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'YOUR_BUCKET_ID');

CREATE POLICY "Public Upload for item-images"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (bucket_id = 'YOUR_BUCKET_ID');

CREATE POLICY "Public Update for item-images"
ON storage.objects
FOR UPDATE
TO public
USING (bucket_id = 'YOUR_BUCKET_ID')
WITH CHECK (bucket_id = 'YOUR_BUCKET_ID');

CREATE POLICY "Public Delete for item-images"
ON storage.objects
FOR DELETE
TO public
USING (bucket_id = 'YOUR_BUCKET_ID');
```

### שלב 6: בדוק שהכל עובד

1. נסה להעלות תמונה באפליקציה
2. אם עדיין לא עובד, בדוק:
   - שהבucket הוא Public (ב-Storage > Settings)
   - שהמדיניות מופיעה ב-Storage > Policies
   - שאין שגיאות ב-Supabase Dashboard > Logs

## טיפים נוספים

- אם אתה משתמש ב-Supabase CLI, הרץ `supabase db push` כדי להריץ את כל ה-migrations
- לפעמים צריך לרענן את הדפדפן אחרי שינוי מדיניות
- ודא שמשתני הסביבה נכונים ב-`.env.local`
