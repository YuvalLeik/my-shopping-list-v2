import { fetchGroceryListsWithItemCount } from './groceryLists';
import { fetchGroceryItems } from './groceryItems';
import { GroceryItem } from './groceryItems';

export interface SuggestedItem {
  name: string;
  category: string;
  frequency: number; // How many times it appeared in previous lists
  lastUsed?: string; // Last time it was used
}

/**
 * Analyzes previous completed lists and suggests items based on frequency and recency
 */
export async function analyzePreviousLists(userId: string): Promise<SuggestedItem[]> {
  try {
    // Get all completed lists for this user
    const allLists = await fetchGroceryListsWithItemCount(userId, true);
    const completedLists = allLists.filter(
      list => list.completed_at !== null && list.completed_at !== undefined
    );

    if (completedLists.length === 0) {
      return [];
    }

    // Get items from all completed lists
    const allItems: GroceryItem[] = [];
    for (const list of completedLists) {
      try {
        const items = await fetchGroceryItems(list.id, userId);
        allItems.push(...items);
      } catch {
        // Silently fail - continue with other lists
      }
    }

    if (allItems.length === 0) {
      return [];
    }

    // Count frequency of each item
    const itemMap = new Map<string, { count: number; lastUsed: string; category: string }>();

    for (const item of allItems) {
      const key = item.name.toLowerCase().trim();
      const existing = itemMap.get(key);

      if (existing) {
        existing.count += 1;
        // Keep the most recent date
        if (item.created_at > existing.lastUsed) {
          existing.lastUsed = item.created_at;
        }
        // Prefer non-empty category
        if (item.category && item.category !== 'ללא קטגוריה') {
          existing.category = item.category;
        }
      } else {
        itemMap.set(key, {
          count: 1,
          lastUsed: item.created_at,
          category: item.category || 'ללא קטגוריה',
        });
      }
    }

    // Convert to array and sort by frequency (most frequent first), then by recency
    // Find original names to preserve Hebrew text properly
    const originalNames = new Map<string, string>();
    for (const item of allItems) {
      const key = item.name.toLowerCase().trim();
      if (!originalNames.has(key)) {
        originalNames.set(key, item.name);
      }
    }

    const suggestions: SuggestedItem[] = Array.from(itemMap.entries())
      .map(([key, data]) => ({
        name: originalNames.get(key) || key, // Use original name to preserve Hebrew
        category: data.category,
        frequency: data.count,
        lastUsed: data.lastUsed,
      }))
      .sort((a, b) => {
        // First sort by frequency (descending)
        if (b.frequency !== a.frequency) {
          return b.frequency - a.frequency;
        }
        // Then by recency (most recent first)
        if (a.lastUsed && b.lastUsed) {
          return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
        }
        return 0;
      });

    // Return top 10 most frequent items
    return suggestions.slice(0, 10);
  } catch {
    // Error analyzing previous lists - return empty
    return [];
  }
}

/**
 * Get smart suggestions message based on previous lists
 */
export function getSuggestionMessage(suggestions: SuggestedItem[]): string {
  if (suggestions.length === 0) {
    return 'אין לי הצעות כרגע. ברגע שתסיים רשימות, אוכל להציע לך פריטים חכמים!';
  }

  if (suggestions.length === 1) {
    return `הצעתי לך להוסיף "${suggestions[0].name}" - זה פריט שהופיע ${suggestions[0].frequency} פעמים ברשימות הקודמות שלך.`;
  }

  const topItems = suggestions.slice(0, 3).map(s => s.name).join(', ');
  return `תבסס על הרשימות הקודמות שלך, אני מציע לך להוסיף: ${topItems} ועוד ${suggestions.length - 3} פריטים נוספים.`;
}

/**
 * Find items that were in previous lists but are missing from current list
 */
export async function findMissingItems(userId: string, currentListId: string): Promise<SuggestedItem[]> {
  try {
    // Get current list items
    const currentItems = await fetchGroceryItems(currentListId, userId);
    const currentItemNames = new Set(currentItems.map(item => item.name.toLowerCase().trim()));

    // Get all items from previous completed lists
    const allLists = await fetchGroceryListsWithItemCount(userId, true);
    const completedLists = allLists.filter(
      list => list.completed_at !== null && list.completed_at !== undefined && list.id !== currentListId
    );

    if (completedLists.length === 0) {
      return [];
    }

    // Get items from all completed lists
    const allItems: GroceryItem[] = [];
    for (const list of completedLists) {
      try {
        const items = await fetchGroceryItems(list.id, userId);
        allItems.push(...items);
      } catch {
        // Silently fail - continue with other lists
      }
    }

    if (allItems.length === 0) {
      return [];
    }

    // Count frequency of items that are NOT in current list
    const itemMap = new Map<string, { count: number; lastUsed: string; category: string }>();
    const originalNames = new Map<string, string>();

    for (const item of allItems) {
      const key = item.name.toLowerCase().trim();
      
      // Skip if already in current list
      if (currentItemNames.has(key)) {
        continue;
      }

      if (!originalNames.has(key)) {
        originalNames.set(key, item.name);
      }

      const existing = itemMap.get(key);
      if (existing) {
        existing.count += 1;
        if (item.created_at > existing.lastUsed) {
          existing.lastUsed = item.created_at;
        }
        if (item.category && item.category !== 'ללא קטגוריה') {
          existing.category = item.category;
        }
      } else {
        itemMap.set(key, {
          count: 1,
          lastUsed: item.created_at,
          category: item.category || 'ללא קטגוריה',
        });
      }
    }

    // Convert to array and sort
    const suggestions: SuggestedItem[] = Array.from(itemMap.entries())
      .map(([key, data]) => ({
        name: originalNames.get(key) || key,
        category: data.category,
        frequency: data.count,
        lastUsed: data.lastUsed,
      }))
      .sort((a, b) => {
        if (b.frequency !== a.frequency) {
          return b.frequency - a.frequency;
        }
        if (a.lastUsed && b.lastUsed) {
          return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
        }
        return 0;
      });

    return suggestions.slice(0, 15); // Return more items for missing items
  } catch {
    // Error finding missing items - return empty
    return [];
  }
}

/**
 * Normalize Hebrew text for better matching (remove diacritics, normalize spacing)
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[\u0591-\u05C7]/g, '') // Remove Hebrew diacritics (nikud)
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[^\u0590-\u05FF0-9\s]/g, ''); // Keep Hebrew letters, numbers, and spaces
}

/**
 * Check if text contains any of the keywords (with fuzzy matching)
 */
function containsKeywords(text: string, keywords: string[]): boolean {
  const normalized = normalizeText(text);
  
  // Direct match
  if (keywords.some(keyword => normalized.includes(normalizeText(keyword)))) {
    return true;
  }
  
  // Check individual words
  const words = normalized.split(/\s+/);
  const normalizedKeywords = keywords.map(k => normalizeText(k));
  
  // Check if any keyword is contained in the message
  for (const keyword of normalizedKeywords) {
    const keywordWords = keyword.split(/\s+/);
    
    // If keyword is a single word, check if it appears in message
    if (keywordWords.length === 1) {
      if (words.some(word => word.includes(keywordWords[0]) || keywordWords[0].includes(word))) {
        return true;
      }
    } else {
      // For multi-word keywords, check if all words appear (in any order)
      const allWordsPresent = keywordWords.every(kw => 
        words.some(word => word.includes(kw) || kw.includes(word))
      );
      if (allWordsPresent) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Extract category from message if mentioned
 */
export function extractCategoryFromMessage(message: string): string | null {
  const lowerMessage = normalizeText(message);
  
  // Map of category names and their synonyms/partial matches
  // Order matters - check more specific first
  const categoryMap: Array<{ category: string; keywords: string[] }> = [
    {
      category: 'ירקות ופירות',
      keywords: ['ירקות ופירות', 'ירקות ופרי', 'ירק ופירות', 'ירק ופרי', 'ירקות', 'פירות', 'ירק', 'פרי'],
    },
    {
      category: 'מוצרי חלב וביצים',
      keywords: ['מוצרי חלב וביצים', 'חלב וביצים', 'חלב וביצה', 'מוצרי חלב', 'חלב', 'ביצים', 'ביצה'],
    },
    {
      category: 'בשר ודגים',
      keywords: ['בשר ודגים', 'בשר ודג', 'בשר', 'דגים', 'דג', 'עוף', 'עופות'],
    },
    {
      category: 'מוצרי ניקיון והיגיינה',
      keywords: ['מוצרי ניקיון והיגיינה', 'מוצרי ניקיון', 'חומרי ניקיון', 'ניקיון', 'היגיינה'],
    },
    {
      category: 'משקאות',
      keywords: ['משקאות', 'משקה', 'שתייה'],
    },
    {
      category: 'מזווה',
      keywords: ['מזווה', 'מזון יבש'],
    },
    {
      category: 'קפואים',
      keywords: ['קפואים', 'קפוא', 'קפואה', 'קפואות', 'מוצרים קפואים', 'מזון קפוא'],
    },
    {
      category: 'אחר',
      keywords: ['אחר', 'אחרים'],
    },
  ];

  // Check each category (more specific first)
  for (const { category, keywords } of categoryMap) {
    for (const keyword of keywords) {
      const normalizedKeyword = normalizeText(keyword);
      // Check if keyword appears as whole word or part of word
      const words = lowerMessage.split(/\s+/);
      if (words.some(word => word.includes(normalizedKeyword) || normalizedKeyword.includes(word))) {
        return category;
      }
    }
  }

  return null;
}

/**
 * Check if message is asking about past purchases/history
 */
function isAskingAboutHistory(message: string): boolean {
  const lowerMessage = normalizeText(message);
  const historyKeywords = [
    // Past tense of "buy"
    'קניתי', 'קנינו', 'קנית', 'קנתה', 'קנו', 'קנת',
    // "What I bought" variations
    'מה קניתי', 'מה קנינו', 'מה קנית', 'מה קנתה', 'מה קנו',
    // "Which products/items" variations
    'איזה מוצרים', 'איזה פריטים', 'איזה מוצר', 'איזה פריט',
    'איזה מוצרים קניתי', 'איזה פריטים קניתי',
    'איזה מוצרים קנינו', 'איזה פריטים קנינו',
    // "What was/were" variations
    'מה היתה', 'מה היו', 'מה היה', 'מה היו',
    // "What I bought in" variations
    'מה קניתי ב', 'מה קנינו ב', 'מה קנית ב',
    'מה קניתי בקטגוריה', 'מה קניתי בקטגוריית',
    'מה קנינו בקטגוריה', 'מה קנינו בקטגוריית',
    // "Show me what" variations
    'תראה לי מה', 'תראי לי מה', 'תראו לי מה',
    'הראה לי מה', 'הראי לי מה', 'הראו לי מה',
    // "What did I buy" variations
    'מה קניתי', 'מה קנינו', 'מה קנית',
    // Other history-related phrases
    'היסטוריה', 'רשומות', 'מה היה בעבר',
    'מה קניתי בעבר', 'מה קנינו בעבר',
  ];

  return containsKeywords(lowerMessage, historyKeywords);
}

/**
 * Get the most recent completed list
 */
export async function getMostRecentCompletedList(userId: string): Promise<{ listId: string; items: GroceryItem[] } | null> {
  try {
    const allLists = await fetchGroceryListsWithItemCount(userId, true);
    const completedLists = allLists.filter(
      list => list.completed_at !== null && list.completed_at !== undefined
    );

    if (completedLists.length === 0) {
      return null;
    }

    // Get the most recent completed list (first in sorted array)
    const mostRecentList = completedLists[0];
    const items = await fetchGroceryItems(mostRecentList.id, userId);

    return {
      listId: mostRecentList.id,
      items,
    };
  } catch {
    // Error getting most recent completed list - return null
    return null;
  }
}

/**
 * Get items from a specific category in previous lists
 */
export async function getItemsByCategory(userId: string, category: string): Promise<SuggestedItem[]> {
  try {
    const allLists = await fetchGroceryListsWithItemCount(userId, true);
    const completedLists = allLists.filter(
      list => list.completed_at !== null && list.completed_at !== undefined
    );

    if (completedLists.length === 0) {
      return [];
    }

    const allItems: GroceryItem[] = [];
    for (const list of completedLists) {
      try {
        const items = await fetchGroceryItems(list.id, userId);
        allItems.push(...items);
      } catch {
        // Silently fail - continue with other lists
      }
    }

    // Filter by category
    const categoryItems = allItems.filter(item => {
      const itemCategory = item.category || 'ללא קטגוריה';
      return itemCategory === category;
    });

    if (categoryItems.length === 0) {
      return [];
    }

    // Count frequency
    const itemMap = new Map<string, { count: number; lastUsed: string; category: string }>();
    const originalNames = new Map<string, string>();

    for (const item of categoryItems) {
      const key = item.name.toLowerCase().trim();
      if (!originalNames.has(key)) {
        originalNames.set(key, item.name);
      }

      const existing = itemMap.get(key);
      if (existing) {
        existing.count += 1;
        if (item.created_at > existing.lastUsed) {
          existing.lastUsed = item.created_at;
        }
      } else {
        itemMap.set(key, {
          count: 1,
          lastUsed: item.created_at,
          category: item.category || category,
        });
      }
    }

    const suggestions: SuggestedItem[] = Array.from(itemMap.entries())
      .map(([key, data]) => ({
        name: originalNames.get(key) || key,
        category: data.category,
        frequency: data.count,
        lastUsed: data.lastUsed,
      }))
      .sort((a, b) => {
        if (b.frequency !== a.frequency) {
          return b.frequency - a.frequency;
        }
        if (a.lastUsed && b.lastUsed) {
          return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
        }
        return 0;
      });

    return suggestions;
  } catch {
    // Error getting items by category - return empty
    return [];
  }
}

/**
 * Check if message is asking about category (even without explicit "bought" word)
 */
function isAskingAboutCategory(message: string): boolean {
  const lowerMessage = normalizeText(message);
  const categoryQuestionKeywords = [
    'איזה', 'מה', 'אילו',
    'איזה מוצרים', 'איזה פריטים', 'איזה מוצר', 'איזה פריט',
    'מה מוצרים', 'מה פריטים', 'מה מוצר', 'מה פריט',
    'אילו מוצרים', 'אילו פריטים',
    'ב', 'בקטגוריה', 'בקטגוריית', 'מקטגוריה',
    'מה יש ב', 'מה יש בקטגוריה', 'מה יש בקטגוריית',
  ];

  return containsKeywords(lowerMessage, categoryQuestionKeywords);
}

/**
 * Check if message mentions dates like "yesterday", "today", "last list", etc.
 */
export function mentionsDateOrTime(message: string): { hasDate: boolean; isYesterday: boolean; isToday: boolean; isLastList: boolean } {
  const lowerMessage = normalizeText(message);
  
  const yesterdayKeywords = ['אתמול', 'אתמולי', 'אתמוליים'];
  const todayKeywords = ['היום', 'היומי'];
  const lastListKeywords = ['אחרון', 'אחרונה', 'אחרונים', 'אחרונות', 'רשימה אחרונה', 'רשימה האחרונה'];
  
  const isYesterday = containsKeywords(lowerMessage, yesterdayKeywords);
  const isToday = containsKeywords(lowerMessage, todayKeywords);
  const isLastList = containsKeywords(lowerMessage, lastListKeywords);
  
  return {
    hasDate: isYesterday || isToday || isLastList,
    isYesterday,
    isToday,
    isLastList,
  };
}

/**
 * Parse user message to understand intent with improved natural language understanding
 * Returns intent and optional category
 */
export function parseUserIntent(message: string): { intent: 'missing' | 'suggest' | 'category' | 'general'; category?: string | null } {
  const lowerMessage = message.toLowerCase().trim();
  
  // Check if asking about category/history
  const category = extractCategoryFromMessage(message);
  if (category && (isAskingAboutHistory(message) || isAskingAboutCategory(message))) {
    return { intent: 'category', category };
  }
  
  // Expanded missing/forgot keywords - many variations
  const missingKeywords = [
    // Direct "forgot" variations
    'שכחתי', 'שכחת', 'שכח', 'שכחנו', 'שכחתם', 'שכחתן',
    // "What I forgot" variations
    'מה שכחתי', 'מה שכחת', 'מה שכח', 'מה שכחנו',
    // "What's missing" variations
    'מה חסר', 'מה חסר לי', 'מה חסר לנו', 'חסר', 'חסר לי', 'חסר לנו',
    // "What I forgot to buy" variations
    'מה שכחתי לקנות', 'מה שכחת לקנות', 'מה שכח לקנות',
    'שכחתי לקנות', 'שכחת לקנות', 'שכח לקנות',
    // "What's missing from the list" variations
    'מה חסר ברשימה', 'מה חסר מהרשימה', 'מה לא ברשימה',
    'מה לא הוספתי', 'מה לא הוספת', 'מה לא הוספנו',
    // "Check what's missing" variations
    'תבדוק מה שכחתי', 'תבדוק מה חסר', 'תבדוק מה שכחתי לקנות',
    'בדוק מה שכחתי', 'בדוק מה חסר', 'בדוק מה שכחתי לקנות',
    // "What did I forget" variations
    'מה שכחתי לקנות', 'מה שכחת לקנות', 'מה שכח לקנות',
    // Other related phrases
    'מה לא קניתי', 'מה לא קנינו', 'מה לא קנית',
    'מה לא הוספתי לרשימה', 'מה לא הוספת לרשימה',
    'מה שכחתי להוסיף', 'מה שכחת להוסיף',
  ];
  
  if (containsKeywords(lowerMessage, missingKeywords)) {
    return { intent: 'missing', category: category || null };
  }

  // Expanded suggestion keywords - many variations
  const suggestKeywords = [
    // Direct "suggest" variations
    'הצע', 'הצעות', 'הציע', 'הציעי', 'הציעו',
    // "What to suggest" variations
    'מה להציע', 'מה להציע לי', 'מה להציע לנו',
    'מה להוסיף', 'מה להוסיף לרשימה', 'מה להוסיף לי',
    // "What to buy" variations
    'מה לקנות', 'מה כדאי לקנות', 'מה כדאי להוסיף',
    'מה כדאי', 'מה מומלץ', 'מה מומלץ לקנות',
    // "Suggest items" variations
    'הצע פריטים', 'הצע לי פריטים', 'הציע לי פריטים',
    'תציע פריטים', 'תציע לי פריטים', 'תציעי לי פריטים',
    // "What should I add" variations
    'מה כדאי להוסיף', 'מה כדאי להוסיף לרשימה',
    'מה מומלץ להוסיף', 'מה מומלץ להוסיף לרשימה',
    // "Give me suggestions" variations
    'תן לי הצעות', 'תני לי הצעות', 'תנו לי הצעות',
    'תן הצעות', 'תני הצעות', 'תנו הצעות',
    // Other related phrases
    'מה יש לך להציע', 'מה יש לך להציע לי',
    'איזה פריטים', 'איזה פריטים להציע',
    'מה יש להוסיף', 'מה יש להוסיף לרשימה',
  ];
  
  if (containsKeywords(lowerMessage, suggestKeywords)) {
    return { intent: 'suggest', category: category || null };
  }

  // If category is mentioned but not a clear intent, still return category intent
  if (category) {
    return { intent: 'category', category };
  }

  return { intent: 'general', category: null };
}
