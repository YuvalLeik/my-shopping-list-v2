'use client';

import { useEffect, useState } from 'react';
import { Loader2, ShoppingCart, ListChecks, TrendingUp, DollarSign, Store, Tag, ChevronDown, ChevronUp } from 'lucide-react';
import { useTheme } from 'next-themes';
import {
  getLightDashboardStats, LightDashboardStats,
  getTopItemsBySpending, SpendingItem,
  getMonthlySpendingStats, MonthlySpendingPoint,
  getStoreComparisonByBasket, StoreBasketComparison,
  getDailyPriceRecommendation, StoreRecommendation, DailyPriceRecommendationResult,
} from '@/lib/analytics';
import { t } from '@/lib/translations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
} from 'recharts';

interface DashboardProps {
  userId: string | null;
}

const CHART_COLORS = {
  primary: '#6366f1',
  secondary: '#10b981',
  accent: '#f59e0b',
  info: '#3b82f6',
};

const BAR_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#a855f7',
  '#3b82f6', '#ec4899', '#14b8a6', '#84cc16', '#f97316',
];

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color?: string;
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
        <p className="font-medium text-slate-900 dark:text-slate-100 mb-1">{label}</p>
        {payload.map((entry: TooltipPayloadEntry, index: number) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export function Dashboard({ userId }: DashboardProps) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<LightDashboardStats | null>(null);
  const [storeBaskets, setStoreBaskets] = useState<StoreBasketComparison[]>([]);
  const [topBySpending, setTopBySpending] = useState<SpendingItem[]>([]);
  const [monthlySpending, setMonthlySpending] = useState<MonthlySpendingPoint[]>([]);
  const [marketRec, setMarketRec] = useState<DailyPriceRecommendationResult | null>(null);
  const [expandedChain, setExpandedChain] = useState<string | null>(null);

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const chartTickPrimary = isDark ? '#e2e8f0' : '#374151';
  const chartTickSecondary = isDark ? '#94a3b8' : '#64748b';
  const chartAxisLine = isDark ? '#334155' : '#cbd5e1';
  const chartGridStroke = isDark ? '#334155' : '#e2e8f0';

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function loadStats() {
      setLoading(true);
      try {
        const [kpis, baskets, topSpend, monthSpend, market] = await Promise.all([
          getLightDashboardStats(userId!),
          getStoreComparisonByBasket(userId!),
          getTopItemsBySpending(userId!, 10),
          getMonthlySpendingStats(userId!),
          getDailyPriceRecommendation(userId!),
        ]);
        if (cancelled) return;
        setStats(kpis);
        setStoreBaskets(baskets);
        setTopBySpending(topSpend);
        setMonthlySpending(monthSpend);
        setMarketRec(market);
      } catch (error) {
        console.error('Failed to load dashboard stats:', error);
        if (!cancelled) {
          setStats({ totalPurchasedItems: 0, totalCompletedLists: 0, avgItemsPerList: 0, totalSpending: 0 });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadStats();
    return () => { cancelled = true; };
  }, [userId]);

  if (!userId) {
    return (
      <div className="p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
          <ShoppingCart className="h-8 w-8 text-slate-400" />
        </div>
        <p className="text-slate-600 dark:text-slate-400">{t.dashboardLoginRequired}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400" />
        <span className="text-slate-600 dark:text-slate-400">{t.dashboardLoading}</span>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-8 text-center text-slate-600 dark:text-slate-400">
        {t.dashboardNoData}
      </div>
    );
  }

  const hasAnyData = stats.totalPurchasedItems > 0 || storeBaskets.length > 0 || topBySpending.length > 0 || monthlySpending.length > 0;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-900/30 dark:to-emerald-800/20 border-emerald-200/50 dark:border-emerald-700/50 shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-emerald-700 dark:text-emerald-300 mb-1">
                  {t.totalPurchasedItems}
                </p>
                <p className="text-2xl sm:text-3xl font-bold text-emerald-900 dark:text-emerald-100">
                  {stats.totalPurchasedItems.toLocaleString()}
                </p>
              </div>
              <div className="p-2 sm:p-3 bg-emerald-500/10 rounded-full">
                <ShoppingCart className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/30 dark:to-blue-800/20 border-blue-200/50 dark:border-blue-700/50 shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">
                  {t.totalCompletedLists}
                </p>
                <p className="text-2xl sm:text-3xl font-bold text-blue-900 dark:text-blue-100">
                  {stats.totalCompletedLists.toLocaleString()}
                </p>
              </div>
              <div className="p-2 sm:p-3 bg-blue-500/10 rounded-full">
                <ListChecks className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-900/30 dark:to-purple-800/20 border-purple-200/50 dark:border-purple-700/50 shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-purple-700 dark:text-purple-300 mb-1">
                  {t.avgItemsPerList}
                </p>
                <p className="text-2xl sm:text-3xl font-bold text-purple-900 dark:text-purple-100">
                  {stats.avgItemsPerList}
                </p>
              </div>
              <div className="p-2 sm:p-3 bg-purple-500/10 rounded-full">
                <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-900/30 dark:to-amber-800/20 border-amber-200/50 dark:border-amber-700/50 shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-amber-700 dark:text-amber-300 mb-1">
                  {t.totalSpending}
                </p>
                <p className="text-2xl sm:text-3xl font-bold text-amber-900 dark:text-amber-100">
                  ₪{stats.totalSpending.toLocaleString()}
                </p>
              </div>
              <div className="p-2 sm:p-3 bg-amber-500/10 rounded-full">
                <DollarSign className="h-5 w-5 sm:h-6 sm:w-6 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Where to shop today? — Market price recommendation */}
      {marketRec && marketRec.recommendations.length > 0 && (
        <Card className="shadow-sm hover:shadow-md transition-shadow border-emerald-300 dark:border-emerald-700 bg-gradient-to-br from-emerald-50/60 to-white dark:from-emerald-900/20 dark:to-slate-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Store className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              {t.whereToShopToday}
            </CardTitle>
            {marketRec.fetchedAt && (
              <p className="text-xs text-slate-400 mt-1">
                {t.lastUpdated}: {new Date(marketRec.fetchedAt).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
            {marketRec.coveredItems > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                כיסוי נתונים: {marketRec.coveredItems} פריטים ב-{marketRec.storeCount} רשתות
              </p>
            )}
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {marketRec.recommendations.map((rec: StoreRecommendation, index: number) => {
              const isCheapest = index === 0;
              const isExpanded = expandedChain === rec.chainName;
              return (
                <div
                  key={rec.chainName}
                  className={`rounded-lg border p-3 transition-colors ${isCheapest
                    ? 'border-emerald-400 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-900/30'
                    : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-500 w-5 text-center">{index + 1}</span>
                    <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-200">
                      {rec.chainName}
                    </span>
                    {isCheapest && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500 text-white">
                        {t.cheapestChain}
                      </span>
                    )}
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      ₪{rec.totalBasketCost.toFixed(0)}
                    </span>
                    <button
                      onClick={() => setExpandedChain(isExpanded ? null : rec.chainName)}
                      className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mr-7">{t.marketItemCount(rec.itemCount)}</p>

                  {isExpanded && (
                    <div className="mt-2 mr-7 space-y-1 border-t border-slate-200 dark:border-slate-700 pt-2">
                      {rec.items.map((item) => (
                        <div key={item.itemName} className="flex items-center text-xs gap-1.5">
                          <span className="flex-1 text-slate-600 dark:text-slate-400">{item.itemName}</span>
                          {item.promoPrice != null ? (
                            <>
                              <span className="line-through text-slate-400">₪{item.price.toFixed(2)}</span>
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400">₪{item.promoPrice.toFixed(2)}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 flex items-center gap-0.5">
                                <Tag className="h-2.5 w-2.5" />{t.promoLabel}
                              </span>
                            </>
                          ) : (
                            <span className="font-medium text-slate-700 dark:text-slate-300">₪{item.price.toFixed(2)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Store Basket Comparison — "Where is cheapest?" */}
      {storeBaskets.length > 0 && (
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Store className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              {t.storeBasketComparison}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[220px] sm:h-[320px] mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={storeBaskets}
                  margin={{ top: 20, right: 20, left: 10, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
                  <XAxis
                    dataKey="storeName"
                    tick={{ fill: chartTickPrimary, fontSize: 11, fontWeight: 500 }}
                    axisLine={{ stroke: chartAxisLine }}
                    tickLine={{ stroke: chartAxisLine }}
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis
                    tick={{ fill: chartTickSecondary, fontSize: 12 }}
                    axisLine={{ stroke: chartAxisLine }}
                    tickLine={{ stroke: chartAxisLine }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="avgBasketCost"
                    fill={CHART_COLORS.info}
                    name={`₪ ${t.avgBasketCost}`}
                    radius={[4, 4, 0, 0]}
                  >
                    {storeBaskets.map((_, index) => (
                      <Cell key={`basket-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Ranked store list */}
            <div className="mt-3 space-y-1.5">
              {[...storeBaskets].sort((a, b) => a.avgBasketCost - b.avgBasketCost).map((store, index) => (
                <div key={store.storeName} className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-500 w-5 text-center">{index + 1}</span>
                  <span className="flex-1 text-sm text-slate-700 dark:text-slate-300">{store.storeName}</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">₪{store.avgBasketCost.toFixed(0)}</span>
                  <span className="text-xs text-slate-400">{store.tripCount} ביקורים</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top 10 Items by Spending — with avg unit price */}
      {topBySpending.length > 0 && (
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t.topBySpending}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[240px] sm:h-[350px] mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topBySpending}
                  margin={{ top: 20, right: 20, left: 10, bottom: 80 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
                  <XAxis
                    dataKey="itemName"
                    tick={{ fill: chartTickPrimary, fontSize: 11, fontWeight: 500 }}
                    axisLine={{ stroke: chartAxisLine }}
                    tickLine={{ stroke: chartAxisLine }}
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis
                    tick={{ fill: chartTickSecondary, fontSize: 12 }}
                    axisLine={{ stroke: chartAxisLine }}
                    tickLine={{ stroke: chartAxisLine }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="totalSpent"
                    fill={CHART_COLORS.accent}
                    name="₪ סה״כ"
                    radius={[4, 4, 0, 0]}
                  >
                    {topBySpending.map((_, index) => (
                      <Cell key={`spend-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Ranked item list with avg unit price */}
            <div className="mt-3 space-y-1.5">
              {topBySpending.map((item, index) => (
                <div key={item.itemName} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: BAR_COLORS[index % BAR_COLORS.length] }} />
                  <span className="flex-1 text-sm text-slate-700 dark:text-slate-300 truncate">{item.itemName}</span>
                  <span className="text-xs text-slate-400 flex-shrink-0">ממוצע ₪{item.avgUnitPrice}</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex-shrink-0">₪{item.totalSpent.toFixed(0)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Monthly Spending Trend */}
      {monthlySpending.length > 0 && (
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t.monthlySpending}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[220px] sm:h-[320px] mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={monthlySpending}
                  margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: chartTickSecondary, fontSize: 12 }}
                    axisLine={{ stroke: chartAxisLine }}
                  />
                  <YAxis
                    tick={{ fill: chartTickSecondary, fontSize: 12 }}
                    axisLine={{ stroke: chartAxisLine }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="totalSpent"
                    stroke={CHART_COLORS.accent}
                    strokeWidth={3}
                    name="₪ הוצאות"
                    dot={{ fill: CHART_COLORS.accent, strokeWidth: 2, r: 5 }}
                    activeDot={{ r: 7, fill: CHART_COLORS.accent }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!hasAnyData && (
        <Card className="shadow-sm">
          <CardContent className="p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
              <ShoppingCart className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">
              {t.dashboardNoData}
            </h3>
            <p className="text-slate-600 dark:text-slate-400">
              {t.dashboardCompleteListsToSee}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
