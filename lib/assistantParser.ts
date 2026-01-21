export interface ParsedIntent {
  intent: 'add_item' | 'add_items_multiple' | 'remove_item' | 'set_quantity' | 'mark_done' | 'show_help' | 'unknown';
  itemName?: string;
  quantity?: number;
  confidence: number; // 0..1
  needsDisambiguation: boolean;
  suggestions?: string[]; // Suggested item names
  category?: string; // If category was mentioned
}

/**
 * Normalize Hebrew text for matching
 * - Remove diacritics (nikud)
 * - Trim and lowercase
 * - Remove common action words
 */
export function normalizeHebrew(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\u0591-\u05C7]/g, '') // Remove Hebrew diacritics
    .replace(/[^\u0590-\u05FF0-9\s]/g, '') // Keep only Hebrew letters, numbers, spaces
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/^(הוסף|תוסיף|שים|הוסיף|תוסיפי|שימי|הוסיפי|תוסיפו|הוסיפו|שימו|add|put|insert)\s+/i, '') // Remove action words
    .trim();
}

/**
 * Extract quantity from text
 * Supports: numbers, Hebrew number words, "x2", "2x"
 */
export function extractQuantity(text: string): number | null {
  // Direct numbers
  const numberMatch = text.match(/(\d+)/);
  if (numberMatch) {
    return parseInt(numberMatch[1], 10);
  }

  // Hebrew number words
  const hebrewNumbers: Record<string, number> = {
    'אחד': 1, 'אחת': 1, 'אחדים': 1,
    'שתיים': 2, 'שניים': 2, 'שתי': 2, 'שני': 2,
    'שלוש': 3, 'שלושה': 3, 'שלושי': 3,
    'ארבע': 4, 'ארבעה': 4, 'ארבעי': 4,
    'חמש': 5, 'חמישה': 5, 'חמישי': 5,
    'שש': 6, 'שישה': 6, 'שישי': 6,
    'שבע': 7, 'שבעה': 7, 'שביעי': 7,
    'שמונה': 8, 'שמיני': 8,
    'תשע': 9, 'תשעה': 9, 'תשיעי': 9,
    'עשר': 10, 'עשרה': 10, 'עשירי': 10,
  };

  const normalized = normalizeHebrew(text);
  for (const [word, num] of Object.entries(hebrewNumbers)) {
    if (normalized.includes(word)) {
      return num;
    }
  }

  // "x2" or "2x" pattern
  const xPattern = text.match(/(\d+)\s*x|x\s*(\d+)/i);
  if (xPattern) {
    return parseInt(xPattern[1] || xPattern[2], 10);
  }

  return null;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  const len1 = str1.length;
  const len2 = str2.length;

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + 1
        );
      }
    }
  }

  return matrix[len1][len2];
}

/**
 * Fuzzy match item name against list of known names
 * Returns best match with confidence score (0..1)
 */
export function fuzzyMatchItemName(
  input: string,
  allItemNames: string[]
): { match: string | null; confidence: number } {
  if (allItemNames.length === 0) {
    return { match: null, confidence: 0 };
  }

  const normalizedInput = normalizeHebrew(input);
  let bestMatch: string | null = null;
  let bestConfidence = 0;

  for (const itemName of allItemNames) {
    const normalizedItem = normalizeHebrew(itemName);
    
    // Exact match
    if (normalizedInput === normalizedItem) {
      return { match: itemName, confidence: 1.0 };
    }

    // Contains match
    if (normalizedItem.includes(normalizedInput) || normalizedInput.includes(normalizedItem)) {
      const confidence = Math.min(normalizedInput.length, normalizedItem.length) / Math.max(normalizedInput.length, normalizedItem.length);
      if (confidence > bestConfidence) {
        bestMatch = itemName;
        bestConfidence = confidence;
      }
    }

    // Fuzzy match using Levenshtein distance
    const distance = levenshteinDistance(normalizedInput, normalizedItem);
    const maxLen = Math.max(normalizedInput.length, normalizedItem.length);
    const similarity = 1 - (distance / maxLen);
    
    if (similarity > bestConfidence && similarity > 0.6) {
      bestMatch = itemName;
      bestConfidence = similarity;
    }
  }

  return { match: bestMatch, confidence: bestConfidence };
}

/**
 * English to Hebrew item name mapping (basic)
 */
const englishToHebrew: Record<string, string> = {
  'milk': 'חלב',
  'bread': 'לחם',
  'eggs': 'ביצים',
  'cucumber': 'מלפפון',
  'tomato': 'עגבניה',
  'cheese': 'גבינה',
  'yogurt': 'יוגורט',
  'chicken': 'עוף',
  'meat': 'בשר',
  'fish': 'דג',
};

/**
 * Parse assistant message to extract intent and parameters
 */
export function parseAssistantMessage(
  text: string,
  allItemNames: string[],
  allCategories: string[] = []
): ParsedIntent {
  const normalized = normalizeHebrew(text);
  
  // Check for help intent
  if (normalized.includes('עזרה') || normalized.includes('help') || normalized.includes('מה אפשר') || normalized.includes('איך')) {
    return {
      intent: 'show_help',
      confidence: 1.0,
      needsDisambiguation: false,
    };
  }

  // Check for remove/delete intent
  if (normalized.includes('מחק') || normalized.includes('הסר') || normalized.includes('הסרה') || normalized.includes('remove') || normalized.includes('delete')) {
    // Try to extract item name
    const itemMatch = fuzzyMatchItemName(normalized.replace(/מחק|הסר|הסרה|remove|delete/gi, '').trim(), allItemNames);
    if (itemMatch.match && itemMatch.confidence > 0.7) {
      return {
        intent: 'remove_item',
        itemName: itemMatch.match,
        confidence: itemMatch.confidence,
        needsDisambiguation: false,
      };
    }
    return {
      intent: 'remove_item',
      confidence: 0.5,
      needsDisambiguation: true,
    };
  }

  // Check for mark done intent
  if (normalized.includes('סיים') || normalized.includes('סיימתי') || normalized.includes('קניתי') || normalized.includes('done') || normalized.includes('completed')) {
    const itemMatch = fuzzyMatchItemName(normalized.replace(/סיים|סיימתי|קניתי|done|completed/gi, '').trim(), allItemNames);
    if (itemMatch.match && itemMatch.confidence > 0.7) {
      return {
        intent: 'mark_done',
        itemName: itemMatch.match,
        confidence: itemMatch.confidence,
        needsDisambiguation: false,
      };
    }
    return {
      intent: 'mark_done',
      confidence: 0.5,
      needsDisambiguation: true,
    };
  }

  // Check for set quantity intent
  if (normalized.includes('כמות') || normalized.includes('quantity') || normalized.match(/\d+\s*(מלפפון|חלב|ביצים|לחם)/)) {
    const quantity = extractQuantity(text);
    const itemMatch = fuzzyMatchItemName(normalized.replace(/כמות|quantity|\d+/gi, '').trim(), allItemNames);
    if (itemMatch.match && itemMatch.confidence > 0.7 && quantity) {
      return {
        intent: 'set_quantity',
        itemName: itemMatch.match,
        quantity,
        confidence: itemMatch.confidence,
        needsDisambiguation: false,
      };
    }
  }

  // Extract quantity
  const quantity = extractQuantity(text);
  const hasQuantity = quantity !== null && quantity > 1;

  // Try English mapping first
  let searchText = normalized;
  for (const [en, he] of Object.entries(englishToHebrew)) {
    if (normalized.includes(en)) {
      searchText = normalized.replace(en, he);
      break;
    }
  }

  // Remove quantity words/numbers from search text
  const textWithoutQuantity = searchText
    .replace(/\d+/g, '')
    .replace(/x\s*\d+|\d+\s*x/gi, '')
    .replace(/אחד|אחת|שתיים|שניים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע|עשר/gi, '')
    .trim();

  // Fuzzy match item name
  const itemMatch = fuzzyMatchItemName(textWithoutQuantity, allItemNames);

  // Extract category if mentioned
  let category: string | undefined;
  for (const cat of allCategories) {
    if (normalized.includes(normalizeHebrew(cat))) {
      category = cat;
      break;
    }
  }

  // Determine confidence and disambiguation needs
  let needsDisambiguation = false;
  let confidence = itemMatch.confidence;

  if (itemMatch.confidence < 0.5) {
    needsDisambiguation = true;
    confidence = 0.3;
  } else if (itemMatch.confidence >= 0.5 && itemMatch.confidence < 0.75) {
    // Medium confidence - suggest confirmation
    needsDisambiguation = false; // Will show confirmation in UI
    confidence = itemMatch.confidence;
  }

  // Get suggestions for disambiguation (items from same category or similar names)
  let suggestions: string[] = [];
  if (needsDisambiguation && category) {
    // Filter items by category (would need access to items with categories)
    // For now, return top fuzzy matches
    const matches = allItemNames
      .map(name => ({
        name,
        confidence: fuzzyMatchItemName(textWithoutQuantity, [name]).confidence,
      }))
      .filter(m => m.confidence > 0.3)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5)
      .map(m => m.name);
    suggestions = matches;
  }

  return {
    intent: hasQuantity ? 'add_items_multiple' : 'add_item',
    itemName: itemMatch.match || undefined,
    quantity: quantity || 1,
    confidence,
    needsDisambiguation,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
    category,
  };
}
