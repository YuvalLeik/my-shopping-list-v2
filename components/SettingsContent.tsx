'use client';

import { useEffect, useState, useCallback } from 'react';
import { Trash2, Plus, Loader2, Search, Link2, Image as ImageIcon, ChevronDown, ChevronUp, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t } from '@/lib/translations';
import { fetchAllAliases, deleteAlias, upsertAlias, getUserPersonalItems, getUnmatchedReceiptItems, ItemAlias, PersonalItem } from '@/lib/itemAliases';
import { toast } from 'sonner';

interface SettingsContentProps {
  userId: string;
}

export function SettingsContent({ userId }: SettingsContentProps) {
  const [aliases, setAliases] = useState<ItemAlias[]>([]);
  const [personalItems, setPersonalItems] = useState<PersonalItem[]>([]);
  const [unmatchedReceipt, setUnmatchedReceipt] = useState<string[]>([]);
  const [loadingAliases, setLoadingAliases] = useState(true);
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadingUnmatched, setLoadingUnmatched] = useState(true);
  const [filter, setFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');

  // Add alias form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCanonical, setNewCanonical] = useState('');
  const [newAlias, setNewAlias] = useState('');
  const [newStore, setNewStore] = useState('');
  const [adding, setAdding] = useState(false);

  // Per-card inline attach: which item card is open for attaching
  const [attachCardItem, setAttachCardItem] = useState<string | null>(null);
  const [attachCardInput, setAttachCardInput] = useState('');

  // Unmatched item attach: which unmatched item is being matched
  const [matchingUnmatched, setMatchingUnmatched] = useState<string | null>(null);
  const [unmatchedSearch, setUnmatchedSearch] = useState('');

  const [showItems, setShowItems] = useState(true);
  const [showAliases, setShowAliases] = useState(true);
  const [showUnmatched, setShowUnmatched] = useState(true);

  const loadAliases = useCallback(async () => {
    setLoadingAliases(true);
    try {
      const data = await fetchAllAliases(userId);
      setAliases(data);
    } catch {
      toast.error('Failed to load aliases');
    } finally {
      setLoadingAliases(false);
    }
  }, [userId]);

  const loadPersonalItems = useCallback(async () => {
    setLoadingItems(true);
    try {
      const items = await getUserPersonalItems(userId);
      setPersonalItems(items);
    } catch {
      toast.error('Failed to load items');
    } finally {
      setLoadingItems(false);
    }
  }, [userId]);

  const loadUnmatched = useCallback(async () => {
    setLoadingUnmatched(true);
    try {
      const items = await getUnmatchedReceiptItems(userId);
      setUnmatchedReceipt(items);
    } catch {
      // non-critical
    } finally {
      setLoadingUnmatched(false);
    }
  }, [userId]);

  useEffect(() => {
    loadAliases();
    loadPersonalItems();
    loadUnmatched();
  }, [loadAliases, loadPersonalItems, loadUnmatched]);

  const handleDeleteAlias = async (id: string) => {
    try {
      await deleteAlias(id);
      setAliases(prev => prev.filter(a => a.id !== id));
      toast.success(t.itemDeleted);
      loadUnmatched();
    } catch {
      toast.error(t.failedToDeleteItem);
    }
  };

  const handleAddAlias = async () => {
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
      loadUnmatched();
    } catch (err) {
      toast.error(`${t.failedToAddItem}: ${err instanceof Error ? err.message : ''}`);
    } finally {
      setAdding(false);
    }
  };

  // Attach a receipt name to a personal item (per-card flow)
  const handleCardAttach = async (personalItemName: string) => {
    if (!attachCardInput.trim()) return;
    try {
      await upsertAlias(userId, attachCardInput.trim(), personalItemName, null);
      toast.success(`${attachCardInput.trim()} → ${personalItemName}`);
      setAttachCardItem(null);
      setAttachCardInput('');
      await loadAliases();
      loadUnmatched();
    } catch (err) {
      toast.error(`${t.failedToAddItem}: ${err instanceof Error ? err.message : ''}`);
    }
  };

  // Attach an unmatched receipt item to a personal item
  const handleUnmatchedAttach = async (personalItemName: string) => {
    if (!matchingUnmatched) return;
    try {
      await upsertAlias(userId, matchingUnmatched, personalItemName, null);
      toast.success(`${matchingUnmatched} → ${personalItemName}`);
      setMatchingUnmatched(null);
      setUnmatchedSearch('');
      await loadAliases();
      loadUnmatched();
    } catch (err) {
      toast.error(`${t.failedToAddItem}: ${err instanceof Error ? err.message : ''}`);
    }
  };

  const filteredAliases = filter.trim()
    ? aliases.filter(a =>
        a.canonical_name.toLowerCase().includes(filter.toLowerCase()) ||
        a.alias_name.toLowerCase().includes(filter.toLowerCase()) ||
        (a.store_name && a.store_name.toLowerCase().includes(filter.toLowerCase()))
      )
    : aliases;

  const grouped = new Map<string, ItemAlias[]>();
  for (const a of filteredAliases) {
    const key = a.canonical_name;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(a);
  }

  const filteredItems = itemFilter.trim()
    ? personalItems.filter(p => p.name.toLowerCase().includes(itemFilter.toLowerCase()))
    : personalItems;

  const aliasesForItem = (itemName: string): ItemAlias[] => {
    const norm = itemName.toLowerCase();
    return aliases.filter(a => a.canonical_name.toLowerCase() === norm);
  };

  const filteredUnmatchedPersonal = unmatchedSearch.trim()
    ? personalItems.filter(p => p.name.toLowerCase().includes(unmatchedSearch.toLowerCase()))
    : personalItems;

  return (
    <div className="space-y-6">
      {/* Unmatched Receipt Items Section */}
      {unmatchedReceipt.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader className="pb-3">
            <button
              onClick={() => setShowUnmatched(!showUnmatched)}
              className="flex items-center justify-between w-full text-right"
            >
              <CardTitle className="text-lg text-amber-700 dark:text-amber-400">
                {t.settingsUnmatchedItems} ({unmatchedReceipt.length})
              </CardTitle>
              {showUnmatched ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </button>
          </CardHeader>
          {showUnmatched && (
            <CardContent>
              {loadingUnmatched ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
                </div>
              ) : (
                <div className="space-y-2">
                  {unmatchedReceipt.map((receiptName) => (
                    <div
                      key={receiptName}
                      className="border border-amber-200 dark:border-amber-800 rounded-lg p-3 bg-amber-50/50 dark:bg-amber-900/10"
                    >
                      <div className="flex items-center justify-between [dir=rtl]:flex-row-reverse">
                        <span className="text-sm text-slate-700 dark:text-slate-300">{receiptName}</span>
                        {matchingUnmatched === receiptName ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setMatchingUnmatched(null); setUnmatchedSearch(''); }}
                            className="h-6 w-6 p-0"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setMatchingUnmatched(receiptName); setUnmatchedSearch(''); }}
                            className="h-7 text-xs text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                          >
                            {t.attachItem}
                          </Button>
                        )}
                      </div>

                      {matchingUnmatched === receiptName && (
                        <div className="mt-2 space-y-1.5">
                          <p className="text-[11px] text-slate-500">{t.settingsPickItem}</p>
                          <Input
                            value={unmatchedSearch}
                            onChange={(e) => setUnmatchedSearch(e.target.value)}
                            placeholder={t.searchMyItems}
                            className="text-right text-sm h-8"
                            dir="rtl"
                            autoFocus
                          />
                          <div className="max-h-32 overflow-y-auto space-y-0.5 border rounded bg-white dark:bg-slate-900 p-1">
                            {filteredUnmatchedPersonal.slice(0, 12).map((pi, piIdx) => (
                              <button
                                key={piIdx}
                                type="button"
                                className="flex items-center gap-2 w-full text-right text-sm px-2 py-1.5 rounded hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors [dir=rtl]:flex-row-reverse"
                                onClick={() => handleUnmatchedAttach(pi.name)}
                              >
                                {pi.image_url ? (
                                  <img src={pi.image_url} alt="" className="h-6 w-6 rounded object-cover flex-shrink-0" />
                                ) : (
                                  <div className="h-6 w-6 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                                    <ImageIcon className="h-3 w-3 text-slate-300" />
                                  </div>
                                )}
                                <span className="truncate">{pi.name}</span>
                              </button>
                            ))}
                            {filteredUnmatchedPersonal.length === 0 && unmatchedSearch.trim() && (
                              <p className="text-xs text-slate-400 text-center py-2">{t.noMatch}</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* My Items Section */}
      <Card>
        <CardHeader className="pb-3">
          <button
            onClick={() => setShowItems(!showItems)}
            className="flex items-center justify-between w-full text-right"
          >
            <CardTitle className="text-lg">{t.settingsMyItems} ({personalItems.length})</CardTitle>
            {showItems ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
          {showItems && (
            <div className="relative mt-2">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={itemFilter}
                onChange={(e) => setItemFilter(e.target.value)}
                placeholder={t.searchMyItems}
                className="pr-10 text-right text-sm"
              />
            </div>
          )}
        </CardHeader>
        {showItems && (
          <CardContent>
            {loadingItems ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
              </div>
            ) : filteredItems.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">{t.noItems}</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredItems.map((item, idx) => {
                  const itemAliases = aliasesForItem(item.name);
                  const isAttaching = attachCardItem === item.name;
                  return (
                    <div
                      key={idx}
                      className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 [dir=rtl]:flex-row-reverse">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="h-12 w-12 rounded-lg object-cover flex-shrink-0 border border-slate-200 dark:border-slate-700"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 border border-slate-200 dark:border-slate-700">
                            <ImageIcon className="h-5 w-5 text-slate-300 dark:text-slate-600" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{item.name}</p>
                          {itemAliases.length > 0 && (
                            <div className="mt-0.5">
                              {itemAliases.map(a => (
                                <div key={a.id} className="flex items-center gap-1 [dir=rtl]:flex-row-reverse">
                                  <Link2 className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                                  <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                    {a.alias_name}
                                    {a.store_name && <span className="text-slate-400"> ({a.store_name})</span>}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteAlias(a.id)}
                                    className="h-4 w-4 p-0 text-red-400 hover:text-red-600 flex-shrink-0 ms-1"
                                  >
                                    <Trash2 className="h-2.5 w-2.5" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Per-card attach button / inline input */}
                      {isAttaching ? (
                        <div className="mt-2 flex gap-1.5 items-center [dir=rtl]:flex-row-reverse">
                          <Input
                            value={attachCardInput}
                            onChange={(e) => setAttachCardInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleCardAttach(item.name); }}
                            placeholder={t.settingsTypeReceiptName}
                            className="flex-1 text-right text-xs h-7"
                            dir="rtl"
                            autoFocus
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCardAttach(item.name)}
                            disabled={!attachCardInput.trim()}
                            className="h-7 w-7 p-0 text-emerald-600"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setAttachCardItem(null); setAttachCardInput(''); }}
                            className="h-7 w-7 p-0 text-slate-400"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setAttachCardItem(item.name); setAttachCardInput(''); }}
                          className="mt-1.5 h-6 text-[11px] text-emerald-600 hover:text-emerald-700 px-1 w-full justify-start [dir=rtl]:justify-end"
                        >
                          <Plus className="h-3 w-3 me-0.5" />
                          {t.settingsAttachReceiptName}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Aliases / Matching Settings Section */}
      <Card>
        <CardHeader className="pb-3">
          <button
            onClick={() => setShowAliases(!showAliases)}
            className="flex items-center justify-between w-full text-right"
          >
            <CardTitle className="text-lg">{t.aliases} ({aliases.length})</CardTitle>
            {showAliases ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
          {showAliases && (
            <div className="flex items-center gap-2 mt-2 [dir=rtl]:flex-row-reverse">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="חפש התאמה..."
                  className="pr-10 text-right text-sm"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddForm(!showAddForm)}
                className="text-xs flex-shrink-0"
              >
                <Plus className="h-3 w-3 me-1" />
                {t.addAlias}
              </Button>
            </div>
          )}
        </CardHeader>
        {showAliases && (
          <CardContent className="space-y-3">
            {/* Add new alias form */}
            {showAddForm && (
              <div className="space-y-2 p-3 border border-emerald-200 dark:border-emerald-800 rounded-lg bg-emerald-50/50 dark:bg-emerald-900/10">
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 mb-2">{t.addAlias}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                    placeholder={`${t.storeName} (${t.settingsOptional})`}
                    className="text-right text-sm"
                    dir="rtl"
                  />
                </div>
                <div className="flex gap-2 [dir=rtl]:flex-row-reverse">
                  <Button
                    onClick={handleAddAlias}
                    disabled={adding || !newCanonical.trim() || !newAlias.trim()}
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
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

            {/* Aliases list grouped by canonical name */}
            {loadingAliases ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
              </div>
            ) : aliases.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">{t.noAliases}</p>
            ) : (
              <div className="space-y-2">
                {Array.from(grouped.entries()).map(([canonical, items]) => {
                  const personalItem = personalItems.find(p => p.name.toLowerCase() === canonical.toLowerCase());
                  return (
                    <div key={canonical} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                      <div className="bg-slate-50 dark:bg-slate-800 px-3 py-2 flex items-center gap-2 [dir=rtl]:flex-row-reverse">
                        {personalItem?.image_url ? (
                          <img
                            src={personalItem.image_url}
                            alt=""
                            className="h-6 w-6 rounded object-cover flex-shrink-0"
                          />
                        ) : null}
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {canonical}
                        </span>
                        <span className="text-xs text-slate-400">
                          ({items.length} {items.length === 1 ? t.settingsAlias : t.aliases})
                        </span>
                      </div>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {items.map(alias => (
                          <div key={alias.id} className="flex items-center justify-between px-3 py-2 [dir=rtl]:flex-row-reverse">
                            <div className="flex-1 min-w-0">
                              <span className="text-sm text-slate-600 dark:text-slate-400 block truncate">
                                {alias.alias_name}
                              </span>
                              {alias.store_name && (
                                <span className="text-xs text-slate-400 dark:text-slate-500">
                                  {alias.store_name}
                                </span>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteAlias(alias.id)}
                              className="h-7 w-7 p-0 text-red-500 hover:text-red-700 flex-shrink-0"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
