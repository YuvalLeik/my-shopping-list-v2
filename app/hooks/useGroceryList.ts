"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  saveGroceryList,
  loadGroceryList,
  completeGroceryList,
  getCompletedLists,
  deleteCompletedList,
  getOrCreateListId,
  addItemToDb,
  updateItemInDb,
  removeItemFromDb,
} from "@/lib/database";
import { GroceryItem, GroceryList, SortOption } from "../types";
import { getTodayDate } from "../lib/date-utils";
import { generateItemId } from "../lib/id-utils";
import { updateItemFrequencies } from "@/lib/frequency-tracker";
import { useRealtimeSync } from "./useRealtimeSync";
import { useToast } from "../components/Toast";

export function useGroceryList(user: any) {
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [currentDate, setCurrentDate] = useState<string>(getTodayDate());
  const [completedLists, setCompletedLists] = useState<GroceryList[]>([]);
  const [hasShownCompletionPrompt, setHasShownCompletionPrompt] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("Unpurchased first");
  const [listId, setListId] = useState<string | null>(null);
  const { showToast } = useToast();

  // Realtime sync — listens for changes from other family members
  const { markLocalOp } = useRealtimeSync({
    listId,
    setItems,
    localUserId: user?.id ?? null,
  });

  // Track whether we need a batch save (for debounce on date switch, etc.)
  const needsBatchSave = useRef(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const todayList = await loadGroceryList(getTodayDate());
      if (todayList) {
        setItems(todayList.items);
        setCurrentDate(todayList.date);
        setListId(todayList.listId);
      } else {
        setItems([]);
        setCurrentDate(getTodayDate());
        setListId(null);
      }
      const completed = await getCompletedLists();
      setCompletedLists(completed);
      setHasShownCompletionPrompt(false);
    } catch (error) {
      console.error("Failed to load data:", error);
      setItems([]);
      setCurrentDate(getTodayDate());
    }
  }, [user]);

  const completeList = useCallback(async () => {
    try {
      await updateItemFrequencies(items).catch((err) =>
        console.error("Failed to update frequencies:", err)
      );

      await completeGroceryList(currentDate);
      const completed = await getCompletedLists();
      setCompletedLists(completed);
      setItems([]);
      setListId(null);
      setCurrentDate(getTodayDate());
      setHasShownCompletionPrompt(false);
    } catch (error) {
      console.error("Failed to complete list:", error);
      showToast("שגיאה בעת השלמת הרשימה. נסה שוב.", "error");
    }
  }, [currentDate, items, showToast]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, loadData]);

  // Debounced batch save — only used as a fallback safety net
  useEffect(() => {
    if (!user || !needsBatchSave.current) return;
    needsBatchSave.current = false;
    const timeoutId = setTimeout(async () => {
      try {
        await saveGroceryList(currentDate, items, false);
      } catch (error) {
        console.error("Failed to save list:", error);
      }
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [items, currentDate, user]);

  // Auto-completion prompt
  useEffect(() => {
    if (!user) return;
    if (items.length > 0 && items.every((item) => item.purchased)) {
      const isAlreadyCompleted = completedLists.some(
        (list) => list.date === currentDate
      );
      if (!isAlreadyCompleted && !hasShownCompletionPrompt) {
        setHasShownCompletionPrompt(true);
        const userConfirmed = window.confirm(
          "כל הפריטים ברשימה נרכשו! האם סיימת את הקנייה ואתה רוצה להעביר את הרשימה לרשימות הקודמות?"
        );
        if (userConfirmed) {
          completeList();
        }
      }
    } else {
      setHasShownCompletionPrompt(false);
    }
  }, [items, currentDate, completedLists, hasShownCompletionPrompt, user, completeList]);

  const ensureListId = useCallback(async (): Promise<string> => {
    if (listId) return listId;
    const id = await getOrCreateListId(currentDate);
    setListId(id);
    return id;
  }, [listId, currentDate]);

  const addItem = useCallback(
    async (name: string, category: string, image?: string, quantity: number = 1) => {
      const newItem: GroceryItem = {
        id: generateItemId(),
        name,
        quantity,
        category: category as GroceryItem["category"],
        purchased: false,
        image,
      };
      setItems((prev) => [...prev, newItem]);
      markLocalOp(newItem.id);

      try {
        const lid = await ensureListId();
        await addItemToDb(lid, newItem);
      } catch (error) {
        console.error("Failed to add item to DB:", error);
        needsBatchSave.current = true;
      }
    },
    [ensureListId, markLocalOp]
  );

  const addItems = useCallback(
    async (newItems: GroceryItem[]) => {
      const itemsWithIds = newItems.map((item) => ({
        ...item,
        id: generateItemId(),
      }));
      setItems((prev) => [...prev, ...itemsWithIds]);

      try {
        const lid = await ensureListId();
        for (const item of itemsWithIds) {
          markLocalOp(item.id);
          await addItemToDb(lid, item);
        }
      } catch (error) {
        console.error("Failed to add items to DB:", error);
        needsBatchSave.current = true;
      }
    },
    [ensureListId, markLocalOp]
  );

  const togglePurchased = useCallback(
    async (id: string) => {
      let newPurchased = false;
      setItems((prev) =>
        prev.map((item) => {
          if (item.id === id) {
            newPurchased = !item.purchased;
            return { ...item, purchased: newPurchased };
          }
          return item;
        })
      );
      markLocalOp(id);

      try {
        await updateItemInDb(id, { purchased: newPurchased });
      } catch (error) {
        console.error("Failed to toggle purchased:", error);
        needsBatchSave.current = true;
      }
    },
    [markLocalOp]
  );

  const updateQuantity = useCallback(
    async (id: string, delta: number) => {
      let newQuantity = 1;
      setItems((prev) =>
        prev.map((item) => {
          if (item.id === id) {
            newQuantity = Math.max(1, item.quantity + delta);
            return { ...item, quantity: newQuantity };
          }
          return item;
        })
      );
      markLocalOp(id);

      try {
        await updateItemInDb(id, { quantity: newQuantity });
      } catch (error) {
        console.error("Failed to update quantity:", error);
        needsBatchSave.current = true;
      }
    },
    [markLocalOp]
  );

  const deleteItem = useCallback(
    async (id: string) => {
      setItems((prev) => prev.filter((item) => item.id !== id));
      markLocalOp(id);

      try {
        await removeItemFromDb(id);
      } catch (error) {
        console.error("Failed to delete item:", error);
        needsBatchSave.current = true;
      }
    },
    [markLocalOp]
  );

  const clearPurchased = useCallback(async () => {
    if (
      window.confirm(
        "האם אתה בטוח שברצונך למחוק את כל הפריטים שנרכשו? פעולה זו לא ניתנת לביטול."
      )
    ) {
      const purchasedIds = items
        .filter((item) => item.purchased)
        .map((item) => item.id);
      setItems((prev) => prev.filter((item) => !item.purchased));

      for (const id of purchasedIds) {
        markLocalOp(id);
        removeItemFromDb(id).catch((err) =>
          console.error("Failed to delete purchased item:", err)
        );
      }
    }
  }, [items, markLocalOp]);

  const handleCompleteList = useCallback(async () => {
    if (items.length === 0) return;
    if (
      window.confirm(
        "האם אתה בטוח שברצונך לסמן את הרשימה כהושלמה? כל הפריטים יישמרו ברשימות הקודמות."
      )
    ) {
      await completeList();
    }
  }, [items.length, completeList]);

  const handleDeleteList = useCallback(async (listToDelete: GroceryList) => {
    try {
      await deleteCompletedList(listToDelete.date);
      const completed = await getCompletedLists();
      setCompletedLists(completed);
    } catch (error) {
      console.error("Failed to delete list:", error);
      showToast("שגיאה בעת מחיקת הרשימה. נסה שוב.", "error");
    }
  }, [showToast]);

  const changeDate = useCallback(
    async (newDate: string) => {
      // Save current list before switching
      try {
        await saveGroceryList(currentDate, items, false);
      } catch (error) {
        console.error("Failed to save current list:", error);
      }

      const existingCompletedList = completedLists.find(
        (l) => l.date === newDate
      );

      if (existingCompletedList) {
        showToast("רשימה לתאריך זה כבר הושלמה", "info");
        setCurrentDate(newDate);
        setItems([]);
        setListId(null);
        setHasShownCompletionPrompt(false);
        return;
      }

      try {
        const listForNewDate = await loadGroceryList(newDate);
        if (listForNewDate) {
          setItems(listForNewDate.items);
          setCurrentDate(newDate);
          setListId(listForNewDate.listId);
          setHasShownCompletionPrompt(false);
        } else {
          setCurrentDate(newDate);
          setItems([]);
          setListId(null);
          setHasShownCompletionPrompt(false);
        }
      } catch (error) {
        console.error("Failed to load list for new date:", error);
        setCurrentDate(newDate);
        setItems([]);
        setListId(null);
        setHasShownCompletionPrompt(false);
      }
    },
    [currentDate, items, completedLists, showToast]
  );

  const filteredAndSortedItems = useMemo(() => {
    let filtered = items.filter((item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    filtered = [...filtered].sort((a, b) => {
      switch (sortOption) {
        case "A-Z":
          return a.name.localeCompare(b.name, "he");
        case "Category":
          if (a.category === b.category) {
            return a.name.localeCompare(b.name, "he");
          }
          if (!a.category) return 1;
          if (!b.category) return -1;
          return a.category.localeCompare(b.category);
        case "Unpurchased first":
          if (a.purchased === b.purchased) {
            return a.name.localeCompare(b.name, "he");
          }
          return a.purchased ? 1 : -1;
        default:
          return 0;
      }
    });

    return filtered;
  }, [items, searchQuery, sortOption]);

  const purchasedCount = items.filter((item) => item.purchased).length;
  const allPurchased = items.length > 0 && items.every((item) => item.purchased);

  return {
    items,
    setItems,
    currentDate,
    completedLists,
    searchQuery,
    setSearchQuery,
    sortOption,
    setSortOption,
    filteredAndSortedItems,
    purchasedCount,
    allPurchased,
    loadData,
    addItem,
    addItems,
    togglePurchased,
    updateQuantity,
    deleteItem,
    clearPurchased,
    listId,
    completeList: handleCompleteList,
    deleteList: handleDeleteList,
    changeDate,
  };
}
