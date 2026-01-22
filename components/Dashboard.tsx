'use client';

import { useEffect, useState, useMemo } from 'react';
import { Loader2, ShoppingCart, ListChecks, TrendingUp, Search, X } from 'lucide-react';
import { getDashboardStats, DashboardStats, getAllPurchasedItemNames, getItemMonthlyTrend, MonthlyTrend } from '@/lib/analytics';
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

// Custom tooltip style
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
        <p className="font-medium text-slate-900 dark:text-slate-100 mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// Custom pie chart label
const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, category }: any) => {
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 1.4;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  if (percent < 0.05) return null; // Don't show label for small slices

  return (
    <text
      x={x}
      y={y}
      fill="#374151"
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      className="text-xs font-medium"
    >
      {category} ({(percent * 100).toFixed(0)}%)
    </text>
  );
};

export function Dashboard({ userId }: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Item trend state
  const [allItemNames, setAllItemNames] = useState<string[]>([]);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [itemTrend, setItemTrend] = useState<MonthlyTrend[]>([]);
  const [itemTrendLoading, setItemTrendLoading] = useState(false);
  const [showItemDropdown, setShowItemDropdown] = useState(false);

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!itemSearchQuery.trim()) return allItemNames.slice(0, 10);
    return allItemNames
      .filter(name => name.toLowerCase().includes(itemSearchQuery.toLowerCase()))
      .slice(0, 10);
  }, [allItemNames, itemSearchQuery]);

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
        const [data, itemNames] = await Promise.all([
          getDashboardStats(currentUserId),
          getAllPurchasedItemNames(currentUserId),
        ]);
        setStats(data);
        setAllItemNames(itemNames);
      } catch (error) {
        console.error('Failed to load dashboard stats:', error);
        setStats({
          totalPurchasedItems: 0,
          totalCompletedLists: 0,
          avgItemsPerList: 0,
          topItems: [],
          categoryDistribution: [],
          monthlyTrend: [],
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

  if (!userId) {
    return (
      <div className="p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
          <ShoppingCart className="h-8 w-8 text-slate-400" />
        </div>
        <p className="text-slate-600 dark:text-slate-400">יש להתחבר כדי לראות את ה-Dashboard</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400" />
        <span className="text-slate-600 dark:text-slate-400">טוען נתונים...</span>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-8 text-center text-slate-600 dark:text-slate-400">
        לא נמצאו נתונים
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Total Purchased Items */}
        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-900/30 dark:to-emerald-800/20 border-emerald-200/50 dark:border-emerald-700/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300 mb-1">
                  סה"כ פריטים שנרכשו
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
                  סה"כ רשימות שהושלמו
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
                  ממוצע פריטים לרשימה
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

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 10 Items Chart */}
        {stats.topItems.length > 0 && (
          <Card className="shadow-sm hover:shadow-md transition-shadow lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                10 המוצרים הנפוצים ביותר
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-[300px] sm:h-[400px] mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stats.topItems}
                    margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis 
                      dataKey="name"
                      type="category"
                      tick={{ fill: '#374151', fontSize: 11, fontWeight: 500 }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={{ stroke: '#cbd5e1' }}
                      interval={0}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis 
                      type="number"
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={{ stroke: '#cbd5e1' }}
                      allowDecimals={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar 
                      dataKey="total_quantity" 
                      fill={CHART_COLORS.primary}
                      name="כמות"
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
        {stats.categoryDistribution.length > 0 && (
          <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                התפלגות קטגוריות
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-[300px] sm:h-[350px] mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.categoryDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={renderCustomizedLabel}
                      outerRadius="70%"
                      innerRadius="40%"
                      fill="#8884d8"
                      dataKey="total_quantity"
                      nameKey="category"
                      paddingAngle={2}
                    >
                      {stats.categoryDistribution.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                          stroke="white"
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: any, name: any) => [value, name]}
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                      }}
                    />
                    <Legend 
                      formatter={(value) => (
                        <span className="text-sm text-slate-700 dark:text-slate-300">{value}</span>
                      )}
                      wrapperStyle={{ paddingTop: '20px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Monthly Trend Chart - Item Specific */}
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                מגמה חודשית לפי פריט
              </CardTitle>
              
              {/* Item Search */}
              <div className="relative w-full sm:w-64">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="חפש פריט..."
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
              <div className="h-[300px] sm:h-[350px] mt-4 flex items-center justify-center">
                <div className="text-center">
                  <Search className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-500 dark:text-slate-400">
                    בחר פריט מהרשימה לצפייה במגמה החודשית
                  </p>
                  <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
                    {allItemNames.length} פריטים זמינים
                  </p>
                </div>
              </div>
            ) : itemTrendLoading ? (
              <div className="h-[300px] sm:h-[350px] mt-4 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400" />
              </div>
            ) : itemTrend.length === 0 ? (
              <div className="h-[300px] sm:h-[350px] mt-4 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-slate-500 dark:text-slate-400">
                    אין נתונים עבור "{selectedItem}"
                  </p>
                </div>
              </div>
            ) : (
              <div className="h-[300px] sm:h-[350px] mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart 
                    data={itemTrend}
                    margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis 
                      dataKey="month" 
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      axisLine={{ stroke: '#cbd5e1' }}
                    />
                    <YAxis 
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      axisLine={{ stroke: '#cbd5e1' }}
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

      {/* Empty State */}
      {stats.topItems.length === 0 && stats.categoryDistribution.length === 0 && stats.monthlyTrend.length === 0 && (
        <Card className="shadow-sm">
          <CardContent className="p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
              <ShoppingCart className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">
              אין נתונים להצגה
            </h3>
            <p className="text-slate-600 dark:text-slate-400">
              השלם רשימות כדי לראות סטטיסטיקות
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
