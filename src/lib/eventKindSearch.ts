import { loadRules } from './search/replacements';

let cachedKindToSearchMap: Record<number, string> | null = null;

/**
 * Load the kind to search query mappings from replacements.txt
 * @returns Promise resolving to the mapping object
 */
async function loadKindToSearchMap(): Promise<Record<number, string>> {
  if (cachedKindToSearchMap) return cachedKindToSearchMap;
  
  const rules = await loadRules();
  const map: Record<number, string> = {};
  
  for (const rule of rules) {
    if (rule.kind === 'is' && rule.expansion.startsWith('kind:')) {
      const kindNum = parseInt(rule.expansion.slice(5), 10);
      if (!isNaN(kindNum)) {
        map[kindNum] = `is:${rule.key}`;
      }
    }
  }
  
  cachedKindToSearchMap = map;
  return map;
}

/**
 * Get the search query for a given event kind
 * @param kind - The Nostr event kind number
 * @returns Promise resolving to the is: search query or null if not found
 */
export async function getKindSearchQuery(kind: number): Promise<string | null> {
  const map = await loadKindToSearchMap();
  return map[kind] || null;
}

/**
 * Check if a given event kind has a corresponding search query
 * @param kind - The Nostr event kind number
 * @returns Promise resolving to true if the kind has a search query, false otherwise
 */
export async function hasKindSearchQuery(kind: number): Promise<boolean> {
  const map = await loadKindToSearchMap();
  return kind in map;
}
