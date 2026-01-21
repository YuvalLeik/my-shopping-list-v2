# הוראות הגדרה - Shopping List App

## 1. הרצת Migration ב-Supabase

1. פתח את Supabase Dashboard
2. לך ל-SQL Editor
3. העתק והדבק את התוכן של `supabase/migrations/20260115000000_shopping_lists_schema.sql`
4. לחץ על "Run" להרצת ה-SQL

או השתמש ב-Supabase CLI:
```bash
supabase db push
```

## 2. יצירת Storage Bucket

1. לך ל-Supabase Dashboard > Storage
2. לחץ על "New bucket"
3. שם: `item-images`
4. Public bucket: כן (לאפשר גישה ציבורית)
5. File size limit: 5MB (או לפי הצורך)
6. Allowed MIME types: image/*

## 3. הערות חשובות

**הערה:** תמיכה בתמונות הוסרה מהאפליקציה. אם הרצת migration של `image_url` ב-Supabase, תוכל להריץ את `20260119000005_remove_image_url_from_grocery_items.sql` כדי להסיר את העמודה מהטבלה.

## 4. בדיקת משתני סביבה

ודא ש-`.env.local` מכיל:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

## 5. הרצת האפליקציה

```bash
npm run dev
```

## פתרון בעיות

אם אתה רואה שגיאה "Could not find the table":
1. ודא שהרצת את ה-migration ב-Supabase
2. בדוק שהטבלאות קיימות ב-Supabase Dashboard > Table Editor
3. ודא שמשתני הסביבה נכונים
