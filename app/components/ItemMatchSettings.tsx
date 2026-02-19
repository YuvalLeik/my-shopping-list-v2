'use client';

import { useEffect, useState } from 'react';
import { X, Trash2, Plus, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t } from '@/lib/translations';
import { fetchAllAliases, deleteAlias, upsertAlias, ItemAlias } from '@/lib/itemAliases';
import { toast } from 'sonner';

interface ItemMatchSettingsProps {
  userId: string;
  onClose: () => void;
}

export function ItemMatchSettings({ userId, onClose }: ItemMatchSettingsProps) {
  const [aliases, setAliases] = useState<ItemAlias[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCanonical, setNewCanonical] = useState('');
  const [newAlias, setNewAlias] = useState('');
  const [newStore, setNewStore] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadAliases();
  }, [userId]);

  const loadAliases = async () => {
    setLoading(true);
    try {
      const data = await fetchAllAliases(userId);
      setAliases(data);
    } catch {
      toast.error('Failed to load aliases');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAlias(id);
      setAliases(prev => prev.filter(a => a.id !== id));
      toast.success(t.itemDeleted);
    } catch {
      toast.error(t.failedToDeleteItem);
    }
  };

  const handleAdd = async () => {
    if (!newCanonical.trim() || !newAlias.trim()) return;
    setAdding(true);
    try {
      await upsertAlias(userId, newAlias.trim(), newCanonical.trim(), newStore.trim() || null);
      toast.success(t.itemAdded);
      setNewCanonical('');
      setNewAlias('');
      setNewStore('');
      setShowAddForm(false);
      await loadAliases();
    } catch {
      toast.error(t.failedToAddItem);
    } finally {
      setAdding(false);
    }
  };

  const filteredAliases = filter.trim()
    ? aliases.filter(a =>
        a.canonical_name.toLowerCase().includes(filter.toLowerCase()) ||
        a.alias_name.toLowerCase().includes(filter.toLowerCase()) ||
        (a.store_name && a.store_name.toLowerCase().includes(filter.toLowerCase()))
      )
    : aliases;

  // Group by canonical name
  const grouped = new Map<string, ItemAlias[]>();
  for (const a of filteredAliases) {
    const key = a.canonical_name;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(a);
  }

  return (
    <Card className="fixed bottom-24 left-6 w-[420px] max-h-[80vh] shadow-2xl border-slate-200 bg-white dark:bg-slate-900 z-[60] [dir=rtl]:left-auto [dir=rtl]:right-6 flex flex-col overflow-hidden">
      <CardHeader className="pb-2 flex-shrink-0">
        <div className="flex items-center justify-between [dir=rtl]:flex-row-reverse">
          <CardTitle className="text-lg text-slate-900 dark:text-slate-50">
            {t.itemMatchSettings}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 overflow-y-auto flex-1 pb-4">
        {/* Search filter */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="חפש..."
            className="pr-10 text-right text-sm"
          />
        </div>

        {/* Add new alias */}
        <div>
          {!showAddForm ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddForm(true)}
              className="w-full text-xs"
            >
              <Plus className="h-3 w-3 me-1" />
              {t.addAlias}
            </Button>
          ) : (
            <div className="space-y-2 p-2 border border-slate-200 dark:border-slate-700 rounded-lg">
              <Input
                value={newCanonical}
                onChange={(e) => setNewCanonical(e.target.value)}
                placeholder={t.canonicalName}
                className="text-right text-sm"
                dir="rtl"
              />
              <Input
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                placeholder={t.aliasName}
                className="text-right text-sm"
                dir="rtl"
              />
              <Input
                value={newStore}
                onChange={(e) => setNewStore(e.target.value)}
                placeholder={`${t.storeName} (${t.cancel})`}
                className="text-right text-sm"
                dir="rtl"
              />
              <div className="flex gap-2">
                <Button
                  onClick={handleAdd}
                  disabled={adding || !newCanonical.trim() || !newAlias.trim()}
                  size="sm"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                >
                  {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : t.add}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddForm(false)}
                  className="text-xs"
                >
                  {t.cancel}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Aliases list grouped by canonical name */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
          </div>
        ) : aliases.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">{t.noAliases}</p>
        ) : (
          <div className="space-y-2">
            {Array.from(grouped.entries()).map(([canonical, items]) => (
              <div key={canonical} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <div className="bg-slate-50 dark:bg-slate-800 px-3 py-1.5">
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {canonical}
                  </span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.map(alias => (
                    <div key={alias.id} className="flex items-center justify-between px-3 py-1.5 [dir=rtl]:flex-row-reverse">
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-slate-600 dark:text-slate-400 block truncate">
                          {alias.alias_name}
                        </span>
                        {alias.store_name && (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">
                            {alias.store_name}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(alias.id)}
                        className="h-6 w-6 p-0 text-red-500 hover:text-red-700 flex-shrink-0"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
