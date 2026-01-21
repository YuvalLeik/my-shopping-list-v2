'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Calendar, Edit2, Check, X, Copy } from 'lucide-react';
import { fetchGroceryListsWithItemCount, GroceryListWithCount, duplicateGroceryList } from '@/lib/groceryLists';
import { t } from '@/lib/translations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface SidebarProps {
  activeUserId: string | null;
  onUserChange: (userId: string) => void;
  selectedListId: string | null;
  onListSelect: (listId: string) => void;
  refreshTrigger?: number; // Add refresh trigger
  onListTitleUpdate?: (listId: string, newTitle: string) => Promise<void>; // Callback to update list title
  onListDuplicated?: (newListId: string, itemCount: number) => Promise<void>; // Callback when list is duplicated
}

export function Sidebar({ activeUserId, onUserChange, selectedListId, onListSelect, refreshTrigger, onListTitleUpdate, onListDuplicated }: SidebarProps) {
  const [previousLists, setPreviousLists] = useState<GroceryListWithCount[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [updatingTitle, setUpdatingTitle] = useState(false);
  const [duplicatingListId, setDuplicatingListId] = useState<string | null>(null);

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
    e.stopPropagation(); // Prevent triggering onListSelect
    if (!activeUserId) {
      return;
    }

    setDuplicatingListId(listId);
    try {
      const result = await duplicateGroceryList(listId, activeUserId);
      if (onListDuplicated) {
        try {
          await onListDuplicated(result.list.id, result.itemCount);
        } catch (callbackErr) {
          // Callback handles its own errors, just reset state
          setDuplicatingListId(null);
          return;
        }
      }
      // Reset state after successful duplication
      setDuplicatingListId(null);
    } catch (err) {
      // Reset state on error
      setDuplicatingListId(null);
      // Show error toast
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error('נכשל בשכפול הרשימה', {
        description: errorMessage,
      });
    }
  };

  return (
    <aside className="hidden md:flex w-64 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm h-screen sticky top-0 flex-col border-l border-r border-slate-200/50 dark:border-slate-800/50 shadow-lg [dir=rtl]:border-l-0 [dir=ltr]:border-r-0 overflow-y-auto">
      {/* Previous Lists */}
      {activeUserId && (
        <div className="p-4 border-b border-slate-200/50 dark:border-slate-800/50 flex-1 overflow-y-auto">
          <h2 className="text-lg font-semibold mb-4 text-slate-800 dark:text-slate-100">
            {t.previousLists} ({previousLists.length})
          </h2>
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
                            onClick={() => onListSelect(list.id)}
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
                        onClick={() => onListSelect(list.id)}
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
      )}

    </aside>
  );
}
