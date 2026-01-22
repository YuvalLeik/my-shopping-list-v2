'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getDashboardStats, DashboardStats } from '@/lib/analytics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00ff00', '#0088fe', '#ff00ff', '#ff0000', '#00ffff', '#ffff00'];

export function Dashboard({ userId }: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

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
        const data = await getDashboardStats(currentUserId);
        setStats(data);
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

  if (!userId) {
    return (
      <div className="p-4 text-sm text-slate-600 dark:text-slate-400">
        יש להתחבר כדי לראות את ה-Dashboard
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-emerald-600 dark:text-emerald-400" />
        <span className="text-sm text-slate-600 dark:text-slate-400">טוען נתונים...</span>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-4 text-sm text-slate-600 dark:text-slate-400">
        לא נמצאו נתונים
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
              סה"כ פריטים שנרכשו
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
              {stats.totalPurchasedItems}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-900 dark:text-blue-100">
              סה"כ רשימות שהושלמו
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
              {stats.totalCompletedLists}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-purple-900 dark:text-purple-100">
              ממוצע פריטים לרשימה
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">
              {stats.avgItemsPerList}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top 10 Items Chart */}
      {stats.topItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">10 המוצרים הנפוצים ביותר</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart
                data={stats.topItems}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={100} />
                <Tooltip />
                <Legend />
                <Bar dataKey="total_quantity" fill="#8884d8" name="כמות" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Category Distribution Chart */}
      {stats.categoryDistribution.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">התפלגות קטגוריות</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={stats.categoryDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry: any) => `${entry.category}: ${entry.total_quantity}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="total_quantity"
                >
                  {stats.categoryDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Monthly Trend Chart */}
      {stats.monthlyTrend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">מגמה חודשית</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={stats.monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="total_items" stroke="#8884d8" name="פריטים שנרכשו" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {stats.topItems.length === 0 && stats.categoryDistribution.length === 0 && stats.monthlyTrend.length === 0 && (
        <div className="p-4 text-center text-sm text-slate-600 dark:text-slate-400">
          אין נתונים להצגה. השלם רשימות כדי לראות סטטיסטיקות.
        </div>
      )}
    </div>
  );
}
