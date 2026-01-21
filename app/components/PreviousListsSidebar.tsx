'use client';

import { useEffect, useState } from 'react';
import { Loader2, Calendar } from 'lucide-react';
import { getLists, ShoppingListWithItemCount, formatDateDisplay } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface PreviousListsSidebarProps {
  selectedListId: string | null;
  onListSelect: (listId: string) => void;
}

export function PreviousListsSidebar({ selectedListId, onListSelect }: PreviousListsSidebarProps) {
  const [lists, setLists] = useState<ShoppingListWithItemCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadLists() {
      try {
        setLoading(true);
        setError(null);
        const loadedLists = await getLists();
        setLists(loadedLists);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'שגיאה בטעינת הרשימות';
        setError(errorMessage);
        console.error('Failed to load lists:', err);
      } finally {
        setLoading(false);
      }
    }
    loadLists();
  }, []);

  const getItemText = (count: number): string => {
    return count === 1 ? 'פריט' : 'פריטים';
  };

  return (
    <aside className="w-64 bg-white border-l border-slate-200 h-screen sticky top-0 overflow-y-auto">
      <div className="p-4">
        <h2 className="text-lg font-semibold mb-4 text-slate-900">
          רשימות קודמות ({lists.length})
        </h2>
        {loading ? (
          <div className="flex items-center gap-2 text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">טוען...</span>
          </div>
        ) : error ? (
          <div className="space-y-2">
            <p className="text-sm text-red-600 font-medium">{error}</p>
            <p className="text-xs text-slate-500">
              ודא שהרצת את ה-migration ב-Supabase. ראה SETUP.md להוראות.
            </p>
          </div>
        ) : lists.length === 0 ? (
          <p className="text-sm text-slate-500">אין רשימות קודמות</p>
        ) : (
          <div className="space-y-2">
            {lists.map((list) => (
              <Card
                key={list.id}
                className={`cursor-pointer transition-colors ${
                  selectedListId === list.id
                    ? 'bg-blue-50 border-blue-300'
                    : 'bg-white hover:bg-slate-50'
                }`}
                onClick={() => onListSelect(list.id)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar className="h-4 w-4 text-slate-500" />
                    <span className="text-sm font-medium text-slate-900">
                      {formatDateDisplay(list.list_date)}
                    </span>
                  </div>
                  <span className="text-xs text-slate-600">
                    {list.item_count} {getItemText(list.item_count)}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
