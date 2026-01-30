'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { X, Send, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createGroceryItem, GroceryItem } from '@/lib/groceryItems';
import { getCategories, getSuggestionsByPrefix, getItemsByCategory, ShoppingItemCatalog, filterExistingItems, normalizeItemName } from '@/lib/shoppingItems';
import { toast } from 'sonner';

interface AssistantPanelProps {
  userId: string | null;
  selectedListId: string | null;
  currentListItems?: GroceryItem[]; // Current items in the active list
  onClose: () => void;
  onItemsAdded?: () => void;
}

type AssistantState = 'IDLE' | 'CHOOSING_CATEGORY' | 'SHOWING_ITEMS_FOR_CATEGORY';

export function AssistantPanel({ userId, selectedListId, currentListItems = [], onClose, onItemsAdded }: AssistantPanelProps) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Array<{ text: string; isUser: boolean }>>([]);
  const [state, setState] = useState<AssistantState>('IDLE');
  const [loading, setLoading] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryItems, setCategoryItems] = useState<ShoppingItemCatalog[]>([]);
  const [prefixSuggestions, setPrefixSuggestions] = useState<ShoppingItemCatalog[]>([]);

  // Initialize with greeting
  useEffect(() => {
    if (userId && selectedListId) {
      setMessages([{ text: 'שלום! אני עוזר הקניות שלך. איך אוכל לעזור?', isUser: false }]);
      setState('IDLE');
      setMessage('');
      setCategories([]);
      setSelectedCategory(null);
      setCategoryItems([]);
      setPrefixSuggestions([]);
    }
  }, [userId, selectedListId]);

  // Load categories when entering CHOOSING_CATEGORY state
  useEffect(() => {
    if (state === 'CHOOSING_CATEGORY' && categories.length === 0) {
      loadCategories();
    }
  }, [state, categories.length]);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const cats = await getCategories();
      if (cats.length === 0) {
        setMessages(prev => [
          ...prev,
          { text: 'אין עדיין קטגוריות במאגר. נסה להוסיף פריטים לרשימה כדי ליצור קטגוריות.', isUser: false },
        ]);
        setState('IDLE');
      } else {
        setCategories(cats);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error('שגיאה בטעינת קטגוריות', {
        description: errorMessage,
      });
      setMessages(prev => [
        ...prev,
        { text: 'שגיאה בטעינת קטגוריות. נסה שוב מאוחר יותר.', isUser: false },
      ]);
      setState('IDLE');
    } finally {
      setLoading(false);
    }
  };

  const loadCategoryItems = async (category: string) => {
    setLoading(true);
    try {
      // Get all items from category
      const allItems = await getItemsByCategory(category);
      
      // Filter out items that already exist in the current list
      const filteredItems = filterExistingItems(allItems, currentListItems);
      
      setCategoryItems(filteredItems);
      setSelectedCategory(category);
      setState('SHOWING_ITEMS_FOR_CATEGORY');
      
      if (allItems.length === 0) {
        setMessages(prev => [
          ...prev,
          { text: `אין עדיין פריטים בקטגוריה "${category}" במאגר הכללי.`, isUser: false },
        ]);
      } else if (filteredItems.length === 0) {
        setMessages(prev => [
          ...prev,
          { text: `נראה שכבר הוספת את הפריטים המרכזיים בקטגוריה "${category}". רוצה קטגוריה אחרת או להוסיף פריט חדש?`, isUser: false },
        ]);
      } else {
        setMessages(prev => [
          ...prev,
          { text: `נמצאו ${filteredItems.length} פריטים בקטגוריית "${category}" שחסרים ברשימה שלך:`, isUser: false },
        ]);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error('שגיאה בטעינת פריטים', {
        description: errorMessage,
      });
      setMessages(prev => [
        ...prev,
        { text: 'שגיאה בטעינת פריטים. נסה שוב מאוחר יותר.', isUser: false },
      ]);
      setState('CHOOSING_CATEGORY');
    } finally {
      setLoading(false);
    }
  };

  const loadPrefixSuggestions = async (prefix: string) => {
    if (prefix.trim().length < 2) {
      setPrefixSuggestions([]);
      return;
    }

    try {
      const suggestions = await getSuggestionsByPrefix(prefix);
      setPrefixSuggestions(suggestions);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error('שגיאה בחיפוש הצעות', {
        description: errorMessage,
      });
      setPrefixSuggestions([]);
    }
  };

  const handleSend = async () => {
    if (!message.trim() || !userId || !selectedListId) return;

    const userMessage = message.trim();
    setMessages(prev => [...prev, { text: userMessage, isUser: true }]);
    setMessage('');
    setPrefixSuggestions([]);

    // Check for suggestion/help keywords
    const lowerMessage = userMessage.toLowerCase();
    const suggestionKeywords = ['מה שכחתי', 'מה חסר לי', 'מה חסר', 'תציע', 'הצע', 'אני צריך', 'מה להוסיף', 'מה לקנות', 'מה כדאי', 'מה עוד'];
    const isAskingForSuggestions = suggestionKeywords.some(keyword => lowerMessage.includes(keyword));

    if (isAskingForSuggestions) {
      // Show categories
      setState('CHOOSING_CATEGORY');
      setMessages(prev => [
        ...prev,
        { text: 'בחר קטגוריה כדי לראות פריטים:', isUser: false },
      ]);
      return;
    }

    // Check if it's a prefix search (short text, 2+ characters)
    if (userMessage.length >= 2 && userMessage.length <= 20) {
      try {
        const suggestions = await getSuggestionsByPrefix(userMessage);
        if (suggestions.length > 0) {
          setPrefixSuggestions(suggestions);
          setMessages(prev => [
            ...prev,
            { text: `מצאתי ${suggestions.length} הצעות עבור "${userMessage}":`, isUser: false },
          ]);
          // Stay in IDLE state to show suggestions
          return;
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        toast.error('שגיאה בחיפוש הצעות', {
          description: errorMessage,
        });
      }
    }

    // Default: show categories or help
    setState('CHOOSING_CATEGORY');
    setMessages(prev => [
      ...prev,
      { text: 'לא בטוח למה התכוונת. בחר קטגוריה או נסה לכתוב שם פריט:', isUser: false },
    ]);
  };

  const handleCategorySelect = (category: string) => {
    loadCategoryItems(category);
  };

  const handleAddItem = async (item: ShoppingItemCatalog) => {
    if (!selectedListId) {
      toast.error('אנא בחר רשימה תחילה');
      return;
    }

    // Normalize item name for comparison
    const normalizedItemName = normalizeItemName(item.name);
    
    // Optimistic update: Remove item from local state immediately
    let removedFromCategory = false;
    let removedFromPrefix = false;
    let removedItem: ShoppingItemCatalog | null = null;

    if (state === 'SHOWING_ITEMS_FOR_CATEGORY') {
      // Remove from categoryItems
      const itemIndex = categoryItems.findIndex(i => normalizeItemName(i.name) === normalizedItemName);
      if (itemIndex !== -1) {
        removedItem = categoryItems[itemIndex];
        setCategoryItems(prev => prev.filter((_, idx) => idx !== itemIndex));
        removedFromCategory = true;
      }
    } else if (state === 'IDLE' && prefixSuggestions.length > 0) {
      // Remove from prefixSuggestions
      const itemIndex = prefixSuggestions.findIndex(i => normalizeItemName(i.name) === normalizedItemName);
      if (itemIndex !== -1) {
        removedItem = prefixSuggestions[itemIndex];
        setPrefixSuggestions(prev => prev.filter((_, idx) => idx !== itemIndex));
        removedFromPrefix = true;
      }
    }

    setAddingItem(true);
    try {
      await createGroceryItem(
        selectedListId,
        item.name,
        1,
        item.category || 'ללא קטגוריה',
        item.image_url || null
      );
      toast.success(`נוסף "${item.name}" לרשימה`);
      setMessages(prev => [
        ...prev,
        { text: `נוסף "${item.name}" לרשימה`, isUser: false },
      ]);
      
      if (onItemsAdded) {
        onItemsAdded();
      }

      // If we're in category view, offer to add more from same category
      if (state === 'SHOWING_ITEMS_FOR_CATEGORY' && selectedCategory) {
        setMessages(prev => [
          ...prev,
          { text: 'רוצה להוסיף עוד פריטים מאותה קטגוריה?', isUser: false },
        ]);
      }
    } catch (err) {
      // Restore item to local state if addition failed
      if (removedItem) {
        if (removedFromCategory) {
          setCategoryItems(prev => [...prev, removedItem!]);
        } else if (removedFromPrefix) {
          setPrefixSuggestions(prev => [...prev, removedItem!]);
        }
      }

      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`נכשל בהוספת "${item.name}"`, {
        description: errorMessage,
      });
      setMessages(prev => [
        ...prev,
        { text: `נכשל בהוספת "${item.name}"`, isUser: false },
      ]);
    } finally {
      setAddingItem(false);
    }
  };

  const handleBackToCategories = () => {
    setState('CHOOSING_CATEGORY');
    setSelectedCategory(null);
    setCategoryItems([]);
    setMessages(prev => [
      ...prev,
      { text: 'בחר קטגוריה:', isUser: false },
    ]);
  };

  const handleBackToChat = () => {
    setState('IDLE');
    setSelectedCategory(null);
    setCategoryItems([]);
    setCategories([]);
    setPrefixSuggestions([]);
    setMessages(prev => [
      ...prev,
      { text: 'איך אוכל לעזור?', isUser: false },
    ]);
  };

  return (
    <Card className="fixed bottom-24 left-6 w-96 shadow-2xl border-slate-200 bg-white dark:bg-slate-900 z-50 [dir=rtl]:left-auto [dir=rtl]:right-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between [dir=rtl]:flex-row-reverse">
          <CardTitle className="text-lg text-slate-900 dark:text-slate-50">עוזר רשימת קניות</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-6 w-6 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Messages area */}
        <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 min-h-[150px] max-h-[200px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-purple-600 dark:text-purple-400 me-2" />
              <span className="text-sm text-slate-600 dark:text-slate-400">טוען...</span>
            </div>
          ) : messages.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">
              אין הודעות כרגע
            </p>
          ) : (
            <div className="space-y-2">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`p-2 rounded text-sm ${
                    msg.isUser
                      ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 ml-8 [dir=rtl]:ml-0 [dir=rtl]:mr-8'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 mr-8 [dir=rtl]:mr-0 [dir=rtl]:ml-8'
                  }`}
                >
                  <p>{msg.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Category selection */}
        {state === 'CHOOSING_CATEGORY' && (
          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 max-h-[300px] overflow-y-auto">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-3 text-right">
              בחר קטגוריה:
            </p>
            {categories.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {categories.map((category) => (
                  <Button
                    key={category}
                    variant="outline"
                    size="sm"
                    onClick={() => handleCategorySelect(category)}
                    className="text-right justify-start [dir=rtl]:justify-end"
                    disabled={loading}
                  >
                    {category}
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">
                טוען קטגוריות...
              </p>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBackToChat}
              className="mt-2 w-full"
            >
              חזור לצ&apos;אט
            </Button>
          </div>
        )}

        {/* Items for selected category */}
        {state === 'SHOWING_ITEMS_FOR_CATEGORY' && selectedCategory && (
          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 max-h-[300px] overflow-y-auto">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-3 text-right">
              קטגוריה: {selectedCategory}
            </p>
            {categoryItems.length > 0 ? (
              <div className="space-y-2">
                {categoryItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2 rounded border bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 [dir=rtl]:flex-row-reverse"
                  >
                    <div className="flex items-center gap-2 flex-1 [dir=rtl]:flex-row-reverse">
                      {item.image_url ? (
                        <Image
                          src={item.image_url}
                          alt={item.name}
                          width={32}
                          height={32}
                          unoptimized
                          className="w-8 h-8 rounded object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                          <Plus className="h-4 w-4 text-slate-400" />
                        </div>
                      )}
                      <span className="text-sm text-right flex-1">{item.name}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleAddItem(item)}
                      disabled={addingItem}
                      className="h-7 px-2 text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/20 disabled:opacity-50"
                    >
                      {addingItem ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Plus className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">
                  אין עדיין פריטים בקטגוריה הזו
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBackToCategories}
                  className="w-full"
                >
                  חזור לקטגוריות
                </Button>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBackToCategories}
              className="mt-2 w-full"
            >
              חזור לקטגוריות
            </Button>
          </div>
        )}

        {/* Prefix suggestions */}
        {state === 'IDLE' && prefixSuggestions.length > 0 && (
          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 max-h-[300px] overflow-y-auto">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-3 text-right">
              הצעות:
            </p>
            <div className="space-y-2">
              {prefixSuggestions.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-2 rounded border bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 [dir=rtl]:flex-row-reverse"
                >
                  <div className="flex items-center gap-2 flex-1 [dir=rtl]:flex-row-reverse">
                    {item.image_url ? (
                      <Image
                        src={item.image_url}
                        alt={item.name}
                        width={32}
                        height={32}
                        unoptimized
                        className="w-8 h-8 rounded object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                        <Plus className="h-4 w-4 text-slate-400" />
                      </div>
                    )}
                    <span className="text-sm text-right flex-1">{item.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAddItem(item)}
                    disabled={addingItem}
                    className="h-7 px-2 text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/20 disabled:opacity-50"
                  >
                    {addingItem ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Chat input */}
        {state === 'IDLE' && (
          <div className="flex gap-2 [dir=rtl]:flex-row-reverse">
            <Input
              type="text"
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                if (e.target.value.trim().length >= 2) {
                  loadPrefixSuggestions(e.target.value);
                } else {
                  setPrefixSuggestions([]);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="שאל אותי משהו או כתוב שם פריט..."
              className="flex-1 text-right"
              disabled={addingItem || loading}
            />
            <Button
              onClick={handleSend}
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 text-white"
              disabled={addingItem || !message.trim() || loading}
            >
              {loading || addingItem ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        )}

        {/* Action buttons when in IDLE */}
        {state === 'IDLE' && (
          <div className="flex gap-2 [dir=rtl]:flex-row-reverse">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => {
                setState('CHOOSING_CATEGORY');
                setMessages(prev => [
                  ...prev,
                  { text: 'בחר קטגוריה:', isUser: false },
                ]);
              }}
              disabled={loading}
            >
              הצג הצעות
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
