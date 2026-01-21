# הוראות להוספת שדה category לטבלת grocery_items

## בעיה
השדה `category` לא קיים בטבלת `grocery_items` במסד הנתונים, ולכן לא ניתן להוסיף פריטים עם קטגוריה.

## פתרון
יש להריץ migration script ב-Supabase SQL Editor.

## שלבים:

1. **פתח את Supabase Dashboard**
   - היכנס ל-[https://supabase.com/dashboard](https://supabase.com/dashboard)
   - בחר את הפרויקט שלך

2. **פתח את SQL Editor**
   - בתפריט הצד, לחץ על "SQL Editor"
   - לחץ על "New query"

3. **העתק והדבק את הקוד הבא:**

```sql
-- Add category column to grocery_items table
ALTER TABLE grocery_items 
ADD COLUMN IF NOT EXISTS category text DEFAULT 'ללא קטגוריה';

-- Create index for category for better query performance
CREATE INDEX IF NOT EXISTS idx_grocery_items_category ON grocery_items(category);

-- Create index for name and category together for faster lookups
CREATE INDEX IF NOT EXISTS idx_grocery_items_name_category ON grocery_items(name, category);
```

4. **הרץ את הקוד**
   - לחץ על כפתור "Run" (או Ctrl+Enter)
   - ודא שהקוד רץ בהצלחה ללא שגיאות

5. **בדוק שהשדה נוסף**
   - לך ל-"Table Editor"
   - בחר את הטבלה `grocery_items`
   - ודא שיש שדה `category` בטבלה

## לאחר הרצת ה-migration:
- תוכל להוסיף פריטים עם קטגוריה
- המערכת תזהה אוטומטית את הקטגוריה של פריטים קיימים
- תוכל לערוך את הקטגוריה ידנית

## הערות:
- השדה `category` הוא אופציונלי (nullable)
- ברירת המחדל היא 'ללא קטגוריה'
- כל הפריטים הקיימים יקבלו את הערך 'ללא קטגוריה' אם לא צוין אחרת
