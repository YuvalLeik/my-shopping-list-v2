'use client';

import { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import { fetchGroceryLists, fetchGroceryListsWithItemCount, createGroceryList, deleteGroceryList, markListAsCompleted, updateGroceryListTitle, getGroceryListById, updateListTotalCost, GroceryList } from '@/lib/groceryLists';
import { fetchPurchaseRecordsByListId, fetchStandalonePurchaseRecords, deletePurchaseRecord, PurchaseRecordWithItems } from '@/lib/purchaseRecords';
import { fetchGroceryItems, createGroceryItem, deleteGroceryItem, updateGroceryItem, getAllItemNames, getItemCategoryByName, GroceryItem } from '@/lib/groceryItems';
import { uploadItemImage } from '@/lib/storage';
import { getShoppingItemByName, upsertShoppingItemImageByName, normalizeItemName } from '@/lib/shoppingItems';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Loader2, ShoppingCart, Plus, Trash2, Minus, CheckCircle2, X, Bot, Camera, ChevronDown, User, Menu, Receipt, Settings2, Ban, Undo2 } from 'lucide-react';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Sidebar } from '@/components/Sidebar';
import { AssistantPanel } from '@/app/components/AssistantPanel';
import { ImportReceiptPanel } from '@/app/components/ImportReceiptPanel';
// ItemMatchSettings is now a dedicated page at /settings
import { t } from '@/lib/translations';
import { fetchLocalUsers, LocalUser } from '@/lib/localUsers';
import { resolveItemDisplayInfo } from '@/lib/itemAliases';
import { CATEGORIES } from '@/lib/categories';
import { getItemAveragePrice, recordPrices } from '@/lib/itemPrices';
import { getDailyPriceRecommendation, DailyPriceRecommendationResult } from '@/lib/analytics';
import { getTopUnmappedPricedItems, upsertUserItemBarcode, UnmappedItem } from '@/lib/userItemBarcodes';
import { GroceryItemRow } from '@/components/GroceryItemRow';

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
  const [newItemPrice, setNewItemPrice] = useState<string>('');
  const [priceDialogItem, setPriceDialogItem] = useState<GroceryItem | null>(null);
  const [priceDialogValue, setPriceDialogValue] = useState<string>('');
  const [loadingItems, setLoadingItems] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [allItemNames, setAllItemNames] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [completeListTotalCost, setCompleteListTotalCost] = useState('');
  const [completingListId, setCompletingListId] = useState<string | null>(null);
  const [purchasedItemsExpanded, setPurchasedItemsExpanded] = useState(false);
  const [unavailableItemsExpanded, setUnavailableItemsExpanded] = useState(true);
  const [sidebarRefreshTrigger, setSidebarRefreshTrigger] = useState(0);
  const [viewingPreviousListId, setViewingPreviousListId] = useState<string | null>(null);
  const [previousListMeta, setPreviousListMeta] = useState<GroceryList | null>(null);
  const [previousListItems, setPreviousListItems] = useState<GroceryItem[]>([]);
  const [loadingPreviousItems, setLoadingPreviousItems] = useState(false);
  const [priorCostInput, setPriorCostInput] = useState('');
  const [updatingPriorCost, setUpdatingPriorCost] = useState(false);
  const [showDeletePreviousDialog, setShowDeletePreviousDialog] = useState(false);
  const [listToDelete, setListToDelete] = useState<string | null>(null);
  const [deletingPreviousList, setDeletingPreviousList] = useState(false);
  const [showDeletePurchaseDialog, setShowDeletePurchaseDialog] = useState(false);
  const [purchaseToDelete, setPurchaseToDelete] = useState<string | null>(null);
  const [deletingStandalonePurchase, setDeletingStandalonePurchase] = useState(false);
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
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [selectionModeActive, setSelectionModeActive] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showImportReceipt, setShowImportReceipt] = useState(false);
  // showMatchSettings removed - settings is now a dedicated /settings page
  const [previousListPurchases, setPreviousListPurchases] = useState<PurchaseRecordWithItems[]>([]);
  const [standalonePurchases, setStandalonePurchases] = useState<PurchaseRecordWithItems[]>([]);
  const [viewingStandalonePurchaseId, setViewingStandalonePurchaseId] = useState<string | null>(null);
  const [viewingStandalonePurchase, setViewingStandalonePurchase] = useState<PurchaseRecordWithItems | null>(null);
  const [completedListsForDropdown, setCompletedListsForDropdown] = useState<GroceryList[]>([]);
  const [purchaseDisplayInfo, setPurchaseDisplayInfo] = useState<Map<string, { canonicalName: string; imageUrl: string | null }>>(new Map());
  const [marketBanner, setMarketBanner] = useState<DailyPriceRecommendationResult | null>(null);
  const [marketBannerDismissed, setMarketBannerDismissed] = useState(false);
  const [unmappedItems, setUnmappedItems] = useState<UnmappedItem[]>([]);
  const [barcodeDrafts, setBarcodeDrafts] = useState<Record<string, string>>({});
  const [savingBarcodeFor, setSavingBarcodeFor] = useState<string | null>(null);
  const [loadingBarcodeHelper, setLoadingBarcodeHelper] = useState(false);

  const loadMarketRecommendation = (userId: string) => getDailyPriceRecommendation(userId);

  // Load all item names for autocomplete from global catalog (shopping_items)
  // This is shared across all users for learning/suggestions
  useEffect(() => {
    if (!activeUserId) {
      setAllItemNames([]);
      return;
    }

    let cancelled = false;
    const userId = activeUserId;
    async function loadItemNames() {
      try {
        const names = await getAllItemNames(userId);
        if (cancelled) return;
        setAllItemNames(names);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load item names:', err);
      }
    }
    loadItemNames();
    return () => { cancelled = true; };
  }, [activeUserId]);

  // Load standalone purchases when active user changes
  useEffect(() => {
    if (!activeUserId) {
      setStandalonePurchases([]);
      return;
    }
    let cancelled = false;
    fetchStandalonePurchaseRecords(activeUserId)
      .then(data => { if (!cancelled) setStandalonePurchases(data); })
      .catch(() => { if (!cancelled) setStandalonePurchases([]); });
    return () => { cancelled = true; };
  }, [activeUserId]);

  // Load users and active user name
  useEffect(() => {
    let cancelled = false;
    async function loadUsers() {
      try {
        const loadedUsers = await fetchLocalUsers();
        if (cancelled) return;
        setUsers(loadedUsers);

        if (loadedUsers.length === 0) {
          setLoadingUsers(false);
          return;
        }

        const storedUserId = localStorage.getItem('active_user_id');
        const validStored = storedUserId && loadedUsers.some((u) => u.id === storedUserId);
        const currentValid = activeUserId && loadedUsers.some((u) => u.id === activeUserId);

        if (!currentValid) {
          const nextId = validStored ? storedUserId! : loadedUsers[0].id;
          setActiveUserId(nextId);
          localStorage.setItem('active_user_id', nextId);
          const user = loadedUsers.find((u) => u.id === nextId);
          setActiveUserName(user?.name || null);
        } else if (activeUserId) {
          const activeUser = loadedUsers.find((u) => u.id === activeUserId);
          setActiveUserName(activeUser?.name || null);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load users:', err);
      } finally {
        if (!cancelled) setLoadingUsers(false);
      }
    }
    loadUsers();
    return () => { cancelled = true; };
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

    let cancelled = false;
    const userId = activeUserId;
    async function loadLists() {
      try {
        const loadedLists = await fetchGroceryLists(userId);
        if (cancelled) return;
        setLists(loadedLists);
        if (loadedLists.length > 0) {
          setSelectedListId(loadedLists[0].id);
          setListTitle(loadedLists[0].title);
        } else {
          try {
            const defaultTitle = 'רשימה חדשה';
            const newList = await createGroceryList(userId, defaultTitle);
            if (cancelled) return;
            setLists([newList]);
            setSelectedListId(newList.id);
            setListTitle(newList.title);
          } catch (createErr) {
            if (cancelled) return;
            toast.error('נכשל ביצירת רשימה חדשה', {
              description: createErr instanceof Error ? createErr.message : 'Unknown error',
            });
            setSelectedListId(null);
            setListTitle('');
          }
        }
      } catch (err) {
        if (cancelled) return;
        toast.error(t.failedToLoadLists, {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }
    loadLists();
    return () => { cancelled = true; };
  }, [activeUserId]);

  // Load items when selected list or active user changes
  useEffect(() => {
    setSelectedItemIds(new Set());
    setSelectionModeActive(false);
    if (!selectedListId || !activeUserId) {
      setItems([]);
      return;
    }

    let cancelled = false;
    const listId = selectedListId;
    const userId = activeUserId;
    setLoadingItems(true);
    async function loadItems() {
      try {
        const loadedItems = await fetchGroceryItems(listId, userId);
        if (cancelled) return;
        setItems(loadedItems);
      } catch (err) {
        if (cancelled) return;
        toast.error(t.failedToLoadItems, {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      } finally {
        if (!cancelled) setLoadingItems(false);
      }
    }
    loadItems();
    return () => { cancelled = true; };
  }, [selectedListId, activeUserId]);

  useEffect(() => {
    if (!activeUserId) return;
    let cancelled = false;
    setLoadingBarcodeHelper(true);
    loadMarketRecommendation(activeUserId)
      .then((result) => {
        if (cancelled) return;
        setMarketBanner(result);
        setMarketBannerDismissed(false);
      })
      .catch(() => {});
    getTopUnmappedPricedItems(activeUserId)
      .then((rows) => {
        if (cancelled) return;
        setUnmappedItems(rows);
      })
      .catch(() => {
        if (cancelled) return;
        setUnmappedItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingBarcodeHelper(false);
      });
    return () => { cancelled = true; };
  }, [activeUserId]);

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
      
      // Check global catalog for existing image (before creating item)
      if (!selectedImageFile) {
        const shoppingItem = await getShoppingItemByName(itemName);
        if (shoppingItem?.image_url) {
          imageUrl = shoppingItem.image_url;
        }
      }

      // Determine estimated price: prefer user-entered value, then historical average
      let estimatedPrice: number | null = null;
      const userEnteredPrice = parseFloat(newItemPrice.replace(',', '.'));
      if (!isNaN(userEnteredPrice) && userEnteredPrice > 0) {
        estimatedPrice = userEnteredPrice;
      } else {
        try {
          estimatedPrice = await getItemAveragePrice(userId, itemName);
        } catch {
          // Non-critical - continue without estimated price
        }
      }
      
      // Create item in user's list FIRST (critical - per-user)
      let newItem: GroceryItem;
      try {
        newItem = await createGroceryItem(
          selectedListId,
          itemName,
          newItemQuantity,
          categoryToUse,
          imageUrl,
          estimatedPrice
        );
      } catch (createError) {
        toast.error('לא הצלחתי להוסיף לרשימה שלך', {
          description: createError instanceof Error ? createError.message : 'שגיאה לא ידועה',
          duration: 4000,
        });
        throw createError; // Fail - item not added to user's list
      }
      
      // Save manually-entered price to history if user typed it in (no prior history)
      if (!isNaN(userEnteredPrice) && userEnteredPrice > 0) {
        recordPrices(userId, [{
          itemName,
          price: userEnteredPrice * newItemQuantity,
          quantity: newItemQuantity,
          unitPrice: userEnteredPrice,
        }]).catch(() => { /* non-critical */ });
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
          } catch {
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
      } catch {
        // Refresh failed - still update state with the item we created
        setItems((prev) => [newItem, ...prev.filter(i => i.id !== newItem.id)]);
      }
      
      // Cleanup form
      setNewItemName('');
      setNewItemCategory('ללא קטגוריה');
      setNewItemQuantity(1);
      setNewItemPrice('');
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

  const handleSaveBarcodeMapping = async (itemName: string) => {
    if (!activeUserId) return;
    const barcode = (barcodeDrafts[itemName] || '').trim();
    if (!barcode) {
      toast.error('צריך להזין ברקוד לפני שמירה');
      return;
    }

    setSavingBarcodeFor(itemName);
    try {
      await upsertUserItemBarcode(activeUserId, itemName, barcode, 'manual');
      toast.success(`ברקוד נשמר עבור "${itemName}"`);

      const [nextUnmapped, nextMarketRecommendation] = await Promise.all([
        getTopUnmappedPricedItems(activeUserId),
        loadMarketRecommendation(activeUserId),
      ]);
      setUnmappedItems(nextUnmapped);
      setMarketBanner(nextMarketRecommendation);
      setMarketBannerDismissed(false);
      setBarcodeDrafts((prev) => {
        const updated = { ...prev };
        delete updated[itemName];
        return updated;
      });
    } catch (error) {
      toast.error('שמירת ברקוד נכשלה', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setSavingBarcodeFor(null);
    }
  };

  const handleSelectSuggestion = async (suggestion: string) => {
    if (!activeUserId) return;
    
    const userId = activeUserId;
    setNewItemName(suggestion);
    setShowSuggestions(false);
    
    // Auto-fill category, image, and price from catalog/history
    try {
      const [foundCategory, shoppingItem, avgPrice] = await Promise.all([
        getItemCategoryByName(suggestion, userId),
        getShoppingItemByName(suggestion),
        getItemAveragePrice(userId, suggestion),
      ]);
      if (foundCategory) {
        setNewItemCategory(foundCategory);
        toast.info(`קטגוריה: ${foundCategory}`, { duration: 1500 });
      }
      if (shoppingItem?.image_url) {
        setImagePreview(shoppingItem.image_url);
      }
      if (avgPrice != null) {
        setNewItemPrice(avgPrice.toFixed(2));
      } else {
        setNewItemPrice('');
      }
    } catch {
      // Non-critical
    }
  };

  const handleOpenAddPrice = (item: GroceryItem) => {
    setPriceDialogItem(item);
    setPriceDialogValue(item.estimated_price != null ? item.estimated_price.toFixed(2) : '');
  };

  const handleSavePriceDialog = async () => {
    if (!priceDialogItem || !activeUserId) return;
    const parsed = parseFloat(priceDialogValue.replace(',', '.'));
    if (isNaN(parsed) || parsed <= 0) {
      toast.error('מחיר לא תקין');
      return;
    }
    try {
      await updateGroceryItem(priceDialogItem.id, { estimated_price: parsed });
      await recordPrices(activeUserId, [{
        itemName: priceDialogItem.name,
        price: parsed * priceDialogItem.quantity,
        quantity: priceDialogItem.quantity,
        unitPrice: parsed,
      }]);
      setItems(prev => prev.map(i => i.id === priceDialogItem.id ? { ...i, estimated_price: parsed } : i));
      toast.success('המחיר נשמר');
      setPriceDialogItem(null);
      setPriceDialogValue('');
    } catch {
      toast.error('לא הצלחתי לשמור את המחיר');
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

  const toggleItemSelection = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = (filteredItemIds: string[]) => {
    setSelectedItemIds(new Set(filteredItemIds));
  };

  const clearSelection = () => {
    setSelectedItemIds(new Set());
    setSelectionModeActive(false);
  };

  const handleBulkDelete = async () => {
    if (selectedItemIds.size === 0) return;
    setShowBulkDeleteConfirm(false);
    setBulkDeleting(true);
    const idsToDelete = Array.from(selectedItemIds);
    try {
      for (const id of idsToDelete) {
        await deleteGroceryItem(id);
      }
      setItems((prev) => prev.filter((i) => !selectedItemIds.has(i.id)));
      setSelectedItemIds(new Set());
      setSelectionModeActive(false);
      const n = idsToDelete.length;
      toast.success(t.itemsDeleted(n));
    } catch (err) {
      toast.error(t.failedToDeleteItem, {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setBulkDeleting(false);
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
    setViewingPreviousListId(listId);
    setViewingStandalonePurchaseId(null);
    setViewingStandalonePurchase(null);
    setPreviousListMeta(null);
    setPriorCostInput('');
    setPreviousListPurchases([]);
    // Load list meta (title, total_cost) and items for the previous list
    if (activeUserId) {
      getGroceryListById(listId, activeUserId)
        .then(meta => setPreviousListMeta(meta))
        .catch(() => setPreviousListMeta(null));
      // Load linked purchase records
      fetchPurchaseRecordsByListId(listId, activeUserId)
        .then(records => setPreviousListPurchases(records))
        .catch(() => setPreviousListPurchases([]));
    }
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

  // Sync prior list cost input when meta loads
  useEffect(() => {
    if (previousListMeta?.total_cost != null) {
      setPriorCostInput(String(previousListMeta.total_cost));
    } else {
      setPriorCostInput('');
    }
  }, [previousListMeta?.total_cost]);

  const handleSavePriorCost = async () => {
    if (!viewingPreviousListId || !activeUserId) return;
    const parsed = priorCostInput.trim() ? parseFloat(priorCostInput.replace(/,/g, '.')) : null;
    const value = parsed !== null && !Number.isNaN(parsed) ? parsed : null;
    setUpdatingPriorCost(true);
    try {
      const updated = await updateListTotalCost(viewingPreviousListId, activeUserId, value);
      setPreviousListMeta(updated);
      toast.success(t.save);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setUpdatingPriorCost(false);
    }
  };

  const handleClosePreviousList = () => {
    setViewingPreviousListId(null);
    setPreviousListMeta(null);
    setPreviousListItems([]);
    setPriorCostInput('');
    setPreviousListPurchases([]);
    setViewingStandalonePurchaseId(null);
    setViewingStandalonePurchase(null);
  };

  const handleStandaloneSelect = (purchaseId: string) => {
    setViewingStandalonePurchaseId(purchaseId);
    setViewingPreviousListId(null);
    setPreviousListMeta(null);
    setPreviousListItems([]);
    setPriorCostInput('');
    setPreviousListPurchases([]);
    const record = standalonePurchases.find(p => p.id === purchaseId) ?? null;
    setViewingStandalonePurchase(record);
  };

  // Resolve display info (canonical name + image) for purchase items
  useEffect(() => {
    if (!activeUserId) return;
    const allNames: string[] = [];
    if (viewingStandalonePurchase) {
      for (const item of viewingStandalonePurchase.items) {
        if (item.name) allNames.push(item.name);
      }
    }
    for (const rec of previousListPurchases) {
      for (const item of rec.items) {
        if (item.name) allNames.push(item.name);
      }
    }
    if (allNames.length === 0) {
      setPurchaseDisplayInfo(new Map());
      return;
    }
    const unique = [...new Set(allNames)];
    resolveItemDisplayInfo(activeUserId, unique)
      .then(info => setPurchaseDisplayInfo(info))
      .catch(() => setPurchaseDisplayInfo(new Map()));
  }, [activeUserId, viewingStandalonePurchase, previousListPurchases]);

  const handleDeletePreviousList = async () => {
    if (!listToDelete || !activeUserId) {
      toast.error(t.failedToDeleteList, {
        description: 'Cannot delete: missing list or user',
      });
      return;
    }

    setDeletingPreviousList(true);
    try {
      await deleteGroceryList(listToDelete, activeUserId);
      if (viewingPreviousListId === listToDelete) {
        setViewingPreviousListId(null);
        setPreviousListMeta(null);
        setPreviousListItems([]);
        setPreviousListPurchases([]);
      }
      setListToDelete(null);
      setShowDeletePreviousDialog(false);
      setSidebarRefreshTrigger(prev => prev + 1);
      toast.success(t.listDeleted);
    } catch (err) {
      toast.error(t.failedToDeleteList, {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setDeletingPreviousList(false);
    }
  };

  const handleDeleteStandalonePurchase = async () => {
    if (!purchaseToDelete || !activeUserId) return;

    setDeletingStandalonePurchase(true);
    try {
      await deletePurchaseRecord(purchaseToDelete, activeUserId);
      if (viewingStandalonePurchaseId === purchaseToDelete) {
        setViewingStandalonePurchaseId(null);
        setViewingStandalonePurchase(null);
      }
      setPurchaseToDelete(null);
      setShowDeletePurchaseDialog(false);
      const records = await fetchStandalonePurchaseRecords(activeUserId);
      setStandalonePurchases(records);
      setSidebarRefreshTrigger(prev => prev + 1);
      toast.success(t.listDeleted);
    } catch (err) {
      toast.error('נכשל במחיקת הקנייה', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setDeletingStandalonePurchase(false);
    }
  };

  const handleMarkListCompleted = async () => {
    if (!selectedListId || !activeUserId) return;

    const costValue = completeListTotalCost.trim() ? parseFloat(completeListTotalCost.replace(/,/g, '.')) : undefined;
    const optionalCost = costValue !== undefined && !Number.isNaN(costValue) ? costValue : undefined;

    setCompletingListId(selectedListId);
    setShowCompleteDialog(false);
    setCompleteListTotalCost('');
    
    try {
      // Mark current list as completed (with optional total cost)
      await markListAsCompleted(selectedListId, activeUserId, optionalCost);
      
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
      const updatedItem = await updateGroceryItem(itemId, { purchased: !item.purchased, unavailable: false });
      setItems((prev) => [updatedItem, ...prev.filter(i => i.id !== updatedItem.id)]);
    } catch (err) {
      toast.error('נכשל בעדכון סטטוס הפריט', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleToggleUnavailable = async (item: GroceryItem) => {
    const itemId = item.id;
    setUpdatingItemId(itemId);
    try {
      const newUnavailable = !item.unavailable;
      const updatedItem = await updateGroceryItem(itemId, {
        unavailable: newUnavailable,
        purchased: false,
      });
      setItems((prev) => [updatedItem, ...prev.filter(i => i.id !== updatedItem.id)]);
    } catch (err) {
      toast.error('נכשל בעדכון סטטוס הפריט', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setUpdatingItemId(null);
    }
  };

  // Reusable prior list Card content (desktop inline + mobile drawer)
  const previousListCardContent = (
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
        {/* Total cost row for prior list */}
        <div className="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b border-slate-200 dark:border-slate-700 [dir=rtl]:flex-row-reverse">
          {previousListMeta?.total_cost != null && (
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {t.totalCost}: {Number(previousListMeta.total_cost).toFixed(1)} ₪
            </span>
          )}
          <div className="flex items-center gap-2 [dir=rtl]:flex-row-reverse flex-1 min-w-0">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step={0.01}
              placeholder={t.totalCost}
              value={priorCostInput}
              onChange={(e) => setPriorCostInput(e.target.value)}
              className="w-24 text-right"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleSavePriorCost}
              disabled={updatingPriorCost}
            >
              {updatingPriorCost ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin me-1" />
                  {t.save}
                </>
              ) : (
                previousListMeta?.total_cost != null ? t.editCost : t.addCost
              )}
            </Button>
          </div>
        </div>

        {/* Import receipt button + purchase records */}
        <div className="mb-4 pb-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-2 [dir=rtl]:flex-row-reverse">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t.purchaseRecords}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // Load completed lists for the dropdown
                if (activeUserId) {
                  fetchGroceryListsWithItemCount(activeUserId, true)
                    .then(all => setCompletedListsForDropdown(all.filter(l => l.completed_at)))
                    .catch(() => setCompletedListsForDropdown([]));
                }
                setShowImportReceipt(true);
              }}
              className="text-emerald-600 hover:text-emerald-700"
            >
              <Receipt className="h-4 w-4 me-1" />
              {t.importReceipt}
            </Button>
          </div>
          {previousListPurchases.length > 0 ? (
            <div className="space-y-2">
              {previousListPurchases.map(record => (
                <div key={record.id} className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-right">
                  <div className="flex items-center justify-between [dir=rtl]:flex-row-reverse">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {record.store_name ? t.purchaseRecordFrom(record.store_name) : t.importPurchase}
                    </span>
                    <span className="text-xs text-slate-500">
                      {record.purchase_date ? new Date(record.purchase_date).toLocaleDateString('he-IL') : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400 [dir=rtl]:flex-row-reverse">
                    <span>{t.purchaseRecordItems(record.items.length)}</span>
                    {record.total_amount != null && (
                      <span className="font-medium">{Number(record.total_amount).toFixed(1)} ₪</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500 text-right">{t.noPurchaseRecords}</p>
          )}
        </div>

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
                <input
                  type="checkbox"
                  checked={true}
                  disabled
                  className="w-5 h-5 rounded border-slate-300 text-emerald-600 cursor-not-allowed opacity-50"
                />
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
                <div className="flex-1 text-right min-w-0">
                  <div className="font-medium text-slate-700 dark:text-slate-200 line-through">
                    {item.name}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    {item.category || 'ללא קטגוריה'}
                  </div>
                </div>
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
  );

  // Standalone purchase detail card (when viewing a standalone purchase from sidebar)
  const standalonePurchaseCardContent = viewingStandalonePurchase && (
    <Card className="shadow-md border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <CardHeader>
        <div className="flex items-center justify-between [dir=rtl]:flex-row-reverse">
          <CardTitle className="text-lg text-slate-900 dark:text-slate-50 text-right">
            {viewingStandalonePurchase.store_name || t.importPurchase}
          </CardTitle>
          <div className="flex gap-2 [dir=rtl]:flex-row-reverse">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPurchaseToDelete(viewingStandalonePurchaseId);
                setShowDeletePurchaseDialog(true);
              }}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <Trash2 className="h-4 w-4 me-2" />
              {t.deleteStandalonePurchase}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClosePreviousList}>
              <X className="h-4 w-4 me-2" />
              {t.closePreviousList}
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400 [dir=rtl]:flex-row-reverse">
          {viewingStandalonePurchase.purchase_date && (
            <span>{new Date(viewingStandalonePurchase.purchase_date).toLocaleDateString('he-IL')}</span>
          )}
          {viewingStandalonePurchase.total_amount != null && (
            <span className="font-medium">{Number(viewingStandalonePurchase.total_amount).toFixed(1)} ₪</span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {viewingStandalonePurchase.items.map((item) => {
            const displayInfo = purchaseDisplayInfo.get(item.name);
            const displayName = displayInfo?.canonicalName || item.name;
            const displayImage = displayInfo?.imageUrl || null;
            const isAlias = displayInfo && displayInfo.canonicalName !== item.name;
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/30 [dir=rtl]:flex-row-reverse opacity-90"
              >
                <div className="w-16 h-16 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {displayImage ? (
                    <img src={displayImage} alt={displayName} className="w-full h-full object-cover" />
                  ) : (
                    <ShoppingCart className="h-6 w-6 text-slate-400" />
                  )}
                </div>
                <div className="flex-1 text-right min-w-0">
                  <div className="font-medium text-slate-700 dark:text-slate-200">{displayName}</div>
                  {isAlias && (
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{t.settingsOriginalName} {item.name}</div>
                  )}
                  <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    {item.total_price != null ? `${Number(item.total_price).toFixed(2)} ₪` : ''}
                  </div>
                </div>
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400 w-8 text-center">
                  {item.quantity}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen flex bg-white dark:bg-slate-950">
      {/* Sidebar */}
      <Sidebar
        activeUserId={activeUserId}
        onUserChange={setActiveUserId}
        selectedListId={viewingPreviousListId}
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
            toast.info('נוצרה רשימה חדשה');
            setSidebarRefreshTrigger(prev => prev + 1);
            const updatedLists = await fetchGroceryLists(activeUserId);
            const newList = updatedLists.find(l => l.id === newListId);
            if (newList) {
              setLists(updatedLists);
              setListTitle(newList.title);
            }
            if (itemCount > 0) toast.info(`הועתקו ${itemCount} פריטים`);
            setSelectedListId(newListId);
            setViewingPreviousListId(null);
            setPreviousListItems([]);
            setViewingStandalonePurchaseId(null);
            setViewingStandalonePurchase(null);
            toast.success('הרשימה שוכפלה בהצלחה');
          } catch (err) {
            toast.error('נכשל בשכפול הרשימה', { description: err instanceof Error ? err.message : 'Unknown error' });
          }
        }}
        standalonePurchases={standalonePurchases}
        viewingStandaloneId={viewingStandalonePurchaseId}
        onStandaloneSelect={handleStandaloneSelect}
        onStandaloneDuplicated={async (newListId: string, itemCount: number) => {
          if (!activeUserId) return;
          try {
            toast.info('נוצרה רשימה חדשה');
            setSidebarRefreshTrigger(prev => prev + 1);
            const updatedLists = await fetchGroceryLists(activeUserId);
            const newList = updatedLists.find(l => l.id === newListId);
            if (newList) {
              setLists(updatedLists);
              setListTitle(newList.title);
            }
            if (itemCount > 0) toast.info(`הועתקו ${itemCount} פריטים`);
            setSelectedListId(newListId);
            setViewingPreviousListId(null);
            setPreviousListItems([]);
            setViewingStandalonePurchaseId(null);
            setViewingStandalonePurchase(null);
            toast.success('הקנייה שוכפלה לרשימה בהצלחה');
          } catch (err) {
            toast.error('נכשל בשכפול הקנייה', { description: err instanceof Error ? err.message : 'Unknown error' });
          }
        }}
      />

      {/* Main Content */}
      <div className="flex-1 relative min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 dark:from-slate-950 dark:to-slate-900">
        {/* Top Bar */}
        <div className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-200/50 dark:border-slate-800/50 relative">
          {/* Mobile Hamburger Toggle Button - absolute positioning יחסית ל-top bar, מצד ימין למעלה */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="absolute top-3 right-3 md:hidden z-[100] flex-shrink-0 rounded-lg border-2 border-slate-400 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg hover:bg-slate-50 dark:hover:bg-slate-700 p-2 [dir=rtl]:right-auto [dir=rtl]:left-3"
            title="רשימות קודמות"
          >
            <Menu className="h-6 w-6 text-slate-700 dark:text-slate-200" />
          </Button>
          
          <div className="container mx-auto px-3 sm:px-4 md:px-6 py-3 sm:py-4">
            <div className="flex items-center justify-between gap-2 sm:gap-4">
              {/* Right side - Title */}
              <div className="flex-1 min-w-0">
                <div className="text-right pr-10 md:pr-0">
                  <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-50">
                    רשימות קניות
                  </h1>
                  {activeUserName && (
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5 sm:mt-1">
                      משתמש: {activeUserName}
                    </p>
                  )}
                </div>
              </div>
              
              {/* Left side - User Selector (visible on all screen sizes) */}
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                <div className="flex flex-shrink-0 items-center">
                {loadingUsers ? (
                  <div className="flex items-center gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-600 dark:text-emerald-400" />
                  </div>
                ) : users.length === 0 ? (
                  <div className="px-2 sm:px-3 py-1.5 sm:py-2 rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                    אין משתמשים
                  </div>
                ) : users.length > 0 ? (
                  <Select
                    value={users.some((u) => u.id === activeUserId) ? activeUserId ?? '' : users[0].id}
                    onValueChange={(userId) => {
                      setActiveUserId(userId);
                      localStorage.setItem('active_user_id', userId);
                    }}
                  >
                    <SelectTrigger className="flex items-center gap-1.5 sm:gap-2 rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 sm:px-3 py-1.5 sm:py-2 text-sm shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors [dir=rtl]:flex-row-reverse w-auto min-w-[100px] sm:min-w-[120px] md:min-w-[160px]">
                      <User className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                      <div className="flex flex-col items-start [dir=rtl]:items-end min-w-0">
                        <span className="text-xs text-slate-500 dark:text-slate-400 leading-none hidden sm:block">משתמש</span>
                        <SelectValue className="text-sm font-medium text-slate-900 dark:text-slate-50 leading-tight" />
                      </div>
                      <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4 text-slate-500 dark:text-slate-400 flex-shrink-0 [dir=rtl]:mr-auto [dir=ltr]:ml-auto" />
                    </SelectTrigger>
                    <SelectContent position="popper" className="z-[200] min-w-[200px]" sideOffset={4}>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
                </div>
                {/* Settings gear icon - links to /settings page */}
                {activeUserId && (
                  <a
                    href={`/settings?userId=${activeUserId}`}
                    className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center justify-center"
                    title={t.itemMatchSettings}
                  >
                    <Settings2 className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        <main className={`relative z-0 container mx-auto px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8 max-w-5xl`}>

          <div className={`grid gap-6 grid-cols-1 ${(viewingPreviousListId || viewingStandalonePurchaseId) ? 'md:grid-cols-2' : ''}`}>
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
                    <form onSubmit={handleAddItem} className="space-y-3 sm:space-y-4">
                      {/* Item Name with Autocomplete */}
                      <div className="relative">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 sm:mb-2 block text-right">
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
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 sm:mb-2 block text-right">
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

                      {/* Quantity */}
                      <div>
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 sm:mb-2 block text-right">
                          כמות
                        </label>
                        <div className="flex items-center gap-2 justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setNewItemQuantity(q => Math.max(1, q - 1))}
                            disabled={newItemQuantity <= 1 || addingItem}
                            className="h-9 w-9 p-0"
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-200 w-8 text-center">
                            {newItemQuantity}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setNewItemQuantity(q => q + 1)}
                            disabled={addingItem}
                            className="h-9 w-9 p-0"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Unit Price */}
                      <div>
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 sm:mb-2 block text-right">
                          מחיר ליחידה (₪)
                          {newItemPrice ? (
                            <span className="mr-2 text-xs font-normal text-emerald-600 dark:text-emerald-400">
                              · מהיסטוריה
                            </span>
                          ) : (
                            <span className="mr-2 text-xs font-normal text-slate-400 dark:text-slate-500">
                              · אופציונלי
                            </span>
                          )}
                        </label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={newItemPrice}
                          onChange={(e) => setNewItemPrice(e.target.value)}
                          placeholder="0.00"
                          className="w-full text-right"
                          disabled={addingItem}
                          dir="ltr"
                        />
                      </div>

                      {/* Image */}
                      <div>
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 sm:mb-2 block text-right">
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
                    <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4 [dir=rtl]:flex-row-reverse mb-3 sm:mb-4">
                      <div className="flex-1 flex items-center gap-2 [dir=rtl]:flex-row-reverse min-w-0">
                        <CardTitle className="text-base sm:text-lg text-slate-900 dark:text-slate-50 text-right flex-shrink-0">
                          {t.myList}
                        </CardTitle>
                        {editingListTitle ? (
                          <div className="flex items-center gap-2 flex-1 [dir=rtl]:flex-row-reverse min-w-0">
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
                            className="flex-1 text-right text-slate-600 dark:text-slate-400 cursor-pointer hover:text-slate-900 dark:hover:text-slate-200 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 truncate min-w-0"
                            onClick={() => setEditingListTitle(true)}
                            title="לחץ לעריכת שם הרשימה"
                          >
                            {listTitle || 'רשימה ללא שם'}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 [dir=rtl]:flex-row-reverse">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (activeUserId) {
                              fetchGroceryListsWithItemCount(activeUserId, true)
                                .then(all => setCompletedListsForDropdown(all.filter(l => l.completed_at)))
                                .catch(() => setCompletedListsForDropdown([]));
                            }
                            setShowImportReceipt(true);
                          }}
                          className="text-emerald-600 hover:text-emerald-700"
                          title={t.importReceipt}
                        >
                          <Receipt className="h-4 w-4 sm:me-1" />
                          <span className="hidden sm:inline">{t.importReceipt}</span>
                        </Button>
                        <Button
                          onClick={() => { setCompleteListTotalCost(''); setShowCompleteDialog(true); }}
                          className="bg-green-600 hover:bg-green-700 text-white [dir=rtl]:flex-row-reverse"
                          size="sm"
                          disabled={completingListId !== null}
                          title={t.markListCompleted}
                        >
                          {completingListId ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin sm:me-1" />
                              <span className="hidden sm:inline">{t.markListCompleted}</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="h-4 w-4 sm:me-1" />
                              <span className="hidden sm:inline">{t.markListCompleted}</span>
                            </>
                          )}
                        </Button>
                      </div>
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
                      
                      // Separate items into not purchased, unavailable, and purchased
                      const notPurchasedItems = filteredItems.filter(item => !item.purchased && !item.unavailable);
                      const unavailableItems = filteredItems.filter(item => item.unavailable && !item.purchased);
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
                      const groupedUnavailable = groupByCategory(unavailableItems);
                      const groupedPurchased = groupByCategory(purchasedItems);
                      
                      const predictedTotal = items.reduce((sum, item) => sum + (item.estimated_price ?? 0) * item.quantity, 0);
                      const predictedTotalRounded = Math.round(predictedTotal * 100) / 100;

                      return (
                        <div className="space-y-4 sm:space-y-6">
                          {/* Header */}
                          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 sm:p-6 shadow-sm [dir=rtl]:text-right">
                            <h1 className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1 sm:mb-2">
                              🛒 רשימת הקניות שלי
                            </h1>
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                              <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                                {notPurchasedItems.length} פריטים חסרים{unavailableItems.length > 0 ? ` · ${unavailableItems.length} לא קיים` : ''} · {purchasedItems.length} נאספו
                              </div>
                              {predictedTotalRounded > 0 && (
                                <div className="text-xs sm:text-sm font-medium text-emerald-700 dark:text-emerald-400">
                                  עלות משוערת: ₪{predictedTotalRounded.toLocaleString()}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {/* Search and Sort Controls - Action Bar */}
                          <div className="sticky top-0 z-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 sm:p-4 shadow-sm [dir=rtl]:text-right">
                            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 [dir=rtl]:flex-row-reverse">
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
                            {filteredItems.length > 0 && (
                              <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 [dir=rtl]:flex-row-reverse">
                                <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 dark:text-slate-400">
                                  <input
                                    type="checkbox"
                                    checked={filteredItems.length > 0 && filteredItems.every((i) => selectedItemIds.has(i.id))}
                                    onChange={() => {
                                      if (filteredItems.every((i) => selectedItemIds.has(i.id))) {
                                        clearSelection();
                                      } else {
                                        selectAllVisible(filteredItems.map((i) => i.id));
                                        setSelectionModeActive(true);
                                      }
                                    }}
                                    disabled={bulkDeleting}
                                    className="w-4 h-4 rounded border-slate-400 text-slate-600 focus:ring-slate-500"
                                  />
                                  {t.selectAll}
                                </label>
                                {selectedItemIds.size > 0 && (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setShowBulkDeleteConfirm(true)}
                                      disabled={bulkDeleting}
                                      className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 border-red-200 dark:border-red-800"
                                    >
                                      {bulkDeleting ? (
                                        <Loader2 className="h-4 w-4 animate-spin me-2" />
                                      ) : null}
                                      {t.deleteSelected(selectedItemIds.size)}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={clearSelection}
                                      disabled={bulkDeleting}
                                      className="text-slate-600 dark:text-slate-400"
                                    >
                                      {t.clearSelection}
                                    </Button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                          
                          {/* Market price banner */}
                          {!marketBannerDismissed && marketBanner && marketBanner.recommendations.length > 0 && items.length > 0 && (() => {
                            const cheapest = marketBanner.recommendations[0];
                            return (
                              <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 text-sm">
                                <span className="text-emerald-700 dark:text-emerald-300 flex-1">
                                  לפי המחירים, <strong>{cheapest.chainName}</strong> הכי זול היום (כ-₪{cheapest.totalBasketCost.toFixed(0)}).
                                </span>
                                <button
                                  onClick={() => setMarketBannerDismissed(true)}
                                  className="text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300 flex-shrink-0"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            );
                          })()}

                          {(loadingBarcodeHelper || unmappedItems.length > 0) && (
                            <div className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50/80 dark:bg-amber-900/20 p-3 sm:p-4 space-y-2">
                              <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                                חסרים ברקודים להשוואת סופרים
                              </div>
                              <p className="text-xs text-amber-800 dark:text-amber-300">
                                הוסף ברקוד לפריטים הבאים פעם אחת, ואז ההשוואה היומית תתחיל להופיע אוטומטית.
                              </p>
                              {loadingBarcodeHelper && (
                                <div className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  בודק אילו פריטים עדיין לא ממופים...
                                </div>
                              )}
                              <div className="space-y-2">
                                {unmappedItems.map((entry) => (
                                  <div key={entry.itemName} className="flex flex-col sm:flex-row sm:items-center gap-2 bg-white dark:bg-slate-900 border border-amber-100 dark:border-amber-800 rounded-md p-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{entry.itemName}</div>
                                      <div className="text-xs text-slate-500 dark:text-slate-400">נרכש {entry.usageCount} פעמים</div>
                                    </div>
                                    <Input
                                      type="text"
                                      inputMode="numeric"
                                      pattern="[0-9]*"
                                      placeholder="ברקוד"
                                      value={barcodeDrafts[entry.itemName] || ''}
                                      onChange={(e) =>
                                        setBarcodeDrafts((prev) => ({ ...prev, [entry.itemName]: e.target.value }))
                                      }
                                      className="sm:w-[220px] bg-white dark:bg-slate-800"
                                    />
                                    <Button
                                      size="sm"
                                      onClick={() => handleSaveBarcodeMapping(entry.itemName)}
                                      disabled={savingBarcodeFor === entry.itemName}
                                      className="bg-amber-600 hover:bg-amber-700 text-white sm:w-auto"
                                    >
                                      {savingBarcodeFor === entry.itemName ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        'שמור ברקוד'
                                      )}
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Empty States */}
                          {searchQuery.trim() && filteredItems.length === 0 && (
                            <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                              <CardContent className="text-center py-8 [dir=rtl]:text-right">
                                <p className="text-slate-600 dark:text-slate-400 mb-4">
                                  לא נמצאו תוצאות עבור: <span className="font-semibold">&quot;{searchQuery}&quot;</span>
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
                          
                          {!searchQuery.trim() && notPurchasedItems.length === 0 && unavailableItems.length === 0 && purchasedItems.length > 0 && (
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
                                    <ul className="space-y-2 sm:space-y-3">
                                      {categoryItems.map((item) => (
                                        <GroceryItemRow key={item.id} item={item} variant="active" onTogglePurchased={handleTogglePurchased} onToggleUnavailable={handleToggleUnavailable} onQuantityChange={handleQuantityChange} onDelete={handleDeleteItem} onUpdateImage={handleUpdateItemImage} onAddPrice={handleOpenAddPrice} updatingItemId={updatingItemId} deletingItemId={deletingItemId} uploadingImageForItem={uploadingImageForItem} selectionModeActive={selectionModeActive} selectedItemIds={selectedItemIds} toggleItemSelection={toggleItemSelection} bulkDeleting={bulkDeleting} />
                                      ))}
                                    </ul>
                                  </div>
                                ))
                              ) : (
                                // Alphabetical list
                                <ul className="space-y-2 sm:space-y-3">
                                  {groupedNotPurchased['כל הפריטים']?.map((item) => (
                                    <GroceryItemRow key={item.id} item={item} variant="active" onTogglePurchased={handleTogglePurchased} onToggleUnavailable={handleToggleUnavailable} onQuantityChange={handleQuantityChange} onDelete={handleDeleteItem} onUpdateImage={handleUpdateItemImage} onAddPrice={handleOpenAddPrice} updatingItemId={updatingItemId} deletingItemId={deletingItemId} uploadingImageForItem={uploadingImageForItem} selectionModeActive={selectionModeActive} selectedItemIds={selectedItemIds} toggleItemSelection={toggleItemSelection} bulkDeleting={bulkDeleting} />
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
                                    <ul className="space-y-2 sm:space-y-3">
                                      {categoryItems.map((item) => (
                                        <GroceryItemRow key={item.id} item={item} variant="purchased" onTogglePurchased={handleTogglePurchased} onToggleUnavailable={handleToggleUnavailable} onQuantityChange={handleQuantityChange} onDelete={handleDeleteItem} onUpdateImage={handleUpdateItemImage} updatingItemId={updatingItemId} deletingItemId={deletingItemId} uploadingImageForItem={uploadingImageForItem} selectionModeActive={selectionModeActive} selectedItemIds={selectedItemIds} toggleItemSelection={toggleItemSelection} bulkDeleting={bulkDeleting} />
                                      ))}
                                    </ul>
                                  </div>
                                ))
                              ) : (
                                // Alphabetical list for purchased items
                                <ul className="space-y-2 sm:space-y-3">
                                  {groupedPurchased['כל הפריטים']?.map((item) => (
                                    <GroceryItemRow key={item.id} item={item} variant="purchased" onTogglePurchased={handleTogglePurchased} onToggleUnavailable={handleToggleUnavailable} onQuantityChange={handleQuantityChange} onDelete={handleDeleteItem} onUpdateImage={handleUpdateItemImage} updatingItemId={updatingItemId} deletingItemId={deletingItemId} uploadingImageForItem={uploadingImageForItem} selectionModeActive={selectionModeActive} selectedItemIds={selectedItemIds} toggleItemSelection={toggleItemSelection} bulkDeleting={bulkDeleting} />
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        )}

                          {/* Unavailable items section */}
                          {unavailableItems.length > 0 && (
                            <div>
                              <button
                                onClick={() => setUnavailableItemsExpanded(!unavailableItemsExpanded)}
                                className="w-full flex items-center justify-between p-3 mb-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors text-right [dir=rtl]:flex-row-reverse"
                              >
                                <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                                  🚫 {t.unavailableInStore} ({unavailableItems.length})
                                </h3>
                                <ChevronDown
                                  className={`h-4 w-4 text-amber-500 dark:text-amber-400 transition-transform duration-200 ${
                                    unavailableItemsExpanded ? 'rotate-180' : ''
                                  }`}
                                />
                              </button>
                              <div
                                className={`overflow-hidden transition-all duration-300 ${
                                  unavailableItemsExpanded ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'
                                }`}
                              >
                                {sortMode === 'category' ? (
                                  Object.entries(groupedUnavailable).map(([category, categoryItems]) => (
                                    <div key={category} className="mb-6">
                                      <h4 className="text-xs font-medium text-amber-600 dark:text-amber-500 mb-2 text-right">
                                        {category} ({categoryItems.length})
                                      </h4>
                                      <ul className="space-y-2 sm:space-y-3">
                                        {categoryItems.map((item) => (
                                          <GroceryItemRow key={item.id} item={item} variant="unavailable" onTogglePurchased={handleTogglePurchased} onToggleUnavailable={handleToggleUnavailable} onQuantityChange={handleQuantityChange} onDelete={handleDeleteItem} onUpdateImage={handleUpdateItemImage} updatingItemId={updatingItemId} deletingItemId={deletingItemId} uploadingImageForItem={uploadingImageForItem} selectionModeActive={selectionModeActive} selectedItemIds={selectedItemIds} toggleItemSelection={toggleItemSelection} bulkDeleting={bulkDeleting} />
                                        ))}
                                      </ul>
                                    </div>
                                  ))
                                ) : (
                                  <ul className="space-y-2 sm:space-y-3">
                                    {groupedUnavailable['כל הפריטים']?.map((item) => (
                                      <GroceryItemRow key={item.id} item={item} variant="unavailable" onTogglePurchased={handleTogglePurchased} onToggleUnavailable={handleToggleUnavailable} onQuantityChange={handleQuantityChange} onDelete={handleDeleteItem} onUpdateImage={handleUpdateItemImage} updatingItemId={updatingItemId} deletingItemId={deletingItemId} uploadingImageForItem={uploadingImageForItem} selectionModeActive={selectionModeActive} selectedItemIds={selectedItemIds} toggleItemSelection={toggleItemSelection} bulkDeleting={bulkDeleting} />
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

            {/* Second column: Previous List or Standalone Purchase */}
            {(viewingPreviousListId || viewingStandalonePurchaseId) && (
              <div className="hidden md:block space-y-6">
                {viewingPreviousListId ? previousListCardContent : standalonePurchaseCardContent}
              </div>
            )}
          </div>

          {/* Second column - Mobile: full-width drawer overlay */}
          <div className="md:hidden">
            <Drawer
              open={!!(viewingPreviousListId || viewingStandalonePurchaseId)}
              onOpenChange={(open) => {
                if (!open) handleClosePreviousList();
              }}
            >
              <DrawerContent
                side="right"
                className="w-[90vw] max-w-[420px] p-0 border-0 z-[100] overflow-y-auto"
              >
                <div className="p-4 pt-12">
                  {viewingPreviousListId ? previousListCardContent : standalonePurchaseCardContent}
                </div>
              </DrawerContent>
            </Drawer>
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

        {/* Floating Action Button - Add item (Mobile only) */}
        {showFab && activeUserId && selectedListId && (
          <button
            onClick={() => {
              addItemFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              setTimeout(() => {
                newItemNameInputRef.current?.focus();
              }, 500);
            }}
            className="fixed z-50 w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center md:hidden right-6 [dir=rtl]:right-auto [dir=rtl]:left-6"
            style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
            aria-label="הוסף פריט"
          >
            <Plus className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Complete List Confirmation Dialog */}
      <AlertDialog open={showCompleteDialog} onOpenChange={(open) => { if (!open) setCompleteListTotalCost(''); setShowCompleteDialog(open); }}>
        <AlertDialogContent className="[dir=rtl]:text-right">
          <AlertDialogHeader>
            <AlertDialogTitle>{t.markListCompleted}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.confirmMarkCompleted}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <label htmlFor="complete-total-cost" className="text-sm text-slate-600 dark:text-slate-400 block mb-1 text-right">
              {t.totalCostOptional}
            </label>
            <Input
              id="complete-total-cost"
              type="number"
              inputMode="decimal"
              min={0}
              step={0.01}
              placeholder="0"
              value={completeListTotalCost}
              onChange={(e) => setCompleteListTotalCost(e.target.value)}
              className="text-right"
            />
          </div>
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
            <AlertDialogCancel onClick={() => setListToDelete(null)} disabled={deletingPreviousList}>{t.cancel}</AlertDialogCancel>
            <Button
              onClick={handleDeletePreviousList}
              disabled={deletingPreviousList}
              className="bg-red-600 hover:bg-red-700"
            >
              {deletingPreviousList ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin me-2" />
                  {t.delete}
                </>
              ) : (
                t.delete
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Standalone Purchase Confirmation Dialog */}
      <AlertDialog open={showDeletePurchaseDialog} onOpenChange={setShowDeletePurchaseDialog}>
        <AlertDialogContent className="[dir=rtl]:text-right">
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteStandalonePurchase}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.confirmDeleteStandalonePurchase}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="[dir=rtl]:flex-row-reverse">
            <AlertDialogCancel onClick={() => setPurchaseToDelete(null)} disabled={deletingStandalonePurchase}>{t.cancel}</AlertDialogCancel>
            <Button
              onClick={handleDeleteStandalonePurchase}
              disabled={deletingStandalonePurchase}
              className="bg-red-600 hover:bg-red-700"
            >
              {deletingStandalonePurchase ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin me-2" />
                  {t.delete}
                </>
              ) : (
                t.delete
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Selected Items Confirmation Dialog */}
      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <AlertDialogContent className="[dir=rtl]:text-right">
          <AlertDialogHeader>
            <AlertDialogTitle>{t.delete}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.confirmDeleteSelected(selectedItemIds.size)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="[dir=rtl]:flex-row-reverse">
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={bulkDeleting}
            >
              {bulkDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin me-2" />
                  {t.delete}
                </>
              ) : (
                t.delete
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Shopping Assistant Floating Button - Bottom left (LTR) / right (RTL); one menu stays in top bar only */}
      {activeUserId && selectedListId && (
        <Button
          onClick={() => setShowAssistant(!showAssistant)}
          className={`fixed w-14 h-14 rounded-full shadow-2xl text-white border-0 z-50 left-6 [dir=rtl]:left-auto [dir=rtl]:right-6 transition-all duration-200 ${
            showAssistant 
              ? 'bg-gradient-to-br from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 scale-110' 
              : 'bg-gradient-to-br from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 hover:scale-110'
          }`}
          style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
          size="lg"
          title={showAssistant ? "סגור עוזר קניות" : "פתח עוזר קניות"}
        >
          <Bot className="h-6 w-6" />
        </Button>
      )}

      {/* Add Price Dialog */}
      <AlertDialog open={!!priceDialogItem} onOpenChange={(open) => { if (!open) { setPriceDialogItem(null); setPriceDialogValue(''); } }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>הוסף מחיר ליחידה</AlertDialogTitle>
            <AlertDialogDescription>
              {priceDialogItem?.name} — הזן מחיר ליחידה (₪) כדי לשפר את ההצעות העתידיות.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={priceDialogValue}
              onChange={(e) => setPriceDialogValue(e.target.value)}
              placeholder="0.00"
              className="text-right"
              dir="ltr"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleSavePriceDialog(); }}
            />
          </div>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction onClick={handleSavePriceDialog}>שמור</AlertDialogAction>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Receipt Panel */}
      {showImportReceipt && activeUserId && (
        <ImportReceiptPanel
          userId={activeUserId}
          preselectedListId={viewingPreviousListId}
          completedLists={completedListsForDropdown}
          onClose={() => setShowImportReceipt(false)}
          onRecordSaved={async () => {
            if (!activeUserId) return;
            try {
              if (viewingPreviousListId) {
                const records = await fetchPurchaseRecordsByListId(viewingPreviousListId, activeUserId);
                setPreviousListPurchases(records);
              }
              const standalone = await fetchStandalonePurchaseRecords(activeUserId);
              setStandalonePurchases(standalone);
            } catch {
              // Failed to reload
            }
          }}
        />
      )}

      {/* Item Match Settings - now a dedicated page at /settings */}

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
              } catch {
                // Failed to reload items - error already handled
              }
            }
          }}
          priorListId={viewingPreviousListId}
          priorListTotalCost={previousListMeta?.total_cost ?? null}
          onPriorListCostUpdated={async () => {
            if (viewingPreviousListId && activeUserId) {
              try {
                const meta = await getGroceryListById(viewingPreviousListId, activeUserId);
                setPreviousListMeta(meta);
              } catch {
                // Failed to refetch - keep current state
              }
            }
          }}
        />
      )}
    </div>
  );
}
