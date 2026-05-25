"use client";

import { GroceryList } from "../types";
import { formatDate } from "../lib/date-utils";

interface HistoricalListsProps {
  completedLists: GroceryList[];
  onSelectList: (list: GroceryList) => void;
  onDeleteList: (list: GroceryList) => void;
}

export default function HistoricalLists({
  completedLists,
  onSelectList,
  onDeleteList,
}: HistoricalListsProps) {

  if (completedLists.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white/95 backdrop-blur-sm p-3 sm:p-4 shadow-lg">
        <h3 className="mb-2 text-xs sm:text-sm font-semibold text-gray-700">
          רשימות קודמות
        </h3>
        <p className="text-xs text-gray-500">אין רשימות שהושלמו</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white/95 backdrop-blur-sm p-3 sm:p-4 shadow-lg">
      <h3 className="mb-2 sm:mb-3 text-xs sm:text-sm font-semibold text-gray-700">
        רשימות קודמות ({completedLists.length})
      </h3>
      <div className="space-y-2 max-h-64 sm:max-h-96 overflow-y-auto">
        {completedLists
          .sort((a, b) => {
            // Sort by date first, then by completedAt if dates are equal
            if (a.date !== b.date) {
              return b.date > a.date ? 1 : -1;
            }
            const aTime = a.completedAt || '';
            const bTime = b.completedAt || '';
            return bTime > aTime ? 1 : -1;
          })
          .map((list, index) => (
            <div
              key={`${list.date}-${list.completedAt || index}`}
              className="group rounded-lg border border-gray-200 bg-gray-50 p-2 sm:p-3 transition-colors hover:bg-gray-100"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-xs sm:text-sm text-gray-900 truncate">
                    {formatDate(list.date)}
                  </div>
                  <div className="mt-0.5 sm:mt-1 text-xs text-gray-500 flex items-center gap-2">
                    <span>{list.items.length} פריטים</span>
                    {list.total_cost != null && list.total_cost > 0 && (
                      <span className="font-medium text-green-700">
                        {list.total_cost.toFixed(2)}₪
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 flex-shrink-0">
                  <button
                    onClick={() => onSelectList(list)}
                    className="rounded px-2 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50"
                    title="צפה ברשימה"
                  >
                    צפה
                  </button>
                  <button
                    onClick={() => {
                      if (
                        window.confirm(
                          "האם אתה בטוח שברצונך למחוק רשימה זו?"
                        )
                      ) {
                        onDeleteList(list);
                      }
                    }}
                    className="rounded px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                    title="מחק רשימה"
                  >
                    מחק
                  </button>
                </div>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
