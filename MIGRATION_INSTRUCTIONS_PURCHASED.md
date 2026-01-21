# הוראות להוספת שדה purchased לטבלת grocery_items

## בעיה
השדה `purchased` לא קיים בטבלת `grocery_items` במסד הנתונים, ולכן לא ניתן לסמן פריטים כנלקחו בקניות.

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
-- Add purchased column to grocery_items table
ALTER TABLE grocery_items 
ADD COLUMN IF NOT EXISTS purchased boolean DEFAULT false;

-- Create index for purchased for better query performance
CREATE INDEX IF NOT EXISTS idx_grocery_items_purchased ON grocery_items(purchased);
```

4. **הרץ את הקוד**
   - לחץ על כפתור "Run" (או Ctrl+Enter)
   - ודא שהקוד רץ בהצלחה ללא שגיאות

5. **בדוק שהשדה נוסף**
   - לך ל-"Table Editor"
   - בחר את הטבלה `grocery_items`
   - ודא שיש שדה `purchased` בטבלה

## לאחר הרצת ה-migration:
- תוכל לסמן פריטים כנלקחו בקניות
- פריטים שנלקחו יועברו למטה תחת "פריטים שנאספו"
- תוכל לבטל את הסימון ולהחזיר פריטים למעלה

## הערות:
- השדה `purchased` הוא boolean (true/false)
- ברירת המחדל היא `false` (לא נלקח)
- כל הפריטים הקיימים יקבלו את הערך `false` אם לא צוין אחרת
