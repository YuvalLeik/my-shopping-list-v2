"use client";

import { useState, useEffect } from "react";
import { GroceryList, GroceryItem } from "../types";
import { getCheapestStoreComparison, getSpendingHistory, StoreComparison } from "@/lib/price-memory-local";
import { formatDate } from "../lib/date-utils";
import { supabase } from "@/lib/supabase";
import { getUserIdSync } from "@/lib/database";
import ViewListModal from "./ViewListModal";

interface DashboardProps {
  completedLists: GroceryList[];
  currentItems: GroceryItem[];
  onDeleteList: (list: GroceryList) => void;
}

interface CheapersalPrice {
  chain: string;
  branch: string;
  price: number;
}

interface CheapersalResult {
  name: string;
  prices: CheapersalPrice[];
}

type DashboardTab = "history" | "prices" | "chart" | "realtime";

export default function Dashboard({
  completedLists,
  currentItems,
  onDeleteList,
}: DashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>("history");
  const [storeComparisons, setStoreComparisons] = useState<StoreComparison[]>([]);
  const [spendingHistory, setSpendingHistory] = useState<
    { date: string; total: number }[]
  >([]);
  const [viewingList, setViewingList] = useState<GroceryList | null>(null);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [realtimeResults, setRealtimeResults] = useState<Record<string, CheapersalResult>>({});
  const [realtimeLoading, setRealtimeLoading] = useState(false);
  const [realtimeError, setRealtimeError] = useState<string | null>(null);
  const [knownBarcodes, setKnownBarcodes] = useState<{ barcode: string; item_name: string }[]>([]);

  useEffect(() => {
    if (activeTab === "prices" && currentItems.length > 0) {
      setLoadingPrices(true);
      const names = currentItems.map((i) => i.name);
      getCheapestStoreComparison(names)
        .then(setStoreComparisons)
        .finally(() => setLoadingPrices(false));
    }
  }, [activeTab, currentItems]);

  useEffect(() => {
    if (activeTab === "chart") {
      getSpendingHistory().then(setSpendingHistory);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "realtime") {
      const userId = getUserIdSync();
      if (!userId) return;
      const normalizedNames = currentItems.map((i) =>
        i.name.toLowerCase().trim().replace(/\s+/g, " ")
      );
      supabase
        .from("product_barcodes")
        .select("barcode, item_name, normalized_name")
        .in("normalized_name", normalizedNames.length > 0 ? normalizedNames : ["__none__"])
        .then(({ data }) => {
          const barcodes = data || [];
          setKnownBarcodes(barcodes);
          if (barcodes.length === 0) {
            setRealtimeResults({});
            return;
          }
          setRealtimeLoading(true);
          setRealtimeError(null);
          fetch("/api/cheapersal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "compare_prices",
              barcodes: barcodes.map((b) => b.barcode),
            }),
          })
            .then((res) => {
              if (!res.ok) throw new Error("Cheapersal API failed");
              return res.json();
            })
            .then((data) => setRealtimeResults(data.results || {}))
            .catch((err) => setRealtimeError(err.message))
            .finally(() => setRealtimeLoading(false));
        });
    }
  }, [activeTab, currentItems]);

  const maxSpend = spendingHistory.reduce(
    (max, d) => Math.max(max, d.total),
    0
  );

  const tabs: { id: DashboardTab; label: string }[] = [
    { id: "history", label: "היסטוריה" },
    { id: "prices", label: "מחירים שלי" },
    { id: "realtime", label: "מחירי שוק" },
    { id: "chart", label: "גרף הוצאות" },
  ];

  return (
    <div>
      {/* Tab bar */}
      <div className="mb-4 flex gap-1 rounded-xl border border-gray-200 bg-white/95 p-1 shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-lg py-2 text-xs sm:text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-blue-600 text-white"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* History tab */}
      {activeTab === "history" && (
        <div className="rounded-xl border border-gray-200 bg-white/95 p-3 sm:p-4 shadow-lg">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">
            רשימות קודמות ({completedLists.length})
          </h3>
          {completedLists.length === 0 ? (
            <p className="text-sm text-gray-400">אין רשימות שהושלמו עדיין</p>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {[...completedLists]
                .sort((a, b) => {
                  const aTime = a.completedAt || "";
                  const bTime = b.completedAt || "";
                  return bTime > aTime ? 1 : -1;
                })
                .map((list, index) => (
                  <div
                    key={`${list.date}-${list.completedAt || index}`}
                    className="group rounded-lg border border-gray-200 bg-gray-50 p-3 transition-colors hover:bg-gray-100"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900 truncate">
                          {formatDate(list.date)}
                        </div>
                        <div className="mt-0.5 text-xs text-gray-500 flex items-center gap-2">
                          <span>{list.items.length} פריטים</span>
                          {list.total_cost != null && list.total_cost > 0 && (
                            <span className="font-medium text-green-700">
                              {list.total_cost.toFixed(2)}₪
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => setViewingList(list)}
                          className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                        >
                          צפה
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm("האם אתה בטוח שברצונך למחוק רשימה זו?")) {
                              onDeleteList(list);
                            }
                          }}
                          className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          מחק
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Price comparison tab */}
      {activeTab === "prices" && (
        <div className="rounded-xl border border-gray-200 bg-white/95 p-3 sm:p-4 shadow-lg">
          <h3 className="mb-1 text-sm font-semibold text-gray-700">
            החנות הזולה ביותר לרשימה שלך
          </h3>
          <p className="mb-4 text-xs text-gray-400">
            מבוסס על מחירים שהוזנו בעבר
          </p>
          {loadingPrices ? (
            <div className="py-6 text-center text-sm text-gray-400">טוען...</div>
          ) : storeComparisons.length === 0 ? (
            <div className="py-8 text-center">
              <div className="mb-2 text-3xl">🏪</div>
              <p className="text-sm text-gray-500">
                אין מחירים שמורים עדיין.
              </p>
              <p className="mt-1 text-xs text-gray-400">
                הוסף מחירים לאחר הקניות כדי לראות השוואה.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {storeComparisons.map((store, index) => (
                <div
                  key={store.vendor_name}
                  className={`rounded-xl border p-3 ${
                    index === 0
                      ? "border-green-200 bg-green-50"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {index === 0 && (
                        <span className="text-xs font-bold bg-green-600 text-white px-2 py-0.5 rounded-full">
                          הכי זול
                        </span>
                      )}
                      <span className="font-semibold text-sm text-gray-900">
                        {store.vendor_name}
                      </span>
                    </div>
                    <span
                      className={`text-base font-bold ${
                        index === 0 ? "text-green-700" : "text-gray-700"
                      }`}
                    >
                      {store.total.toFixed(2)}₪
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {store.itemCount} מתוך {currentItems.length} פריטים ידועים
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {store.items.slice(0, 5).map((item) => (
                      <span
                        key={item.name}
                        className="inline-block rounded bg-white border border-gray-200 px-2 py-0.5 text-xs text-gray-600"
                      >
                        {item.name}: {item.price.toFixed(2)}₪
                      </span>
                    ))}
                    {store.items.length > 5 && (
                      <span className="text-xs text-gray-400">
                        +{store.items.length - 5} עוד
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Spending chart tab */}
      {activeTab === "chart" && (
        <div className="rounded-xl border border-gray-200 bg-white/95 p-3 sm:p-4 shadow-lg">
          <h3 className="mb-4 text-sm font-semibold text-gray-700">
            הוצאות לאורך זמן
          </h3>
          {spendingHistory.length === 0 ? (
            <div className="py-8 text-center">
              <div className="mb-2 text-3xl">📊</div>
              <p className="text-sm text-gray-500">
                אין נתוני הוצאות עדיין.
              </p>
              <p className="mt-1 text-xs text-gray-400">
                הוסף מחירים לרשימות שלך כדי לראות גרף.
              </p>
            </div>
          ) : (
            <>
              {/* SVG Bar Chart */}
              <div className="overflow-x-auto">
                <svg
                  viewBox={`0 0 ${Math.max(300, spendingHistory.length * 50)} 160`}
                  className="w-full min-w-[300px]"
                  style={{ minHeight: 160 }}
                >
                  {/* Grid lines */}
                  {[0.25, 0.5, 0.75, 1].map((ratio) => (
                    <g key={ratio}>
                      <line
                        x1="40"
                        y1={120 - ratio * 100}
                        x2={Math.max(300, spendingHistory.length * 50)}
                        y2={120 - ratio * 100}
                        stroke="#e5e7eb"
                        strokeWidth="1"
                        strokeDasharray="4,4"
                      />
                      <text
                        x="35"
                        y={124 - ratio * 100}
                        textAnchor="end"
                        fontSize="9"
                        fill="#9ca3af"
                      >
                        {Math.round((maxSpend * ratio)).toLocaleString()}₪
                      </text>
                    </g>
                  ))}
                  {/* Bars */}
                  {spendingHistory.map((d, i) => {
                    const barH = maxSpend > 0 ? (d.total / maxSpend) * 100 : 0;
                    const x = 50 + i * 50;
                    const shortDate = d.date.slice(5); // MM-DD
                    return (
                      <g key={d.date}>
                        <rect
                          x={x - 15}
                          y={120 - barH}
                          width={30}
                          height={barH}
                          rx={4}
                          fill="#3b82f6"
                          opacity={0.85}
                        />
                        <text
                          x={x}
                          y={118 - barH}
                          textAnchor="middle"
                          fontSize="8"
                          fill="#1d4ed8"
                        >
                          {d.total.toFixed(0)}₪
                        </text>
                        <text
                          x={x}
                          y={135}
                          textAnchor="middle"
                          fontSize="8"
                          fill="#6b7280"
                          transform={`rotate(-30, ${x}, 135)`}
                        >
                          {shortDate}
                        </text>
                      </g>
                    );
                  })}
                  {/* X axis */}
                  <line x1="40" y1="120" x2={Math.max(300, spendingHistory.length * 50)} y2="120" stroke="#d1d5db" strokeWidth="1" />
                </svg>
              </div>
              {/* Summary stats */}
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-blue-50 p-2 text-center">
                  <div className="text-lg font-bold text-blue-700">
                    {spendingHistory.length}
                  </div>
                  <div className="text-xs text-gray-500">קניות</div>
                </div>
                <div className="rounded-lg bg-green-50 p-2 text-center">
                  <div className="text-lg font-bold text-green-700">
                    {(spendingHistory.reduce((s, d) => s + d.total, 0) / spendingHistory.length).toFixed(0)}₪
                  </div>
                  <div className="text-xs text-gray-500">ממוצע לקנייה</div>
                </div>
                <div className="rounded-lg bg-purple-50 p-2 text-center">
                  <div className="text-lg font-bold text-purple-700">
                    {spendingHistory.reduce((s, d) => s + d.total, 0).toFixed(0)}₪
                  </div>
                  <div className="text-xs text-gray-500">סה״כ</div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Realtime market prices tab (Cheapersal) */}
      {activeTab === "realtime" && (
        <div className="rounded-xl border border-gray-200 bg-white/95 p-3 sm:p-4 shadow-lg">
          <h3 className="mb-1 text-sm font-semibold text-gray-700">
            מחירי שוק בזמן אמת
          </h3>
          <p className="mb-4 text-xs text-gray-400">
            מחירים מ-Cheapersal (30+ רשתות). דורש ברקודים — מתמלאים אוטומטית מקבלות שסרקת.
          </p>

          {realtimeLoading ? (
            <div className="py-6 text-center text-sm text-gray-400">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600 mb-2" />
              <div>מחפש מחירים...</div>
            </div>
          ) : realtimeError ? (
            <div className="py-4 text-center text-sm text-red-500">{realtimeError}</div>
          ) : knownBarcodes.length === 0 ? (
            <div className="py-8 text-center">
              <div className="mb-2 text-3xl">🏷️</div>
              <p className="text-sm text-gray-500">
                אין ברקודים ידועים עדיין.
              </p>
              <p className="mt-1 text-xs text-gray-400">
                העלה קבלה דרך OCR — הברקודים יזוהו אוטומטית ויאפשרו השוואת מחירים בזמן אמת.
              </p>
            </div>
          ) : Object.keys(realtimeResults).length === 0 ? (
            <div className="py-8 text-center">
              <div className="mb-2 text-3xl">📊</div>
              <p className="text-sm text-gray-500">
                נמצאו {knownBarcodes.length} ברקודים, אך לא נמצאו מחירים.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(realtimeResults).map(([barcode, result]) => {
                const sortedPrices = [...result.prices].sort(
                  (a, b) => a.price - b.price
                );
                const cheapest = sortedPrices[0];
                return (
                  <div
                    key={barcode}
                    className="rounded-xl border border-gray-200 bg-gray-50 p-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm text-gray-900">
                        {result.name}
                      </span>
                      {cheapest && (
                        <span className="text-sm font-bold text-green-700">
                          מ-{cheapest.price.toFixed(2)}₪
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mb-1">
                      ברקוד: {barcode} · {sortedPrices.length} חנויות
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {sortedPrices.slice(0, 5).map((p, idx) => (
                        <span
                          key={idx}
                          className={`inline-block rounded px-2 py-0.5 text-xs border ${
                            idx === 0
                              ? "border-green-200 bg-green-50 text-green-800 font-medium"
                              : "border-gray-200 bg-white text-gray-600"
                          }`}
                        >
                          {p.chain}: {p.price.toFixed(2)}₪
                        </span>
                      ))}
                      {sortedPrices.length > 5 && (
                        <span className="text-xs text-gray-400">
                          +{sortedPrices.length - 5} עוד
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {viewingList && (
        <ViewListModal list={viewingList} onClose={() => setViewingList(null)} />
      )}
    </div>
  );
}
