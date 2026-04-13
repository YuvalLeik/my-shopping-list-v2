'use client';

import { useEffect, useState, useMemo } from 'react';
import { Loader2, ShoppingCart, ListChecks, TrendingUp, Search, X, DollarSign, CheckCircle2, XCircle, PlusCircle, Store, ChevronDown, ChevronUp, Ban } from 'lucide-react';
import { useTheme } from 'next-themes';
import {
  getDashboardStats, DashboardStats, getAllPurchasedItemNames, getItemMonthlyTrend, MonthlyTrend,
  getTopItemsBySpending, SpendingItem, getMonthlySpendingStats, MonthlySpendingPoint,
  getTotalSpending, getItemPriceHistory, PricePoint, getStorePriceComparison, StorePriceComparison,
  getPlannedVsActualStats, PlannedVsActualStats,
  getRecentReconciliations, RecentReconciliation,
  getListReconciliation, ReconciliationData,
  getStoreComparisonByBasket, StoreBasketComparison,
  getSpendingByCategory, SpendingByCategory,
  getMissingItemsByStore, StoreMissingStats,
} from '@/lib/analytics';
import { t } from '@/lib/translations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';

interface DashboardProps {
  userId: string | null;
}

// Modern, distinct color palette
const CHART_COLORS = {
  primary: '#6366f1', // Indigo
  secondary: '#10b981', // Emerald
  accent: '#f59e0b', // Amber
  info: '#3b82f6', // Blue
  success: '#22c55e', // Green
  warning: '#eab308', // Yellow
  danger: '#ef4444', // Red
  purple: '#a855f7', // Purple
  pink: '#ec4899', // Pink
  teal: '#14b8a6', // Teal
};

// Distinct colors for pie chart
const PIE_COLORS = [
  '#6366f1', // Indigo
  '#10b981', // Emerald  
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#a855f7', // Purple
  '#3b82f6', // Blue
  '#ec4899', // Pink
  '#14b8a6', // Teal
  '#84cc16', // Lime
  '#f97316', // Orange
];

// Recharts tooltip/label payload entry
interface TooltipPayloadEntry {
  name: string;
  value: number;
  color?: string;
}

// Custom tooltip style
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

// Custom pie chart label (Recharts may pass optional props)
const renderCustomizedLabel = (
  props: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
  category?: string;
},
  labelFill: string
) => {
  const { cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, percent = 0, category = '' } = props;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 1.4;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  if (percent < 0.05) return null; // Don't show label for small slices

  return (
    <text
      x={x}
      y={y}
      fill={labelFill}
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      className="text-xs font-medium"
    >
      {category} ({(percent * 100).toFixed(0)}%)
    </text>
  );
};

const renderSpendingLabel = (
  props: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
  category?: string;
  totalSpent?: number;
},
  labelFill: string
) => {
  const { cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, percent = 0, category = '', totalSpent = 0 } = props;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 1.4;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  if (percent < 0.05) return null;

  return (
    <text
      x={x}
      y={y}
      fill={labelFill}
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      className="text-xs font-medium"
    >
      {category} (₪{Math.round(totalSpent)})
    </text>
  );
};

export function Dashboard({ userId }: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Recharts SVG tick/label colors are not affected by Tailwind's `dark:` classes,
  // so we set them explicitly based on the active theme.
  const chartTickPrimary = isDark ? '#e2e8f0' : '#374151';
  const chartTickSecondary = isDark ? '#94a3b8' : '#64748b';
  const chartAxisLine = isDark ? '#334155' : '#cbd5e1';
  const chartGridStroke = isDark ? '#334155' : '#e2e8f0';
  const chartLabelFill = chartTickPrimary;
  
  // Item trend state
  const [allItemNames, setAllItemNames] = useState<string[]>([]);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [itemTrend, setItemTrend] = useState<MonthlyTrend[]>([]);
  const [itemTrendLoading, setItemTrendLoading] = useState(false);
  const [showItemDropdown, setShowItemDropdown] = useState(false);

  // Reconciliation state
  const [plannedVsActual, setPlannedVsActual] = useState<PlannedVsActualStats | null>(null);
  const [recentRecons, setRecentRecons] = useState<RecentReconciliation[]>([]);
  const [expandedReconId, setExpandedReconId] = useState<string | null>(null);
  const [expandedReconData, setExpandedReconData] = useState<ReconciliationData | null>(null);
  const [expandedReconLoading, setExpandedReconLoading] = useState(false);
  const [reconsExpanded, setReconsExpanded] = useState(true);

  // Store basket & category spending
  const [storeBaskets, setStoreBaskets] = useState<StoreBasketComparison[]>([]);
  const [spendingByCat, setSpendingByCat] = useState<SpendingByCategory[]>([]);
  const [missingByStore, setMissingByStore] = useState<StoreMissingStats[]>([]);

  // Spending & price state
  const [totalSpending, setTotalSpending] = useState(0);
  const [topBySpending, setTopBySpending] = useState<SpendingItem[]>([]);
  const [monthlySpending, setMonthlySpending] = useState<MonthlySpendingPoint[]>([]);
  const [priceSelectedItem, setPriceSelectedItem] = useState<string | null>(null);
  const [priceSearchQuery, setPriceSearchQuery] = useState('');
  const [showPriceDropdown, setShowPriceDropdown] = useState(false);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [storeComparison, setStoreComparison] = useState<StorePriceComparison[]>([]);
  const [priceLoading, setPriceLoading] = useState(false);

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!itemSearchQuery.trim()) return allItemNames.slice(0, 10);
    return allItemNames
      .filter(name => name.toLowerCase().includes(itemSearchQuery.toLowerCase()))
      .slice(0, 10);
  }, [allItemNames, itemSearchQuery]);

  const filteredPriceItems = useMemo(() => {
    if (!priceSearchQuery.trim()) return allItemNames.slice(0, 10);
    return allItemNames
      .filter(name => name.toLowerCase().includes(priceSearchQuery.toLowerCase()))
      .slice(0, 10);
  }, [allItemNames, priceSearchQuery]);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    async function loadStats() {
      const currentUserId = userId;
      if (!currentUserId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [data, itemNames, spending, topSpend, monthSpend, pva, recons, baskets, catSpend, missingStore] = await Promise.all([
          getDashboardStats(currentUserId),
          getAllPurchasedItemNames(currentUserId),
          getTotalSpending(currentUserId),
          getTopItemsBySpending(currentUserId, 10),
          getMonthlySpendingStats(currentUserId),
          getPlannedVsActualStats(currentUserId),
          getRecentReconciliations(currentUserId, 10),
          getStoreComparisonByBasket(currentUserId),
          getSpendingByCategory(currentUserId),
          getMissingItemsByStore(currentUserId),
        ]);
        setStats(data);
        setAllItemNames(itemNames);
        setTotalSpending(spending);
        setTopBySpending(topSpend);
        setMonthlySpending(monthSpend);
        setPlannedVsActual(pva);
        setRecentRecons(recons);
        setStoreBaskets(baskets);
        setSpendingByCat(catSpend);
        setMissingByStore(missingStore);
      } catch (error) {
        console.error('Failed to load dashboard stats:', error);
        setStats({
          totalPurchasedItems: 0,
          totalCompletedLists: 0,
          avgItemsPerList: 0,
          topItems: [],
          categoryDistribution: [],
          monthlyTrend: [],
          completionTimelineByDay: [],
        });
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, [userId]);

  // Load item-specific trend when item is selected
  useEffect(() => {
    if (!userId || !selectedItem) {
      setItemTrend([]);
      return;
    }

    async function loadItemTrend() {
      setItemTrendLoading(true);
      try {
        const trend = await getItemMonthlyTrend(userId!, selectedItem!);
        setItemTrend(trend);
      } catch (error) {
        console.error('Failed to load item trend:', error);
        setItemTrend([]);
      } finally {
        setItemTrendLoading(false);
      }
    }

    loadItemTrend();
  }, [userId, selectedItem]);

  // Load price history when a price item is selected
  useEffect(() => {
    if (!userId || !priceSelectedItem) {
      setPriceHistory([]);
      setStoreComparison([]);
      return;
    }
    async function loadPriceData() {
      setPriceLoading(true);
      try {
        const [history, stores] = await Promise.all([
          getItemPriceHistory(userId!, priceSelectedItem!),
          getStorePriceComparison(userId!, priceSelectedItem!),
        ]);
        setPriceHistory(history);
        setStoreComparison(stores);
      } catch (error) {
        console.error('Failed to load price data:', error);
        setPriceHistory([]);
        setStoreComparison([]);
      } finally {
        setPriceLoading(false);
      }
    }
    loadPriceData();
  }, [userId, priceSelectedItem]);

  const handleSelectItem = (itemName: string) => {
    setSelectedItem(itemName);
    setItemSearchQuery(itemName);
    setShowItemDropdown(false);
  };

  const handleClearItem = () => {
    setSelectedItem(null);
    setItemSearchQuery('');
    setItemTrend([]);
  };

  const handleSelectPriceItem = (itemName: string) => {
    setPriceSelectedItem(itemName);
    setPriceSearchQuery(itemName);
    setShowPriceDropdown(false);
  };

  const handleClearPriceItem = () => {
    setPriceSelectedItem(null);
    setPriceSearchQuery('');
    setPriceHistory([]);
    setStoreComparison([]);
  };

  const handleToggleRecon = async (listId: string) => {
    if (expandedReconId === listId) {
      setExpandedReconId(null);
      setExpandedReconData(null);
      return;
    }
    setExpandedReconId(listId);
    setExpandedReconLoading(true);
    try {
      const data = await getListReconciliation(userId!, listId);
      setExpandedReconData(data);
    } catch {
      setExpandedReconData(null);
    } finally {
      setExpandedReconLoading(false);
    }
  };

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

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Total Purchased Items */}
        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-900/30 dark:to-emerald-800/20 border-emerald-200/50 dark:border-emerald-700/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300 mb-1">
                  {t.totalPurchasedItems}
                </p>
                <p className="text-3xl font-bold text-emerald-900 dark:text-emerald-100">
                  {stats.totalPurchasedItems.toLocaleString()}
                </p>
              </div>
              <div className="p-3 bg-emerald-500/10 dark:bg-emerald-400/10 rounded-full">
                <ShoppingCart className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total Completed Lists */}
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/30 dark:to-blue-800/20 border-blue-200/50 dark:border-blue-700/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">
                  {t.totalCompletedLists}
                </p>
                <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">
                  {stats.totalCompletedLists.toLocaleString()}
                </p>
              </div>
              <div className="p-3 bg-blue-500/10 dark:bg-blue-400/10 rounded-full">
                <ListChecks className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Average Items Per List */}
        <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-900/30 dark:to-purple-800/20 border-purple-200/50 dark:border-purple-700/50 shadow-sm hover:shadow-md transition-shadow sm:col-span-2 lg:col-span-1">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-1">
                  {t.avgItemsPerList}
                </p>
                <p className="text-3xl font-bold text-purple-900 dark:text-purple-100">
                  {stats.avgItemsPerList}
                </p>
              </div>
              <div className="p-3 bg-purple-500/10 dark:bg-purple-400/10 rounded-full">
                <TrendingUp className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Planned vs Actual Section */}
      {plannedVsActual && plannedVsActual.totalReconciled > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t.plannedVsActualSection}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Fulfillment Rate */}
            <Card className="bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-900/30 dark:to-green-800/20 border-green-200/50 dark:border-green-700/50 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-green-700 dark:text-green-300 mb-1">{t.fulfillmentRate}</p>
                    <p className="text-2xl font-bold text-green-900 dark:text-green-100">{plannedVsActual.avgFulfillmentRate}%</p>
                  </div>
                  <div className="p-2 bg-green-500/10 rounded-full">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                </div>
                <div className="mt-2 w-full bg-green-200 dark:bg-green-800 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, plannedVsActual.avgFulfillmentRate)}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Extra Items Rate */}
            <Card className="bg-gradient-to-br from-sky-50 to-sky-100/50 dark:from-sky-900/30 dark:to-sky-800/20 border-sky-200/50 dark:border-sky-700/50 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-sky-700 dark:text-sky-300 mb-1">{t.extraItemsRate}</p>
                    <p className="text-2xl font-bold text-sky-900 dark:text-sky-100">{plannedVsActual.avgExtrasPerTrip}</p>
                  </div>
                  <div className="p-2 bg-sky-500/10 rounded-full">
                    <PlusCircle className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Total Actual Spending */}
            {plannedVsActual.totalActualSpent != null && (
              <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-900/30 dark:to-amber-800/20 border-amber-200/50 dark:border-amber-700/50 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">{t.totalActualSpending}</p>
                      <p className="text-2xl font-bold text-amber-900 dark:text-amber-100">₪{plannedVsActual.totalActualSpent.toLocaleString()}</p>
                    </div>
                    <div className="p-2 bg-amber-500/10 rounded-full">
                      <DollarSign className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Reconciled Trips */}
            <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 dark:from-indigo-900/30 dark:to-indigo-800/20 border-indigo-200/50 dark:border-indigo-700/50 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">{t.reconciledTrips}</p>
                    <p className="text-2xl font-bold text-indigo-900 dark:text-indigo-100">{plannedVsActual.totalReconciled}</p>
                  </div>
                  <div className="p-2 bg-indigo-500/10 rounded-full">
                    <ListChecks className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Recent Reconciliations List */}
      {recentRecons.length > 0 && (
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {t.recentReconciliations}
              </CardTitle>
              <button
                onClick={() => setReconsExpanded(!reconsExpanded)}
                className="sm:hidden p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400"
              >
                {reconsExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </button>
            </div>
          </CardHeader>
          <CardContent className={`pt-0 space-y-2 ${!reconsExpanded ? 'hidden sm:block' : ''}`}>
            {recentRecons.map((r) => (
              <div key={r.listId} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => handleToggleRecon(r.listId)}
                  className="w-full flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-right"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">{r.listTitle}</span>
                      {r.storeName && (
                        <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <Store className="h-3 w-3" />{r.storeName}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs">
                      <span className="text-green-600 dark:text-green-400 flex items-center gap-0.5">
                        <CheckCircle2 className="h-3 w-3" />{r.matchedCount} {t.matchedItems}
                      </span>
                      <span className="text-red-500 dark:text-red-400 flex items-center gap-0.5">
                        <XCircle className="h-3 w-3" />{r.missedCount} {t.missedItems}
                      </span>
                      <span className="text-sky-600 dark:text-sky-400 flex items-center gap-0.5">
                        <PlusCircle className="h-3 w-3" />{r.extrasCount} {t.extraItems}
                      </span>
                      {r.totalSpent != null && r.totalSpent > 0 && (
                        <span className="text-amber-600 dark:text-amber-400">₪{r.totalSpent.toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ms-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      r.fulfillmentRate >= 80 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                      r.fulfillmentRate >= 50 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                      'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {r.fulfillmentRate}%
                    </span>
                    {expandedReconId === r.listId ? (
                      <ChevronUp className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                  </div>
                </button>

                {expandedReconId === r.listId && (
                  <div className="border-t border-slate-200 dark:border-slate-700 p-3 bg-slate-50/50 dark:bg-slate-800/30">
                    {expandedReconLoading ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
                      </div>
                    ) : expandedReconData ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* Matched */}
                        {expandedReconData.matched.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1.5 flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5" /> {t.matchedItems} ({expandedReconData.matched.length})
                            </h4>
                            <ul className="space-y-1">
                              {expandedReconData.matched.map((m, i) => (
                                <li key={i} className="text-xs text-slate-700 dark:text-slate-300 flex justify-between gap-1">
                                  <span className="truncate">{m.groceryItem}</span>
                                  {m.price != null && <span className="text-slate-500 flex-shrink-0">₪{m.price}</span>}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Not Purchased */}
                        {expandedReconData.notPurchased.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1.5 flex items-center gap-1">
                              <XCircle className="h-3.5 w-3.5" /> {t.missedItems} ({expandedReconData.notPurchased.length})
                            </h4>
                            <ul className="space-y-1">
                              {expandedReconData.notPurchased.map((m, i) => (
                                <li key={i} className="text-xs text-slate-700 dark:text-slate-300 flex justify-between gap-1">
                                  <span className="truncate">{m.name}</span>
                                  <span className="text-slate-400 flex-shrink-0">x{m.quantity}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Extras */}
                        {expandedReconData.extras.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-sky-600 dark:text-sky-400 mb-1.5 flex items-center gap-1">
                              <PlusCircle className="h-3.5 w-3.5" /> {t.extraItems} ({expandedReconData.extras.length})
                            </h4>
                            <ul className="space-y-1">
                              {expandedReconData.extras.map((m, i) => (
                                <li key={i} className="text-xs text-slate-700 dark:text-slate-300 flex justify-between gap-1">
                                  <span className="truncate">{m.name}</span>
                                  {m.price != null && <span className="text-slate-500 flex-shrink-0">₪{m.price}</span>}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 text-center py-2">{t.dashboardNoData}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Store Basket Comparison */}
      {storeBaskets.length > 0 && (
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t.storeBasketComparison}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[220px] sm:h-[320px] mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={storeBaskets}
                  margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
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
                  <Legend
                    formatter={(value) => (
                      <span className="text-sm text-slate-700 dark:text-slate-300">{value}</span>
                    )}
                  />
                  <Bar
                    dataKey="avgBasketCost"
                    fill={CHART_COLORS.info}
                    name={`₪ ${t.avgBasketCost}`}
                    radius={[4, 4, 0, 0]}
                  >
                    {storeBaskets.map((_, index) => (
                      <Cell key={`basket-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Bar>
                  <Bar
                    dataKey="tripCount"
                    fill={CHART_COLORS.secondary}
                    name={t.trips}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Missing Items by Store */}
      {missingByStore.length > 0 && (
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Ban className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              {t.missingItemsByStore}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[220px] sm:h-[320px] mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={missingByStore}
                  margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
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
                    allowDecimals={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    formatter={(value) => (
                      <span className="text-sm text-slate-700 dark:text-slate-300">{value}</span>
                    )}
                  />
                  <Bar
                    dataKey="avgMissedPerTrip"
                    fill={CHART_COLORS.warning}
                    name={t.avgMissedPerTrip}
                    radius={[4, 4, 0, 0]}
                  >
                    {missingByStore.map((_, index) => (
                      <Cell key={`miss-${index}`} fill={index === 0 ? CHART_COLORS.danger : PIE_COLORS[(index + 3) % PIE_COLORS.length]} />
                    ))}
                  </Bar>
                  <Bar
                    dataKey="reconciledTrips"
                    fill={CHART_COLORS.info}
                    name={t.trips}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Spending by Category */}
      {spendingByCat.length > 0 && (() => {
        const NO_CAT = 'ללא קטגוריה';
        const categorized = spendingByCat.filter(c => c.category !== NO_CAT);
        const uncategorizedEntry = spendingByCat.find(c => c.category === NO_CAT);
        // Show pie only when there are real categories; fall back to showing "ללא קטגוריה" if it's the only data
        const pieData = categorized.length >= 2 ? categorized : spendingByCat;
        const hiddenCount = categorized.length >= 2 && uncategorizedEntry ? uncategorizedEntry.itemCount : 0;
        const totalSpent = pieData.reduce((s, c) => s + c.totalSpent, 0);

        return (
          <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {t.spendingByCategory}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-[240px] sm:h-[300px] mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(props: unknown) => renderSpendingLabel(props as any, chartLabelFill)}
                      outerRadius="70%"
                      innerRadius="40%"
                      dataKey="totalSpent"
                      nameKey="category"
                      paddingAngle={2}
                    >
                      {pieData.map((_, index) => (
                        <Cell key={`cat-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} stroke="white" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: unknown) => [`₪${Number(value).toFixed(2)}`, '']}
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Ranked breakdown table */}
              <div className="mt-3 space-y-1.5">
                {pieData.map((entry, index) => {
                  const pct = totalSpent > 0 ? (entry.totalSpent / totalSpent) * 100 : 0;
                  return (
                    <div key={entry.category} className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                      <span className="flex-1 text-sm text-slate-700 dark:text-slate-300 truncate">{entry.category}</span>
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100 flex-shrink-0">₪{entry.totalSpent.toFixed(0)}</span>
                      <span className="text-xs text-slate-400 w-10 text-right flex-shrink-0">{pct.toFixed(0)}%</span>
                    </div>
                  );
                })}
              </div>
              {hiddenCount > 0 && (
                <p className="mt-2 text-xs text-slate-400 dark:text-slate-500 text-center">
                  * {hiddenCount} פריטים ללא קטגוריה לא מוצגים בגרף
                </p>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Main data: items (what was purchased). Date is context. */}
      <div className="space-y-6">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t.itemDataSection}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">{t.itemDataDescription}</p>
      </div>

      {/* Charts Grid - item-centric first */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 10 Items Chart */}
        {stats.topItems.length > 0 && (
          <Card className="shadow-sm hover:shadow-md transition-shadow lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {t.topTenItems}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-[240px] sm:h-[400px] mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stats.topItems}
                    margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
                    <XAxis 
                      dataKey="name"
                      type="category"
                      tick={{ fill: chartTickPrimary, fontSize: 11, fontWeight: 500 }}
                      axisLine={{ stroke: chartAxisLine }}
                      tickLine={{ stroke: chartAxisLine }}
                      interval={0}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis 
                      type="number"
                      tick={{ fill: chartTickSecondary, fontSize: 12 }}
                      axisLine={{ stroke: chartAxisLine }}
                      tickLine={{ stroke: chartAxisLine }}
                      allowDecimals={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar 
                      dataKey="total_quantity" 
                      fill={CHART_COLORS.primary}
                      name={t.quantity}
                      radius={[4, 4, 0, 0]}
                    >
                      {stats.topItems.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Category Distribution Chart */}
        {stats.categoryDistribution.length > 0 && (() => {
          const NO_CAT = 'ללא קטגוריה';
          const categorized = stats.categoryDistribution.filter(c => c.category !== NO_CAT);
          const uncategorizedEntry = stats.categoryDistribution.find(c => c.category === NO_CAT);
          const pieData = categorized.length >= 2 ? categorized : stats.categoryDistribution;
          const hiddenQty = categorized.length >= 2 && uncategorizedEntry ? uncategorizedEntry.total_quantity : 0;
          const totalQty = pieData.reduce((s, c) => s + c.total_quantity, 0);

          return (
            <Card className="shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {t.categoryDistribution}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="h-[240px] sm:h-[300px] mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={(props: unknown) => renderCustomizedLabel(props as any, chartLabelFill)}
                        outerRadius="70%"
                        innerRadius="40%"
                        dataKey="total_quantity"
                        nameKey="category"
                        paddingAngle={2}
                      >
                        {pieData.map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={PIE_COLORS[index % PIE_COLORS.length]}
                            stroke="white"
                            strokeWidth={2}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: unknown, name?: string) => [value as React.ReactNode, name ?? '']}
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Ranked breakdown table */}
                <div className="mt-3 space-y-1.5">
                  {pieData.map((entry, index) => {
                    const pct = totalQty > 0 ? (entry.total_quantity / totalQty) * 100 : 0;
                    return (
                      <div key={entry.category} className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                        <span className="flex-1 text-sm text-slate-700 dark:text-slate-300 truncate">{entry.category}</span>
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100 flex-shrink-0">{entry.total_quantity} יח&apos;</span>
                        <span className="text-xs text-slate-400 w-10 text-right flex-shrink-0">{pct.toFixed(0)}%</span>
                      </div>
                    );
                  })}
                </div>
                {hiddenQty > 0 && (
                  <p className="mt-2 text-xs text-slate-400 dark:text-slate-500 text-center">
                    * {hiddenQty} יחידות ללא קטגוריה לא מוצגות בגרף
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })()}

        {/* Monthly Trend Chart - Item Specific */}
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {t.monthlyItemTrend}
              </CardTitle>
              
              {/* Item Search */}
              <div className="relative w-full sm:w-64">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    type="text"
                    placeholder={t.searchItem}
                    value={itemSearchQuery}
                    onChange={(e) => {
                      setItemSearchQuery(e.target.value);
                      setShowItemDropdown(true);
                      if (!e.target.value) {
                        setSelectedItem(null);
                      }
                    }}
                    onFocus={() => setShowItemDropdown(true)}
                    className="pr-10 pl-8 text-sm"
                  />
                  {selectedItem && (
                    <button
                      onClick={handleClearItem}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                
                {/* Dropdown */}
                {showItemDropdown && filteredItems.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredItems.map((item, index) => (
                      <button
                        key={index}
                        onClick={() => handleSelectItem(item)}
                        className={`w-full text-right px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ${
                          selectedItem === item ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {/* Click outside to close dropdown */}
            {showItemDropdown && (
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setShowItemDropdown(false)}
              />
            )}
            
            {!selectedItem ? (
              <div className="h-[240px] sm:h-[350px] mt-4 flex items-center justify-center">
                <div className="text-center">
                  <Search className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-500 dark:text-slate-400">
                    {t.selectItemToView}
                  </p>
                  <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
                    {allItemNames.length} {t.itemsAvailable}
                  </p>
                </div>
              </div>
            ) : itemTrendLoading ? (
              <div className="h-[240px] sm:h-[350px] mt-4 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400" />
              </div>
            ) : itemTrend.length === 0 ? (
              <div className="h-[240px] sm:h-[350px] mt-4 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-slate-500 dark:text-slate-400">
                    {t.noDataForItem} &quot;{selectedItem}&quot;
                  </p>
                </div>
              </div>
            ) : (
              <div className="h-[240px] sm:h-[350px] mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart 
                    data={itemTrend}
                    margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
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
                      allowDecimals={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend 
                      formatter={() => (
                        <span className="text-sm text-slate-700 dark:text-slate-300">{selectedItem}</span>
                      )}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="total_items" 
                      stroke={CHART_COLORS.primary}
                      strokeWidth={3}
                      name={selectedItem}
                      dot={{ fill: CHART_COLORS.primary, strokeWidth: 2, r: 5 }}
                      activeDot={{ r: 7, fill: CHART_COLORS.primary }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Items over time - date as context for item data */}
      {(stats.completionTimelineByDay.length > 0 || stats.monthlyTrend.length > 0) && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t.itemsOverTime}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">{t.itemsOverTimeDesc}</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Items by completion date - main item timeline */}
            {stats.completionTimelineByDay.length > 0 && (
              <Card className="shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {t.itemsByCompletionDate}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="h-[220px] sm:h-[320px] mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={stats.completionTimelineByDay}
                        margin={{ top: 10, right: 20, left: 10, bottom: 60 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(value) => {
                            const parts = value.split('-');
                            return parts.length === 3 ? `${parts[2]}/${parts[1]}` : value;
                          }}
                          tick={{ fill: chartTickSecondary, fontSize: 11 }}
                          axisLine={{ stroke: chartAxisLine }}
                          tickLine={{ stroke: chartAxisLine }}
                          angle={-45}
                          textAnchor="end"
                          height={60}
                        />
                        <YAxis
                          tick={{ fill: chartTickSecondary, fontSize: 12 }}
                          axisLine={{ stroke: chartAxisLine }}
                          tickLine={{ stroke: chartAxisLine }}
                          allowDecimals={false}
                        />
                        <Tooltip
                          content={<CustomTooltip />}
                          labelFormatter={(value) => {
                            const parts = String(value).split('-');
                            return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="totalItems"
                          stroke={CHART_COLORS.secondary}
                          strokeWidth={2}
                          name={t.items}
                          dot={{ fill: CHART_COLORS.secondary, strokeWidth: 2, r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Items per month */}
            {stats.monthlyTrend.length > 0 && (
              <Card className="shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {t.itemsByMonth}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="h-[220px] sm:h-[320px] mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={stats.monthlyTrend}
                        margin={{ top: 10, right: 20, left: 10, bottom: 40 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
                        <XAxis
                          dataKey="month"
                          tick={{ fill: chartTickSecondary, fontSize: 11 }}
                          axisLine={{ stroke: chartAxisLine }}
                          tickLine={{ stroke: chartAxisLine }}
                        />
                        <YAxis
                          tick={{ fill: chartTickSecondary, fontSize: 12 }}
                          axisLine={{ stroke: chartAxisLine }}
                          tickLine={{ stroke: chartAxisLine }}
                          allowDecimals={false}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar
                          dataKey="total_items"
                          fill={CHART_COLORS.primary}
                          name={t.items}
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Lists per date - context only */}
            {stats.completionTimelineByDay.length > 0 && (
              <Card className="shadow-sm hover:shadow-md transition-shadow lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {t.listsCompletedByDate}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="h-[260px] sm:h-[280px] mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={stats.completionTimelineByDay}
                        margin={{ top: 10, right: 20, left: 10, bottom: 60 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(value) => {
                            const parts = value.split('-');
                            return parts.length === 3 ? `${parts[2]}/${parts[1]}` : value;
                          }}
                          tick={{ fill: chartTickSecondary, fontSize: 11 }}
                          axisLine={{ stroke: chartAxisLine }}
                          tickLine={{ stroke: chartAxisLine }}
                          angle={-45}
                          textAnchor="end"
                          height={60}
                        />
                        <YAxis
                          type="number"
                          tick={{ fill: chartTickSecondary, fontSize: 12 }}
                          axisLine={{ stroke: chartAxisLine }}
                          tickLine={{ stroke: chartAxisLine }}
                          allowDecimals={false}
                        />
                        <Tooltip
                          content={<CustomTooltip />}
                          labelFormatter={(value) => {
                            const parts = String(value).split('-');
                            return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
                          }}
                        />
                        <Bar
                          dataKey="listCount"
                          fill={CHART_COLORS.info}
                          name={t.listCount}
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Spending & Prices Section */}
      {(totalSpending > 0 || topBySpending.length > 0 || monthlySpending.length > 0) && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t.spendingAndPrices}</h2>

          {/* Total Spending KPI */}
          <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-900/30 dark:to-amber-800/20 border-amber-200/50 dark:border-amber-700/50 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-300 mb-1">
                    {t.totalSpending}
                  </p>
                  <p className="text-3xl font-bold text-amber-900 dark:text-amber-100">
                    ₪{totalSpending.toLocaleString()}
                  </p>
                </div>
                <div className="p-3 bg-amber-500/10 dark:bg-amber-400/10 rounded-full">
                  <DollarSign className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Items by Spending */}
            {topBySpending.length > 0 && (
              <Card className="shadow-sm hover:shadow-md transition-shadow lg:col-span-2">
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
                        margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
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
                            <Cell key={`spend-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
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

            {/* Item Price Tracker */}
            <Card className="shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {t.priceHistory}
                  </CardTitle>
                  <div className="relative w-full sm:w-64">
                    <div className="relative">
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        type="text"
                        placeholder={t.searchItem}
                        value={priceSearchQuery}
                        onChange={(e) => {
                          setPriceSearchQuery(e.target.value);
                          setShowPriceDropdown(true);
                          if (!e.target.value) setPriceSelectedItem(null);
                        }}
                        onFocus={() => setShowPriceDropdown(true)}
                        className="pr-10 pl-8 text-sm"
                      />
                      {priceSelectedItem && (
                        <button
                          onClick={handleClearPriceItem}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    {showPriceDropdown && filteredPriceItems.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {filteredPriceItems.map((item, index) => (
                          <button
                            key={index}
                            onClick={() => handleSelectPriceItem(item)}
                            className={`w-full text-right px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ${
                              priceSelectedItem === item ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {showPriceDropdown && (
                  <div className="fixed inset-0 z-40" onClick={() => setShowPriceDropdown(false)} />
                )}

                {!priceSelectedItem ? (
                  <div className="h-[220px] sm:h-[320px] mt-4 flex items-center justify-center">
                    <div className="text-center">
                      <Search className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                      <p className="text-slate-500 dark:text-slate-400">{t.selectItemForPrices}</p>
                    </div>
                  </div>
                ) : priceLoading ? (
                  <div className="h-[220px] sm:h-[320px] mt-4 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-amber-600 dark:text-amber-400" />
                  </div>
                ) : priceHistory.length === 0 ? (
                  <div className="h-[220px] sm:h-[320px] mt-4 flex items-center justify-center">
                    <p className="text-slate-500 dark:text-slate-400">
                      {t.noPriceDataFor} &quot;{priceSelectedItem}&quot;
                    </p>
                  </div>
                ) : (
                  <div className="h-[220px] sm:h-[320px] mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={priceHistory}
                        margin={{ top: 5, right: 20, left: 10, bottom: 40 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(value) => {
                            const parts = String(value).split('-');
                            return parts.length === 3 ? `${parts[2]}/${parts[1]}` : value;
                          }}
                          tick={{ fill: chartTickSecondary, fontSize: 11 }}
                          axisLine={{ stroke: chartAxisLine }}
                          angle={-45}
                          textAnchor="end"
                          height={40}
                        />
                        <YAxis
                          tick={{ fill: chartTickSecondary, fontSize: 12 }}
                          axisLine={{ stroke: chartAxisLine }}
                        />
                        <Tooltip
                          content={<CustomTooltip />}
                          labelFormatter={(value) => {
                            const parts = String(value).split('-');
                            return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="unit_price"
                          stroke={CHART_COLORS.accent}
                          strokeWidth={3}
                          name="₪ מחיר ליחידה"
                          dot={{ fill: CHART_COLORS.accent, strokeWidth: 2, r: 5 }}
                          activeDot={{ r: 7 }}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Store comparison below price history */}
                {priceSelectedItem && storeComparison.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t.storeComparison}</h4>
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={storeComparison}
                          margin={{ top: 10, right: 20, left: 10, bottom: 40 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} vertical={false} />
                          <XAxis
                            dataKey="storeName"
                            tick={{ fill: chartTickSecondary, fontSize: 11 }}
                            axisLine={{ stroke: chartAxisLine }}
                            angle={-30}
                            textAnchor="end"
                            height={40}
                          />
                          <YAxis
                            tick={{ fill: chartTickSecondary, fontSize: 12 }}
                            axisLine={{ stroke: chartAxisLine }}
                          />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar
                            dataKey="avgPrice"
                            fill={CHART_COLORS.info}
                            name={`₪ ${t.avgPrice}`}
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Empty State - all data is per-user and from completed lists only */}
      {stats.topItems.length === 0 && stats.categoryDistribution.length === 0 && stats.monthlyTrend.length === 0 && stats.completionTimelineByDay.length === 0 && (
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
