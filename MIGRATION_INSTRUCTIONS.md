# הוראות להרצת Migration

## בעיה
השדה `completed_at` לא קיים במסד הנתונים, ולכן רשימות לא מועברות ל"רשימות קודמות".

## פתרון
יש להריץ את ה-migration הבא ב-Supabase Dashboard:

### שלבים:

1. **פתח את Supabase Dashboard**
   - לך ל: https://supabase.com/dashboard
   - בחר את הפרויקט שלך

2. **פתח את SQL Editor**
   - בתפריט השמאלי, לחץ על "SQL Editor"
   - או לך ישירות ל: `https://supabase.com/dashboard/project/[YOUR_PROJECT_ID]/sql/new`

3. **העתק והדבק את הקוד הבא:**

```sql
-- Add completed_at column to grocery_lists table
ALTER TABLE grocery_lists 
ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;

-- Create index for completed_at for better query performance
CREATE INDEX IF NOT EXISTS idx_grocery_lists_completed_at ON grocery_lists(completed_at);
```

4. **הרץ את הקוד**
   - לחץ על כפתור "Run" (או Ctrl+Enter)
   - ודא שהקוד רץ בהצלחה (אמור לראות "Success")

5. **בדוק שהכל עובד**
   - חזור לאפליקציה
   - נסה לסמן רשימה כהושלמה
   - הרשימה אמורה להופיע ב"רשימות קודמות"

## הערות
- אם אתה רואה שגיאה "column already exists" - זה בסדר, זה אומר שהשדה כבר קיים
- אם אתה רואה שגיאה אחרת, שלח אותה ואני אעזור לך לתקן
