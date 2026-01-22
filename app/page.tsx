'use client';

import { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import { fetchGroceryLists, createGroceryList, deleteGroceryList, markListAsCompleted, updateGroceryListTitle, GroceryList } from '@/lib/groceryLists';
import { fetchGroceryItems, createGroceryItem, deleteGroceryItem, updateGroceryItem, getAllItemNames, getItemCategoryByName, GroceryItem } from '@/lib/groceryItems';
import { uploadItemImage } from '@/lib/storage';
import { getShoppingItemByName, upsertShoppingItemImageByName, normalizeItemName } from '@/lib/shoppingItems';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, ShoppingCart, List, Plus, Trash2, Upload, Minus, CheckCircle2, X, Bot, Camera, ChevronDown, ChevronUp, User, Menu } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { AssistantPanel } from '@/app/components/AssistantPanel';
import { t } from '@/lib/translations';
import { fetchLocalUsers, LocalUser } from '@/lib/localUsers';

const CATEGORIES = [
  'ללא קטגוריה',
  'מזווה',
  'ירקות ופירות',
  'מוצרי חלב וביצים',
  'בשר ודגים',
  'משקאות',
  'מוצרי ניקיון והיגיינה',
  'קפואים',
  'אחר',
];

export default function Home() {
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [activeUserName, setActiveUserName] = useState<string | null>(null);
  const [users, setUsers] = useState<LocalUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [lists, setLists] = useState<GroceryList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('ללא קטגוריה');
  const [newItemQuantity, setNewItemQuantity] = useState(1);
  const [loadingLists, setLoadingLists] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [deletingListId, setDeletingListId] = useState<string | null>(null);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [allItemNames, setAllItemNames] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [completingListId, setCompletingListId] = useState<string | null>(null);
  const [purchasedItemsExpanded, setPurchasedItemsExpanded] = useState(false);
  const [sidebarRefreshTrigger, setSidebarRefreshTrigger] = useState(0);
  const [viewingPreviousListId, setViewingPreviousListId] = useState<string | null>(null);
  const [previousListItems, setPreviousListItems] = useState<GroceryItem[]>([]);
  const [loadingPreviousItems, setLoadingPreviousItems] = useState(false);
  const [showDeletePreviousDialog, setShowDeletePreviousDialog] = useState(false);
  const [listToDelete, setListToDelete] = useState<string | null>(null);
  const [editingListTitle, setEditingListTitle] = useState(false);
  const [listTitle, setListTitle] = useState('');
  const [updatingListTitle, setUpdatingListTitle] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingImageForItem, setUploadingImageForItem] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const newItemNameInputRef = useRef<HTMLInputElement | null>(null);
  const addItemFormRef = useRef<HTMLDivElement | null>(null);
  const [showFab, setShowFab] = useState(false);
  const [sortMode, setSortMode] = useState<'category' | 'alpha'>('category');
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Load all item names for autocomplete from global catalog (shopping_items)
  // This is shared across all users for learning/suggestions
  useEffect(() => {
    if (!activeUserId) {
      setAllItemNames([]);
      return;
    }

    const userId = activeUserId;
    async function loadItemNames() {
      try {
        const names = await getAllItemNames(userId);
        setAllItemNames(names);
      } catch (err) {
        // Silently fail - autocomplete is not critical
      }
    }
    loadItemNames();
  }, [activeUserId]);

  // Load users and active user name
  useEffect(() => {
    async function loadUsers() {
      try {
        const loadedUsers = await fetchLocalUsers();
        setUsers(loadedUsers);
        
        // Load active user from localStorage if not set
        if (!activeUserId && loadedUsers.length > 0) {
          const storedUserId = localStorage.getItem('active_user_id');
          if (storedUserId && loadedUsers.find(u => u.id === storedUserId)) {
            setActiveUserId(storedUserId);
          } else {
            // Auto-select first user if none selected
            setActiveUserId(loadedUsers[0].id);
            localStorage.setItem('active_user_id', loadedUsers[0].id);
          }
        }
        
        // Update active user name if user is selected
        if (activeUserId) {
          const activeUser = loadedUsers.find(u => u.id === activeUserId);
          setActiveUserName(activeUser?.name || null);
        }
      } catch (err) {
        console.error('Failed to load users:', err);
      } finally {
        setLoadingUsers(false);
      }
    }
    loadUsers();
  }, [activeUserId]);

  // Update active user name when activeUserId changes
  useEffect(() => {
    if (!activeUserId) {
      setActiveUserName(null);
      return;
    }
    const activeUser = users.find(u => u.id === activeUserId);
    setActiveUserName(activeUser?.name || null);
  }, [activeUserId, users]);

  // Reset state when user changes (BEFORE loading new lists)
  useEffect(() => {
    // Immediately reset all user-specific state
    setSelectedListId(null);
    setItems([]);
    setLists([]);
    setListTitle('');
    setNewItemName('');
    setNewItemCategory('ללא קטגוריה');
    setNewItemQuantity(1);
    setSelectedImageFile(null);
    setImagePreview(null);
    setShowSuggestions(false);
  }, [activeUserId]);

  // Load lists when active user changes
  useEffect(() => {
    if (!activeUserId) {
      return;
    }

    const userId = activeUserId;
    setLoadingLists(true);
    async function loadLists() {
      try {
        const loadedLists = await fetchGroceryLists(userId);
        setLists(loadedLists);
        // Always select the first active list
        if (loadedLists.length > 0) {
          setSelectedListId(loadedLists[0].id);
          setListTitle(loadedLists[0].title);
        } else {
          // If no active lists, create a new one with default title automatically
          try {
            const defaultTitle = 'רשימה חדשה';
            const newList = await createGroceryList(userId, defaultTitle);
            setLists([newList]);
            setSelectedListId(newList.id);
            setListTitle(newList.title);
          } catch (createErr) {
            // Failed to create default list - error already shown via toast
            toast.error('נכשל ביצירת רשימה חדשה', {
              description: createErr instanceof Error ? createErr.message : 'Unknown error',
            });
            setSelectedListId(null);
            setListTitle('');
          }
        }
      } catch (err) {
        toast.error(t.failedToLoadLists, {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      } finally {
        setLoadingLists(false);
      }
    }
    loadLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUserId]);

  // Load items when selected list changes
  useEffect(() => {
    if (!selectedListId) {
      setItems([]);
      return;
    }

    const listId = selectedListId;
    setLoadingItems(true);
    async function loadItems() {
      if (!activeUserId) {
        setItems([]);
        setLoadingItems(false);
        return;
      }
      
      const userId = activeUserId;
      try {
        const loadedItems = await fetchGroceryItems(listId, userId);
        setItems(loadedItems);
      } catch (err) {
        toast.error(t.failedToLoadItems, {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      } finally {
        setLoadingItems(false);
      }
    }
    loadItems();
  }, [selectedListId]);

  // Filter suggestions based on input
  useEffect(() => {
    if (newItemName.trim().length > 0) {
      const filtered = allItemNames.filter(name =>
        name.toLowerCase().includes(newItemName.toLowerCase())
      );
      setFilteredSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setFilteredSuggestions([]);
      setShowSuggestions(false);
    }
  }, [newItemName, allItemNames]);

  // Handle scroll for FAB visibility
  useEffect(() => {
    const handleScroll = () => {
      setShowFab(window.scrollY > 200);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedListId || !newItemName.trim() || !activeUserId) return;

    const userId = activeUserId;
    const itemName = newItemName.trim();
    
    // Step 0: Verify that selectedListId belongs to activeUserId
    try {
      const listBelongsToUser = lists.find(l => l.id === selectedListId && l.local_user_id === userId);
      if (!listBelongsToUser) {
        toast.error('רשימה לא נמצאה או שאין לך גישה אליה', { duration: 3000 });
        setSelectedListId(null);
        return;
      }
    } catch (verifyErr) {
      toast.error('שגיאה באימות הרשימה', {
        description: verifyErr instanceof Error ? verifyErr.message : 'Unknown error',
        duration: 3000,
      });
      return;
    }
    
    setAddingItem(true);
    
    try {
      // Step 0.5: Normalize and check for duplicates
      const normalizedNewName = normalizeItemName(itemName);
      const existingItem = items.find(item => {
        if (item.list_id !== selectedListId) return false;
        const normalizedExistingName = normalizeItemName(item.name);
        return normalizedExistingName === normalizedNewName;
      });
      
      if (existingItem) {
        toast.error('הפריט כבר קיים', { duration: 2000 });
        setAddingItem(false);
        return;
      }
      
      // Determine category
      let categoryToUse = newItemCategory;
      if (categoryToUse === 'ללא קטגוריה') {
        const foundCategory = await getItemCategoryByName(itemName, userId);
        if (foundCategory) {
          categoryToUse = foundCategory;
        }
      }

      let imageUrl: string | null = null;
      
      // Step 1: Check global catalog for existing image (before creating item)
      if (!selectedImageFile) {
        const shoppingItem = await getShoppingItemByName(itemName);
        if (shoppingItem?.image_url) {
          imageUrl = shoppingItem.image_url;
        }
      }
      
      // Step 1: Create item in user's list FIRST (critical - per-user)
      // This must succeed before any global catalog updates
      let newItem: GroceryItem;
      try {
        newItem = await createGroceryItem(
          selectedListId,
          itemName,
          newItemQuantity,
          categoryToUse,
          imageUrl
        );
      } catch (createError) {
        toast.error('לא הצלחתי להוסיף לרשימה שלך', {
          description: createError instanceof Error ? createError.message : 'שגיאה לא ידועה',
          duration: 4000,
        });
        throw createError; // Fail - item not added to user's list
      }
      
      // Step 2: Handle image upload if selected (AFTER item creation succeeded)
      if (selectedImageFile) {
        setUploadingImage(true);
        try {
          const { publicUrl } = await uploadItemImage(selectedImageFile, newItem.id, false);
          
          // Update grocery_items with image
          try {
            const updatedItem = await updateGroceryItem(newItem.id, { image_url: publicUrl });
            newItem = updatedItem; // Update local reference
          } catch (updateError) {
            // Image uploaded but couldn't update DB - not critical, continue
          }
          
          // Save to global catalog (AFTER item exists in user's list)
          // This is done asynchronously and silently - don't fail if it doesn't work
          upsertShoppingItemImageByName(itemName, publicUrl).catch(() => {
            // Silently fail - catalog save is not critical, item is in user's list
          });
        } catch (imageError) {
          toast.error('נכשל בהעלאת התמונה', {
            description: imageError instanceof Error ? imageError.message : 'שגיאה לא ידועה',
            duration: 3000,
          });
          // Continue - item was created successfully, image upload failure is not critical
        } finally {
          setUploadingImage(false);
        }
      }
      
      // Step 3: Refresh items from DB to ensure consistency
      try {
        const loadedItems = await fetchGroceryItems(selectedListId, userId);
        setItems(loadedItems);
      } catch (refreshError) {
        // Refresh failed - still update state with the item we created
        setItems((prev) => [newItem, ...prev.filter(i => i.id !== newItem.id)]);
      }
      
      // Cleanup form
      setNewItemName('');
      setNewItemCategory('ללא קטגוריה');
      setNewItemQuantity(1);
      setSelectedImageFile(null);
      setImagePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setShowSuggestions(false);
      
      // Final success message
      toast.success(t.itemAdded, {
        description: t.itemAddedDescription(newItem.name),
      });
    } catch (err) {
      toast.error('לא הצלחתי להוסיף לרשימה שלך', {
        description: err instanceof Error ? err.message : 'שגיאה לא ידועה',
        duration: 4000,
      });
    } finally {
      setAddingItem(false);
    }
  };

  const handleSelectSuggestion = async (suggestion: string) => {
    if (!activeUserId) return;
    
    const userId = activeUserId;
    setNewItemName(suggestion);
    setShowSuggestions(false);
    
    // Try to find category for this item (user's items only)
    try {
      const foundCategory = await getItemCategoryByName(suggestion, userId);
      if (foundCategory) {
        setNewItemCategory(foundCategory);
      }
    } catch (err) {
      // Failed to get category - keep current category
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    setDeletingItemId(itemId);
    try {
      await deleteGroceryItem(itemId);
      setItems(items.filter(i => i.id !== itemId));
      toast.success(t.itemDeleted, {
        description: item ? t.itemDeletedDescription(item.name) : t.itemDeletedDescription('Item'),
      });
    } catch (err) {
      toast.error(t.failedToDeleteItem, {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setDeletingItemId(null);
    }
  };

  const handleUpdateItemImage = async (itemId: string, file: File) => {
    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('הקובץ גדול מדי', {
        description: 'גודל מקסימלי: 5MB',
      });
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('סוג קובץ לא תקין', {
        description: 'יש לבחור קובץ תמונה בלבד',
      });
      return;
    }

    // Find item to get its name
    const item = items.find(i => i.id === itemId);
    if (!item) {
      toast.error('פריט לא נמצא', { duration: 2000 });
      return;
    }

    setUploadingImageForItem(itemId);
    try {
      const { publicUrl } = await uploadItemImage(file, itemId, true);
      
      // Save to shopping_items catalog (source of truth)
      await upsertShoppingItemImageByName(item.name, publicUrl);
      
      // Update grocery_items to display immediately
      const updatedItem = await updateGroceryItem(itemId, { image_url: publicUrl });
      setItems((prev) => [updatedItem, ...prev.filter(i => i.id !== updatedItem.id)]);
      
      toast.success('תמונה עודכנה בהצלחה', { duration: 2000 });
    } catch (err) {
      toast.error('נכשל בעדכון התמונה', {
        description: err instanceof Error ? err.message : 'שגיאה לא ידועה',
      });
    } finally {
      setUploadingImageForItem(null);
    }
  };

  const handleListSelect = (listId: string) => {
    // This is for previous lists - show them alongside, not replace
    setViewingPreviousListId(listId);
    // Load items for the previous list
    setLoadingPreviousItems(true);
    fetchGroceryItems(listId)
      .then(items => {
        setPreviousListItems(items);
      })
      .catch(err => {
        toast.error(t.failedToLoadItems, {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      })
      .finally(() => {
        setLoadingPreviousItems(false);
      });
  };

  const handleClosePreviousList = () => {
    setViewingPreviousListId(null);
    setPreviousListItems([]);
  };

  const handleDeletePreviousList = async () => {
    if (!listToDelete || !activeUserId) return;
    
    try {
      await deleteGroceryList(listToDelete, activeUserId);
      if (viewingPreviousListId === listToDelete) {
        setViewingPreviousListId(null);
        setPreviousListItems([]);
      }
      setListToDelete(null);
      setShowDeletePreviousDialog(false);
      setSidebarRefreshTrigger(prev => prev + 1);
      toast.success(t.listDeleted);
    } catch (err) {
      toast.error(t.failedToDeleteList, {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  };

  const handleMarkListCompleted = async () => {
    if (!selectedListId || !activeUserId) return;

    setCompletingListId(selectedListId);
    setShowCompleteDialog(false);
    
    try {
      // Mark current list as completed
      await markListAsCompleted(selectedListId, activeUserId);
      
      // Create a new empty list with default title
      const defaultTitle = 'רשימה חדשה';
      const newList = await createGroceryList(activeUserId, defaultTitle);
      
      // Remove completed list from active lists and add new list
      const updatedLists = [newList, ...lists.filter(l => l.id !== selectedListId)];
      setLists(updatedLists);
      
      // Always select the new list
      setSelectedListId(newList.id);
      setListTitle(newList.title);
      setItems([]);
      
      // Close any previous list view
      setViewingPreviousListId(null);
      setPreviousListItems([]);
      
      // Refresh sidebar immediately and again after a delay to ensure DB update is complete
      setSidebarRefreshTrigger(prev => prev + 1);
      setTimeout(() => {
        setSidebarRefreshTrigger(prev => prev + 1);
      }, 1000);
      
      toast.success(t.listMarkedCompleted);
    } catch (err) {
      toast.error(t.failedToMarkCompleted, {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setCompletingListId(null);
    }
  };

  const handleUpdateListTitle = async () => {
    if (!selectedListId || !listTitle.trim() || !activeUserId) return;

    setUpdatingListTitle(true);
    try {
      const updatedList = await updateGroceryListTitle(selectedListId, listTitle.trim(), activeUserId);
      
      // Update the list in the lists array
      setLists(lists.map(l => l.id === selectedListId ? updatedList : l));
      
      setEditingListTitle(false);
      toast.success('שם הרשימה עודכן בהצלחה');
    } catch (err) {
      toast.error('נכשל בעדכון שם הרשימה', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setUpdatingListTitle(false);
    }
  };

  const handleQuantityChange = async (item: GroceryItem, delta: number) => {
    const newQuantity = Math.max(1, item.quantity + delta);
    if (newQuantity === item.quantity) return;

    setUpdatingItemId(item.id);
    try {
      const updatedItem = await updateGroceryItem(item.id, { quantity: newQuantity });
      setItems((prev) => [updatedItem, ...prev.filter(i => i.id !== updatedItem.id)]);
    } catch (err) {
      toast.error(t.failedToAddItem, {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleTogglePurchased = async (item: GroceryItem) => {
    const itemId = item.id;
    setUpdatingItemId(itemId);
    try {
      const updatedItem = await updateGroceryItem(itemId, { purchased: !item.purchased });
      setItems((prev) => [updatedItem, ...prev.filter(i => i.id !== updatedItem.id)]);
    } catch (err) {
      toast.error('נכשל בעדכון סטטוס הפריט', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setUpdatingItemId(null);
    }
  };

  return (
    <div className="min-h-screen flex bg-white dark:bg-slate-950">
      {/* Sidebar */}
      <Sidebar 
        activeUserId={activeUserId} 
        onUserChange={setActiveUserId}
        selectedListId={viewingPreviousListId} // Show which previous list is being viewed
        onListSelect={handleListSelect}
        refreshTrigger={sidebarRefreshTrigger}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onListTitleUpdate={async (listId: string, newTitle: string) => {
          if (!activeUserId) return;
          try {
            await updateGroceryListTitle(listId, newTitle, activeUserId);
            // Refresh sidebar to show updated title
            setSidebarRefreshTrigger(prev => prev + 1);
            toast.success('שם הרשימה עודכן בהצלחה');
          } catch (err) {
            toast.error('נכשל בעדכון שם הרשימה', {
              description: err instanceof Error ? err.message : 'Unknown error',
            });
            throw err; // Re-throw to let Sidebar handle it
          }
        }}
        onListDuplicated={async (newListId: string, itemCount: number) => {
          if (!activeUserId) return;
          try {
            // Show success message for list creation
            toast.info('נוצרה רשימה חדשה');
            
            // Refresh lists to show the new duplicated list
            setSidebarRefreshTrigger(prev => prev + 1);
            
            // Load the new list's title
            const updatedLists = await fetchGroceryLists(activeUserId);
            const newList = updatedLists.find(l => l.id === newListId);
            if (newList) {
              setLists(updatedLists);
              setListTitle(newList.title);
            }
            
            // Show success message for items duplication
            if (itemCount > 0) {
              toast.info(`הועתקו ${itemCount} פריטים`);
            }
            
            // Switch to the new list
            setSelectedListId(newListId);
            // Close any previous list view
            setViewingPreviousListId(null);
            setPreviousListItems([]);
            
            // Final success message
            toast.success('הרשימה שוכפלה בהצלחה');
          } catch (err) {
            // Show error toast with detailed message
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            toast.error('נכשל בשכפול הרשימה', {
              description: errorMessage,
            });
            // Don't re-throw - we've handled the error display
          }
        }}
      />

      {/* Main Content */}
      <div className="flex-1 relative min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 dark:from-slate-950 dark:to-slate-900">
        {/* Top Bar */}
        <div className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-200/50 dark:border-slate-800/50">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              {/* Right side - Title with Mobile Toggle Button */}
              <div className="flex-1 relative">
                {/* Mobile Hamburger Toggle Button - absolute positioning במובייל, מצד ימין למעלה */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="absolute top-0 right-0 md:hidden z-50 flex-shrink-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 p-2"
                  title="רשימות קודמות"
                >
                  <Menu className="h-5 w-5" />
                </Button>
                
                {/* Title - עם padding מימין במובייל כדי לא להסתיר את הכפתור */}
                <div className="text-right pr-12 md:pr-0">
                  <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">
                    רשימות קניות
                  </h1>
                  {activeUserName && (
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                      משתמש: {activeUserName}
                    </p>
                  )}
                </div>
              </div>
              
              {/* Left side - User Selector */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* User Selector - מוסתר במובייל, מופיע בדסקטופ */}
                <div className="hidden md:flex flex-shrink-0 items-center">
                {loadingUsers ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-600 dark:text-emerald-400" />
                  </div>
                ) : users.length === 0 ? (
                  <div className="px-3 py-2 rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm text-sm text-slate-600 dark:text-slate-400">
                    אין משתמשים
                  </div>
                ) : activeUserId ? (
                  <Select
                    value={activeUserId}
                    onValueChange={(userId) => {
                      setActiveUserId(userId);
                      localStorage.setItem('active_user_id', userId);
                    }}
                  >
                    <SelectTrigger className="flex items-center gap-2 rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors [dir=rtl]:flex-row-reverse w-auto md:min-w-[160px]">
                      <User className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                      <div className="flex flex-col items-start [dir=rtl]:items-end">
                        <span className="text-xs text-slate-500 dark:text-slate-400 leading-none">משתמש</span>
                        <SelectValue className="text-sm font-medium text-slate-900 dark:text-slate-50 leading-tight" />
                      </div>
                      <ChevronDown className="h-4 w-4 text-slate-500 dark:text-slate-400 flex-shrink-0 [dir=rtl]:mr-auto [dir=ltr]:ml-auto" />
                    </SelectTrigger>
                    <SelectContent position="popper" className="z-[100] min-w-[200px]">
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        <main className={`relative z-0 container mx-auto px-6 py-8 max-w-5xl`}>

          <div className={`grid gap-6 ${viewingPreviousListId ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {/* Active List - Always shown */}
            {activeUserId && selectedListId && (
              <div className="space-y-6">
                {/* Add New Item Form */}
                <Card ref={addItemFormRef} className="shadow-md border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <CardHeader>
                    <CardTitle className="text-lg text-slate-900 dark:text-slate-50 text-right">
                      {t.addNewItem}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleAddItem} className="space-y-4">
                      {/* Item Name with Autocomplete */}
                      <div className="relative">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block text-right">
                          {t.itemName}
                        </label>
                        <Input
                          ref={newItemNameInputRef}
                          type="text"
                          value={newItemName}
                          onChange={(e) => setNewItemName(e.target.value)}
                          onFocus={() => {
                            if (newItemName.trim().length > 0 && filteredSuggestions.length > 0) {
                              setShowSuggestions(true);
                            }
                          }}
                          onBlur={() => {
                            // Delay to allow click on suggestion
                            setTimeout(() => setShowSuggestions(false), 200);
                          }}
                          placeholder={t.itemName}
                          className="w-full text-right"
                          disabled={addingItem}
                        />
                        {showSuggestions && filteredSuggestions.length > 0 && (
                          <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                            {filteredSuggestions.map((suggestion, index) => (
                              <button
                                key={index}
                                type="button"
                                onClick={() => handleSelectSuggestion(suggestion)}
                                className="w-full text-right px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors first:rounded-t-lg last:rounded-b-lg"
                              >
                                <span className="text-slate-700 dark:text-slate-200">{suggestion}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Category */}
                      <div>
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block text-right">
                          קטגוריה
                        </label>
                        <Select 
                          value={newItemCategory} 
                          onValueChange={setNewItemCategory}
                          disabled={addingItem}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue className="text-right" />
                          </SelectTrigger>
                          <SelectContent side="bottom">
                            {CATEGORIES.map((cat) => (
                              <SelectItem key={cat} value={cat} className="text-right">
                                {cat}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Image */}
                      <div>
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block text-right">
                          תמונה (אופציונלי)
                        </label>
                        <div className="space-y-2">
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0] ?? null;
                              if (file) {
                                // Validate file size (5MB max)
                                const maxSize = 5 * 1024 * 1024; // 5MB in bytes
                                if (file.size > maxSize) {
                                  toast.error('הקובץ גדול מדי', {
                                    description: 'גודל מקסימלי: 5MB',
                                  });
                                  if (fileInputRef.current) fileInputRef.current.value = '';
                                  return;
                                }
                                
                                // Validate file type
                                if (!file.type.startsWith('image/')) {
                                  toast.error('סוג קובץ לא תקין', {
                                    description: 'יש לבחור קובץ תמונה בלבד',
                                  });
                                  if (fileInputRef.current) fileInputRef.current.value = '';
                                  return;
                                }
                                
                                setSelectedImageFile(file);
                                // Create preview
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  setImagePreview(reader.result as string);
                                };
                                reader.readAsDataURL(file);
                              } else {
                                setSelectedImageFile(null);
                                setImagePreview(null);
                              }
                              // Reset input value to allow selecting the same file again
                              if (fileInputRef.current) fileInputRef.current.value = '';
                            }}
                            disabled={addingItem || uploadingImage}
                            className="w-full text-sm"
                          />
                          {imagePreview && (
                            <div className="relative inline-block">
                              <img
                                src={imagePreview}
                                alt="Preview"
                                className="w-24 h-24 object-cover rounded border border-slate-200 dark:border-slate-700"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedImageFile(null);
                                  setImagePreview(null);
                                }}
                                disabled={addingItem || uploadingImage}
                                className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600 disabled:opacity-50"
                                title="הסר תמונה"
                              >
                                ×
                              </button>
                            </div>
                          )}
                          {uploadingImage && (
                            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>מעלה תמונה...</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Add Button */}
                      <Button
                        type="submit"
                        disabled={addingItem || uploadingImage || !newItemName.trim()}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        {addingItem ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin me-2" />
                            {t.adding}
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4 me-2" />
                            {t.add}
                          </>
                        )}
                      </Button>
                    </form>
                  </CardContent>
                </Card>

                {/* My List */}
                <Card className="shadow-md border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-4 [dir=rtl]:flex-row-reverse mb-4">
                      <div className="flex-1 flex items-center gap-2 [dir=rtl]:flex-row-reverse">
                        <CardTitle className="text-lg text-slate-900 dark:text-slate-50 text-right">
                          {t.myList}
                        </CardTitle>
                        {editingListTitle ? (
                          <div className="flex items-center gap-2 flex-1 [dir=rtl]:flex-row-reverse">
                            <Input
                              value={listTitle}
                              onChange={(e) => setListTitle(e.target.value)}
                              onBlur={handleUpdateListTitle}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleUpdateListTitle();
                                } else if (e.key === 'Escape') {
                                  setEditingListTitle(false);
                                  const selectedList = lists.find(l => l.id === selectedListId);
                                  if (selectedList) {
                                    setListTitle(selectedList.title);
                                  }
                                }
                              }}
                              className="text-right flex-1"
                              disabled={updatingListTitle}
                              autoFocus
                            />
                            {updatingListTitle && (
                              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                            )}
                          </div>
                        ) : (
                          <div 
                            className="flex-1 text-right text-slate-600 dark:text-slate-400 cursor-pointer hover:text-slate-900 dark:hover:text-slate-200 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                            onClick={() => setEditingListTitle(true)}
                            title="לחץ לעריכת שם הרשימה"
                          >
                            {listTitle || 'רשימה ללא שם'}
                          </div>
                        )}
                      </div>
                      <Button
                        onClick={() => setShowCompleteDialog(true)}
                        className="bg-green-600 hover:bg-green-700 text-white [dir=rtl]:flex-row-reverse"
                        disabled={completingListId !== null}
                      >
                        {completingListId ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin me-2" />
                            {t.markListCompleted}
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-4 w-4 me-2" />
                            {t.markListCompleted}
                          </>
                        )}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {loadingItems ? (
                      <div className="flex items-center justify-center py-8 text-slate-600 dark:text-slate-400">
                        <Loader2 className="h-5 w-5 animate-spin me-2 text-emerald-600 dark:text-emerald-400" />
                        <span>{t.loadingItems}</span>
                      </div>
                    ) : items.length === 0 ? (
                      <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                        <CardContent className="text-center py-12 [dir=rtl]:text-right">
                          <ShoppingCart className="h-16 w-16 mx-auto mb-4 opacity-50 text-slate-400 dark:text-slate-500" />
                          <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
                            הרשימה ריקה
                          </h3>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                            הוסף פריטים כדי להתחיל
                          </p>
                          <div className="flex flex-col sm:flex-row gap-3 justify-center [dir=rtl]:flex-row-reverse">
                            <Button
                              onClick={() => newItemNameInputRef.current?.focus()}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              <Plus className="h-4 w-4 me-2" />
                              הוסף פריט
                            </Button>
                            <Button
                              onClick={() => {
                                setShowAssistant(true);
                              }}
                              variant="outline"
                              className="border-slate-300 dark:border-slate-600"
                            >
                              <Bot className="h-4 w-4 me-2" />
                              שאל את העוזר
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (() => {
                      // Filter items by search query
                      const normalizedQuery = searchQuery.trim().toLowerCase();
                      const filteredItems = items.filter(item => {
                        if (!normalizedQuery) return true;
                        const normalizedName = item.name.trim().toLowerCase();
                        return normalizedName.includes(normalizedQuery);
                      });
                      
                      // Separate items into not purchased and purchased
                      const notPurchasedItems = filteredItems.filter(item => !item.purchased);
                      const purchasedItems = filteredItems.filter(item => item.purchased);
                      
                      // Sort function for items by name (Hebrew alphabetical)
                      const sortByName = (a: GroceryItem, b: GroceryItem) => {
                        return a.name.localeCompare(b.name, 'he');
                      };
                      
                      // Group items by category if sortMode is 'category'
                      const groupByCategory = (itemsList: GroceryItem[]) => {
                        if (sortMode === 'alpha') {
                          return { 'כל הפריטים': itemsList.sort(sortByName) };
                        }
                        
                        const grouped = new Map<string, GroceryItem[]>();
                        itemsList.forEach(item => {
                          const category = item.category || 'ללא קטגוריה';
                          if (!grouped.has(category)) {
                            grouped.set(category, []);
                          }
                          grouped.get(category)!.push(item);
                        });
                        
                        // Sort items within each category
                        grouped.forEach((categoryItems, category) => {
                          grouped.set(category, categoryItems.sort(sortByName));
                        });
                        
                        // Convert to object for easier rendering
                        const result: Record<string, GroceryItem[]> = {};
                        grouped.forEach((categoryItems, category) => {
                          result[category] = categoryItems;
                        });
                        return result;
                      };
                      
                      const groupedNotPurchased = groupByCategory(notPurchasedItems);
                      const groupedPurchased = groupByCategory(purchasedItems);
                      
                      return (
                        <div className="space-y-6">
                          {/* Header */}
                          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6 shadow-sm [dir=rtl]:text-right">
                            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
                              🛒 רשימת הקניות שלי
                            </h1>
                            <div className="text-sm text-slate-600 dark:text-slate-400">
                              {notPurchasedItems.length} פריטים חסרים · {purchasedItems.length} נאספו
                            </div>
                          </div>
                          
                          {/* Search and Sort Controls - Action Bar */}
                          <div className="sticky top-0 z-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 shadow-sm [dir=rtl]:text-right">
                            <div className="flex flex-col sm:flex-row gap-3 [dir=rtl]:flex-row-reverse">
                              <Input
                                type="text"
                                placeholder="חפש פריט..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="flex-1"
                              />
                              <Select value={sortMode} onValueChange={(value: 'category' | 'alpha') => setSortMode(value)}>
                                <SelectTrigger className="w-full sm:w-[140px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="category">קטגוריה</SelectItem>
                                  <SelectItem value="alpha">א-ת</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          
                          {/* Empty States */}
                          {searchQuery.trim() && filteredItems.length === 0 && (
                            <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                              <CardContent className="text-center py-8 [dir=rtl]:text-right">
                                <p className="text-slate-600 dark:text-slate-400 mb-4">
                                  לא נמצאו תוצאות עבור: <span className="font-semibold">"{searchQuery}"</span>
                                </p>
                                <Button
                                  onClick={() => setSearchQuery('')}
                                  variant="outline"
                                  className="border-slate-300 dark:border-slate-600"
                                >
                                  נקה חיפוש
                                </Button>
                              </CardContent>
                            </Card>
                          )}
                          
                          {!searchQuery.trim() && notPurchasedItems.length === 0 && purchasedItems.length > 0 && (
                            <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                              <CardContent className="text-center py-8 [dir=rtl]:text-right">
                                <p className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
                                  כל הפריטים נאספו 🎉
                                </p>
                                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                                  כל הפריטים ברשימה מסומנים כנאספו
                                </p>
                                <Button
                                  onClick={() => setPurchasedItemsExpanded(true)}
                                  variant="outline"
                                  className="border-slate-300 dark:border-slate-600"
                                >
                                  הצג פריטים שנאספו
                                </Button>
                              </CardContent>
                            </Card>
                          )}
                          
                          {/* Items not yet purchased */}
                          {notPurchasedItems.length > 0 && (
                            <div>
                              {sortMode === 'category' ? (
                                // Grouped by category
                                Object.entries(groupedNotPurchased).map(([category, categoryItems]) => (
                                  <div key={category} className="mb-6">
                                    <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-3 text-right">
                                      {category} ({categoryItems.length})
                                    </h3>
                                    <ul className="space-y-3">
                                      {categoryItems.map((item) => (
                                  <li
                                    key={item.id}
                                    className="flex items-center gap-3 p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors [dir=rtl]:flex-row-reverse"
                                  >
                                    {/* Checkbox */}
                                    <input
                                      type="checkbox"
                                      checked={item.purchased || false}
                                      onChange={() => handleTogglePurchased(item)}
                                      disabled={updatingItemId === item.id}
                                      className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                    />
                                    
                                    {/* Image placeholder */}
                                    <div className="relative w-16 h-16 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 overflow-hidden group">
                                      {item.image_url ? (
                                        <img 
                                          src={item.image_url} 
                                          alt={item.name}
                                          className="w-full h-full object-cover"
                                        />
                                      ) : (
                                        <ShoppingCart className="h-6 w-6 text-slate-400" />
                                      )}
                                      <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) {
                                            handleUpdateItemImage(item.id, file);
                                          }
                                          // Reset input
                                          e.target.value = '';
                                        }}
                                        disabled={uploadingImageForItem === item.id}
                                        className="hidden"
                                        id={`image-upload-${item.id}`}
                                      />
                                      <label
                                        htmlFor={`image-upload-${item.id}`}
                                        className={`absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer ${uploadingImageForItem === item.id ? 'opacity-100' : ''}`}
                                        title="עדכן תמונה"
                                      >
                                        {uploadingImageForItem === item.id ? (
                                          <Loader2 className="h-5 w-5 text-white animate-spin" />
                                        ) : (
                                          <Camera className="h-5 w-5 text-white" />
                                        )}
                                      </label>
                                    </div>
                                    
                                    {/* Item name */}
                                    <div className="flex-1 text-right min-w-0">
                                      <div className="font-medium text-slate-700 dark:text-slate-200">
                                        {item.name}
                                      </div>
                                      <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                        {item.category || 'ללא קטגוריה'}
                                      </div>
                                    </div>
                                    
                                    {/* Quantity controls */}
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleQuantityChange(item, -1)}
                                        disabled={item.quantity <= 1 || updatingItemId === item.id}
                                        className="h-8 w-8 p-0"
                                      >
                                        <Minus className="h-4 w-4" />
                                      </Button>
                                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200 w-8 text-center">
                                        {item.quantity}
                                      </span>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleQuantityChange(item, 1)}
                                        disabled={updatingItemId === item.id}
                                        className="h-8 w-8 p-0"
                                      >
                                        <Plus className="h-4 w-4" />
                                      </Button>
                                    </div>
                                    
                                    {/* Delete button */}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDeleteItem(item.id)}
                                      disabled={deletingItemId === item.id}
                                      className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0"
                                    >
                                      {deletingItemId === item.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        t.delete
                                      )}
                                    </Button>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ))
                              ) : (
                                // Alphabetical list
                                <ul className="space-y-3">
                                  {groupedNotPurchased['כל הפריטים']?.map((item) => (
                                    <li
                                      key={item.id}
                                      className="flex items-center gap-3 p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors [dir=rtl]:flex-row-reverse"
                                    >
                                      {/* Checkbox */}
                                      <input
                                        type="checkbox"
                                        checked={item.purchased || false}
                                        onChange={() => handleTogglePurchased(item)}
                                        disabled={updatingItemId === item.id}
                                        className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                      />
                                      
                                      {/* Image placeholder */}
                                      <div className="relative w-16 h-16 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 overflow-hidden group">
                                        {item.image_url ? (
                                          <img
                                            src={item.image_url}
                                            alt={item.name}
                                            className="w-full h-full object-cover"
                                          />
                                        ) : (
                                          <ShoppingCart className="h-6 w-6 text-slate-400" />
                                        )}
                                        <input
                                          type="file"
                                          accept="image/*"
                                          onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                              handleUpdateItemImage(item.id, file);
                                            }
                                            e.target.value = '';
                                          }}
                                          disabled={uploadingImageForItem === item.id}
                                          className="hidden"
                                          id={`image-upload-${item.id}`}
                                        />
                                        <label
                                          htmlFor={`image-upload-${item.id}`}
                                          className={`absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer ${uploadingImageForItem === item.id ? 'opacity-100' : ''}`}
                                          title="עדכן תמונה"
                                        >
                                          {uploadingImageForItem === item.id ? (
                                            <Loader2 className="h-5 w-5 text-white animate-spin" />
                                          ) : (
                                            <Camera className="h-5 w-5 text-white" />
                                          )}
                                        </label>
                                      </div>
                                      
                                      {/* Item name */}
                                      <div className="flex-1 text-right min-w-0">
                                        <div className="font-medium text-slate-700 dark:text-slate-200">
                                          {item.name}
                                        </div>
                                        <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                          {item.category || 'ללא קטגוריה'}
                                        </div>
                                      </div>
                                      
                                      {/* Quantity controls */}
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleQuantityChange(item, -1)}
                                          disabled={item.quantity <= 1 || updatingItemId === item.id}
                                          className="h-8 w-8 p-0"
                                        >
                                          <Minus className="h-4 w-4" />
                                        </Button>
                                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200 w-8 text-center">
                                          {item.quantity}
                                        </span>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleQuantityChange(item, 1)}
                                          disabled={updatingItemId === item.id}
                                          className="h-8 w-8 p-0"
                                        >
                                          <Plus className="h-4 w-4" />
                                        </Button>
                                      </div>
                                      
                                      {/* Delete button */}
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDeleteItem(item.id)}
                                        disabled={deletingItemId === item.id}
                                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0"
                                      >
                                        {deletingItemId === item.id ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          t.delete
                                        )}
                                      </Button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                          
                          {/* Purchased items section */}
                          {purchasedItems.length > 0 && (
                            <div>
                              <button
                                onClick={() => setPurchasedItemsExpanded(!purchasedItemsExpanded)}
                                className="w-full flex items-center justify-between p-3 mb-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-right [dir=rtl]:flex-row-reverse"
                              >
                                <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                                  ✔️ נאספו ({purchasedItems.length})
                                </h3>
                                <ChevronDown
                                  className={`h-4 w-4 text-slate-500 dark:text-slate-400 transition-transform duration-200 ${
                                    purchasedItemsExpanded ? 'rotate-180' : ''
                                  }`}
                                />
                              </button>
                              <div
                                className={`overflow-hidden transition-all duration-300 ${
                                  purchasedItemsExpanded ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'
                                }`}
                              >
                                {sortMode === 'category' ? (
                                // Grouped by category
                                Object.entries(groupedPurchased).map(([category, categoryItems]) => (
                                  <div key={category} className="mb-6">
                                    <h4 className="text-xs font-medium text-slate-500 dark:text-slate-500 mb-2 text-right">
                                      {category} ({categoryItems.length})
                                    </h4>
                                    <ul className="space-y-3">
                                      {categoryItems.map((item) => (
                                        <li
                                          key={item.id}
                                          className="flex items-center gap-3 p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/30 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors opacity-75 [dir=rtl]:flex-row-reverse"
                                        >
                                          {/* Checkbox - can be unchecked to return item to active list */}
                                          <input
                                            type="checkbox"
                                            checked={item.purchased || false}
                                            onChange={() => handleTogglePurchased(item)}
                                            disabled={updatingItemId === item.id}
                                            className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                          />

                                          {/* Image placeholder */}
                                          <div className="w-16 h-16 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                            {item.image_url ? (
                                              <img
                                                src={item.image_url}
                                                alt={item.name}
                                                className="w-full h-full object-cover"
                                              />
                                            ) : (
                                              <ShoppingCart className="h-6 w-6 text-slate-400" />
                                            )}
                                          </div>
                                          
                                          {/* Item name */}
                                          <div className="flex-1 text-right min-w-0">
                                            <div className="font-medium text-slate-700 dark:text-slate-200 line-through">
                                              {item.name}
                                            </div>
                                            <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                              {item.category || 'ללא קטגוריה'}
                                            </div>
                                          </div>
                                          
                                          {/* Quantity - read only */}
                                          <div className="flex items-center gap-2 flex-shrink-0">
                                            <span className="text-sm font-medium text-slate-500 dark:text-slate-400 w-8 text-center">
                                              {item.quantity}
                                            </span>
                                          </div>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ))
                                ) : (
                                  // Alphabetical list for purchased items
                                  <ul className="space-y-3">
                                  {groupedPurchased['כל הפריטים']?.map((item) => (
                                    <li
                                      key={item.id}
                                      className="flex items-center gap-3 p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/30 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors opacity-75 [dir=rtl]:flex-row-reverse"
                                    >
                                      {/* Checkbox - can be unchecked to return item to active list */}
                                      <input
                                        type="checkbox"
                                        checked={item.purchased || false}
                                        onChange={() => handleTogglePurchased(item)}
                                        disabled={updatingItemId === item.id}
                                        className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                      />
                                      
                                      {/* Image placeholder */}
                                      <div className="w-16 h-16 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                        {item.image_url ? (
                                          <img
                                            src={item.image_url}
                                            alt={item.name}
                                            className="w-full h-full object-cover"
                                          />
                                        ) : (
                                          <ShoppingCart className="h-6 w-6 text-slate-400" />
                                        )}
                                      </div>
                                      
                                      {/* Item name */}
                                      <div className="flex-1 text-right min-w-0">
                                        <div className="font-medium text-slate-700 dark:text-slate-200 line-through">
                                          {item.name}
                                        </div>
                                        <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                          {item.category || 'ללא קטגוריה'}
                                        </div>
                                      </div>
                                      
                                      {/* Quantity - read only */}
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400 w-8 text-center">
                                          {item.quantity}
                                        </span>
                                      </div>
                                    </li>
                                  ))}
                                  </ul>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Previous List View - Shown alongside active list */}
            {viewingPreviousListId && (
              <div className="space-y-6">
                <Card className="shadow-md border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <CardHeader>
                    <div className="flex items-center justify-between [dir=rtl]:flex-row-reverse">
                      <CardTitle className="text-lg text-slate-900 dark:text-slate-50 text-right">
                        {t.previousList}
                      </CardTitle>
                      <div className="flex gap-2 [dir=rtl]:flex-row-reverse">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setListToDelete(viewingPreviousListId);
                            setShowDeletePreviousDialog(true);
                          }}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="h-4 w-4 me-2" />
                          {t.deletePreviousList}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleClosePreviousList}
                        >
                          <X className="h-4 w-4 me-2" />
                          {t.closePreviousList}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {loadingPreviousItems ? (
                      <div className="flex items-center justify-center py-8 text-slate-600 dark:text-slate-400">
                        <Loader2 className="h-5 w-5 animate-spin me-2 text-emerald-600 dark:text-emerald-400" />
                        <span>{t.loadingItems}</span>
                      </div>
                    ) : previousListItems.length === 0 ? (
                      <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                        <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-50 text-slate-400 dark:text-slate-500" />
                        <p className="font-medium mb-1 text-slate-600 dark:text-slate-300">{t.noItems}</p>
                      </div>
                    ) : (
                      <ul className="space-y-3">
                        {previousListItems.map((item) => (
                          <li
                            key={item.id}
                            className="flex items-center gap-3 p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/30 [dir=rtl]:flex-row-reverse opacity-75"
                          >
                            {/* Checkbox - disabled for previous lists */}
                            <input
                              type="checkbox"
                              checked={true}
                              disabled
                              className="w-5 h-5 rounded border-slate-300 text-emerald-600 cursor-not-allowed opacity-50"
                            />
                            
                            {/* Image placeholder */}
                            <div className="w-16 h-16 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                              {item.image_url ? (
                                <img
                                  src={item.image_url}
                                  alt={item.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <ShoppingCart className="h-6 w-6 text-slate-400" />
                              )}
                            </div>
                            
                            {/* Item name */}
                            <div className="flex-1 text-right min-w-0">
                              <div className="font-medium text-slate-700 dark:text-slate-200 line-through">
                                {item.name}
                              </div>
                              <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                {item.category || 'ללא קטגוריה'}
                              </div>
                            </div>
                            
                            {/* Quantity - read only */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-sm font-medium text-slate-500 dark:text-slate-400 w-8 text-center">
                                {item.quantity}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          {activeUserId && !selectedListId && (
            <Card className="shadow-md border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <CardContent className="py-12">
                <div className="text-center text-slate-500 dark:text-slate-400">
                  <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-50 text-slate-400 dark:text-slate-500" />
                  <p className="font-medium mb-1 text-slate-600 dark:text-slate-300">{t.noListSelected}</p>
                  <p className="text-sm">{t.noListSelectedDescription}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </main>

        {/* Floating Action Button - Mobile only */}
        {showFab && activeUserId && selectedListId && (
          <button
            onClick={() => {
              addItemFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              setTimeout(() => {
                newItemNameInputRef.current?.focus();
              }, 500);
            }}
            className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center [dir=rtl]:right-auto [dir=rtl]:left-6 md:hidden"
            aria-label="הוסף פריט"
          >
            <Plus className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Complete List Confirmation Dialog */}
      <AlertDialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <AlertDialogContent className="[dir=rtl]:text-right">
          <AlertDialogHeader>
            <AlertDialogTitle>{t.markListCompleted}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.confirmMarkCompleted}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="[dir=rtl]:flex-row-reverse">
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMarkListCompleted}
              className="bg-green-600 hover:bg-green-700"
              disabled={completingListId !== null}
            >
              {t.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* Delete Previous List Confirmation Dialog */}
      <AlertDialog open={showDeletePreviousDialog} onOpenChange={setShowDeletePreviousDialog}>
        <AlertDialogContent className="[dir=rtl]:text-right">
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deletePreviousList}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.confirmDeletePreviousList}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="[dir=rtl]:flex-row-reverse">
            <AlertDialogCancel onClick={() => setListToDelete(null)}>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePreviousList}
              className="bg-red-600 hover:bg-red-700"
            >
              {t.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Shopping Assistant Floating Button - Always visible when user and list are selected */}
      {activeUserId && selectedListId && (
        <Button
          onClick={() => setShowAssistant(!showAssistant)}
          className={`fixed bottom-6 left-6 w-14 h-14 rounded-full shadow-2xl text-white border-0 z-40 [dir=rtl]:left-auto [dir=rtl]:right-6 transition-all duration-200 ${
            showAssistant 
              ? 'bg-gradient-to-br from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 scale-110' 
              : 'bg-gradient-to-br from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 hover:scale-110'
          }`}
          size="lg"
          title={showAssistant ? "סגור עוזר קניות" : "פתח עוזר קניות"}
        >
          <Bot className="h-6 w-6" />
        </Button>
      )}

      {/* Shopping Assistant */}
      {showAssistant && (
        <AssistantPanel
          userId={activeUserId}
          selectedListId={selectedListId}
          currentListItems={items}
          onClose={() => setShowAssistant(false)}
          onItemsAdded={async () => {
            // Reload items when assistant adds items
            if (selectedListId && activeUserId) {
              try {
                const loadedItems = await fetchGroceryItems(selectedListId, activeUserId);
                setItems(loadedItems);
              } catch (err) {
                // Failed to reload items - error already handled
              }
            }
          }}
        />
      )}
    </div>
  );
}
