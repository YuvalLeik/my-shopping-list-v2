'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Calendar, Edit2, Check, X, Copy, ArrowRight, Receipt, Settings2 } from 'lucide-react';
import { fetchGroceryListsWithItemCount, GroceryListWithCount, duplicateGroceryList } from '@/lib/groceryLists';
import { duplicatePurchaseToNewList, PurchaseRecordWithItems } from '@/lib/purchaseRecords';
import { t } from '@/lib/translations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { TaskBarSection } from '@/components/TaskBarSection';
import { Dashboard } from '@/components/Dashboard';

interface SidebarProps {
  activeUserId: string | null;
  onUserChange: (userId: string) => void;
  selectedListId: string | null;
  onListSelect: (listId: string) => void;
  refreshTrigger?: number; // Add refresh trigger
  onListTitleUpdate?: (listId: string, newTitle: string) => Promise<void>; // Callback to update list title
  onListDuplicated?: (newListId: string, itemCount: number) => Promise<void>; // Callback when list is duplicated
  standalonePurchases?: PurchaseRecordWithItems[]; // Standalone (non-list-linked) purchase records
  viewingStandaloneId?: string | null; // Currently viewed standalone purchase id
  onStandaloneSelect?: (purchaseId: string) => void;
  onStandaloneDuplicated?: (newListId: string, itemCount: number) => Promise<void>; // Callback when standalone is copied to new list
  isOpen?: boolean; // For mobile drawer
  onClose?: () => void; // For mobile drawer
}

export function Sidebar({
  activeUserId,
  selectedListId,
  onListSelect,
  refreshTrigger,
  onListTitleUpdate,
  onListDuplicated,
  standalonePurchases = [],
  viewingStandaloneId = null,
  onStandaloneSelect,
  onStandaloneDuplicated,
  isOpen = false,
  onClose,
}: SidebarProps) {
  const [previousLists, setPreviousLists] = useState<GroceryListWithCount[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [updatingTitle, setUpdatingTitle] = useState(false);
  const [duplicatingListId, setDuplicatingListId] = useState<string | null>(null);
  const [duplicatingPurchaseId, setDuplicatingPurchaseId] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState({
    previousLists: true,
    standalonePurchases: true,
  });

  useEffect(() => {
    if (!activeUserId) {
      setPreviousLists([]);
      return;
    }

    async function loadLists() {
      if (!activeUserId) return;
      setLoadingLists(true);
      try {
        const lists = await fetchGroceryListsWithItemCount(activeUserId, true); // Include completed lists for sidebar
        // Filter to show only completed lists in sidebar
        const completedLists = lists.filter(list => list.completed_at !== null && list.completed_at !== undefined);
        setPreviousLists(completedLists);
      } catch (err) {
        console.error('Failed to load lists:', err);
      } finally {
        setLoadingLists(false);
      }
    }
    loadLists();
  }, [activeUserId, refreshTrigger]); // Add refreshTrigger to dependencies

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const handleStartEdit = (list: GroceryListWithCount, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering onListSelect
    setEditingListId(list.id);
    setEditingTitle(list.title || formatDate(list.created_at));
  };

  const handleCancelEdit = () => {
    setEditingListId(null);
    setEditingTitle('');
  };

  const handleSaveEdit = async (listId: string) => {
    if (!onListTitleUpdate || !editingTitle.trim()) {
      handleCancelEdit();
      return;
    }

    setUpdatingTitle(true);
    try {
      await onListTitleUpdate(listId, editingTitle.trim());
      // Update local state
      setPreviousLists(prevLists =>
        prevLists.map(list =>
          list.id === listId ? { ...list, title: editingTitle.trim() } : list
        )
      );
      setEditingListId(null);
      setEditingTitle('');
    } catch (err) {
      console.error('Failed to update list title:', err);
    } finally {
      setUpdatingTitle(false);
    }
  };

  const handleDuplicateList = async (listId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeUserId) return;

    setDuplicatingListId(listId);
    try {
      const result = await duplicateGroceryList(listId, activeUserId);
      if (onListDuplicated) {
        try {
          await onListDuplicated(result.list.id, result.itemCount);
        } catch {
          setDuplicatingListId(null);
          return;
        }
      }
      setDuplicatingListId(null);
    } catch (err) {
      setDuplicatingListId(null);
      toast.error('נכשל בשכפול הרשימה', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  };

  const handleDuplicatePurchase = async (purchaseId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeUserId || !onStandaloneDuplicated) return;

    setDuplicatingPurchaseId(purchaseId);
    try {
      const result = await duplicatePurchaseToNewList(purchaseId, activeUserId);
      try {
        await onStandaloneDuplicated(result.listId, result.itemCount);
      } catch {
        setDuplicatingPurchaseId(null);
        return;
      }
      setDuplicatingPurchaseId(null);
    } catch (err) {
      setDuplicatingPurchaseId(null);
      toast.error('נכשל בשכפול הקנייה', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  };

  // Previous Lists content component
  const PreviousListsContent = () => (
    <div className="p-4">
      {loadingLists ? (
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin text-emerald-600 dark:text-emerald-400" />
          <span className="text-sm">{t.loadingLists}</span>
        </div>
      ) : previousLists.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">{t.noLists}</p>
      ) : (
        <div className="space-y-2">
          {previousLists.map((list) => (
            <div
              key={list.id}
              className={`w-full border rounded-lg p-3 transition-colors ${
                selectedListId === list.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border hover:bg-accent'
              }`}
            >
              <div className="flex flex-col items-start w-full">
                <div className="flex items-center gap-2 w-full group">
                  <Calendar className="h-4 w-4 opacity-70 flex-shrink-0" />
                  {editingListId === list.id ? (
                    <div className="flex items-center gap-2 flex-1 [dir=rtl]:flex-row-reverse">
                      <Input
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSaveEdit(list.id);
                          } else if (e.key === 'Escape') {
                            handleCancelEdit();
                          }
                        }}
                        className="text-sm h-7 flex-1"
                        disabled={updatingTitle}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSaveEdit(list.id);
                        }}
                        disabled={updatingTitle}
                      >
                        {updatingTitle ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancelEdit();
                        }}
                        disabled={updatingTitle}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <span
                        className="text-sm font-medium flex-1 cursor-pointer hover:underline"
                        onClick={() => {
                          onListSelect(list.id);
                          // Close drawer on mobile when selecting a list
                          if (onClose) {
                            onClose();
                          }
                        }}
                      >
                        {list.title || formatDate(list.created_at)}
                      </span>
                      {onListTitleUpdate && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => handleStartEdit(list, e)}
                          title="ערוך כותרת"
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
                <div className="flex items-center justify-between w-full mt-1">
                  <span
                    className={`text-xs ${selectedListId === list.id ? 'opacity-80' : 'text-muted-foreground'}`}
                    onClick={() => {
                      onListSelect(list.id);
                      if (onClose) {
                        onClose();
                      }
                    }}
                  >
                    {list.item_count} {list.item_count === 1 ? t.item : 'פריטים'}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={(e) => handleDuplicateList(list.id, e)}
                    disabled={duplicatingListId === list.id}
                    title="שכפל לרשימה חדשה"
                  >
                    {duplicatingListId === list.id ? (
                      <>
                        <Loader2 className="h-3 w-3 me-1 animate-spin" />
                        <span>משכפל...</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3 me-1" />
                        <span className="hidden sm:inline">שכפל</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const StandalonePurchasesContent = () => (
    <div className="p-4">
      {standalonePurchases.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">{t.noStandalonePurchases}</p>
      ) : (
        <div className="space-y-2">
          {standalonePurchases.map((record) => (
            <div
              key={record.id}
              className={`w-full border rounded-lg p-3 transition-colors ${
                viewingStandaloneId === record.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border hover:bg-accent'
              }`}
            >
              <div className="flex flex-col items-start w-full">
                <div className="flex items-center gap-2 w-full group">
                  <Receipt className="h-4 w-4 opacity-70 flex-shrink-0" />
                  <span
                    className="text-sm font-medium flex-1 cursor-pointer hover:underline"
                    onClick={() => {
                      onStandaloneSelect?.(record.id);
                      if (onClose) onClose();
                    }}
                  >
                    {record.store_name || t.importPurchase} ({record.purchase_date ? new Date(record.purchase_date).toLocaleDateString('he-IL') : ''})
                  </span>
                </div>
                <div className="flex items-center justify-between w-full mt-1">
                  <span
                    className={`text-xs ${viewingStandaloneId === record.id ? 'opacity-80' : 'text-muted-foreground'}`}
                    onClick={() => {
                      onStandaloneSelect?.(record.id);
                      if (onClose) onClose();
                    }}
                  >
                    {record.items.length} {record.items.length === 1 ? t.item : 'פריטים'}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={(e) => handleDuplicatePurchase(record.id, e)}
                    disabled={duplicatingPurchaseId === record.id}
                    title="שכפל לרשימה חדשה"
                  >
                    {duplicatingPurchaseId === record.id ? (
                      <>
                        <Loader2 className="h-3 w-3 me-1 animate-spin" />
                        <span>משכפל...</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3 me-1" />
                        <span className="hidden sm:inline">שכפל</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Task Bar content component (reusable for desktop and mobile)
  // This component renders collapsible sections: Dashboard link and Previous Lists
  const SidebarContent = () => {
    if (!activeUserId) {
      return (
        <div className="h-full flex flex-col bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm overflow-y-auto p-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">יש לבחור משתמש</p>
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm overflow-y-auto">
        {/* Dashboard Link Section */}
        <div className="border-b border-slate-200/50 dark:border-slate-800/50">
          {activeUserId ? (
            <a
              href={`/dashboard?userId=${activeUserId}`}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors [dir=rtl]:flex-row-reverse"
            >
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Dashboard</h3>
              <ArrowRight className="h-4 w-4 text-slate-600 dark:text-slate-400 flex-shrink-0" />
            </a>
          ) : (
            <div className="w-full flex items-center justify-between p-4 opacity-50 cursor-not-allowed">
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Dashboard</h3>
              <ArrowRight className="h-4 w-4 text-slate-600 dark:text-slate-400 flex-shrink-0" />
            </div>
          )}
        </div>

        {/* Previous Lists Section */}
        <TaskBarSection
          title={`${t.previousLists} (${previousLists.length})`}
          isExpanded={expandedSections.previousLists}
          onToggle={() => setExpandedSections(prev => ({ ...prev, previousLists: !prev.previousLists }))}
        >
          <PreviousListsContent />
        </TaskBarSection>

        <TaskBarSection
          title={`${t.standalonePurchases} (${standalonePurchases.length})`}
          isExpanded={expandedSections.standalonePurchases}
          onToggle={() => setExpandedSections(prev => ({ ...prev, standalonePurchases: !prev.standalonePurchases }))}
        >
          <StandalonePurchasesContent />
        </TaskBarSection>

        {/* Settings Section */}
        {activeUserId && (
          <div className="border-t border-slate-200/50 dark:border-slate-800/50">
            <a
              href={`/settings?userId=${activeUserId}`}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors [dir=rtl]:flex-row-reverse"
            >
              <div className="flex items-center gap-2 [dir=rtl]:flex-row-reverse">
                <Settings2 className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{t.settings}</h3>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-600 dark:text-slate-400 flex-shrink-0" />
            </a>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Desktop Sidebar - Fixed */}
      <aside className="hidden md:flex w-64 h-screen sticky top-0 flex-col border-l border-r border-slate-200/50 dark:border-slate-800/50 shadow-lg [dir=rtl]:border-l-0 [dir=ltr]:border-r-0">
        <SidebarContent />
      </aside>

      {/* Mobile Drawer */}
      <Drawer open={isOpen} onOpenChange={(open) => {
        console.log('[Sidebar] Drawer onOpenChange:', open, 'isOpen:', isOpen);
        if (!open && onClose) {
          onClose();
        }
      }}>
        <DrawerContent side="right" className="p-0 border-0 z-[100]">
          <SidebarContent />
        </DrawerContent>
      </Drawer>
    </>
  );
}
