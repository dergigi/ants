let cachedKindToSearchMap: Record<number, string> | null = null;

/**
 * Load the kind to search query mappings from replacements.txt
 * @returns Promise resolving to the mapping object
 */
async function loadKindToSearchMap(): Promise<Record<number, string>> {
  if (cachedKindToSearchMap) return cachedKindToSearchMap;
  
  try {
    const res = await fetch('/replacements.txt', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load replacements.txt');
    const txt = await res.text();
    
    const map: Record<number, string> = {};
    const lines = txt.split(/\r?\n/);
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      const arrowIdx = trimmed.indexOf('=>');
      if (arrowIdx === -1) continue;
      
      const left = trimmed.slice(0, arrowIdx).trim();
      const right = trimmed.slice(arrowIdx + 2).trim();
      
      // Look for is:key => kind:number patterns
      if (left.startsWith('is:') && right.startsWith('kind:')) {
        const isKey = left.slice(3); // Remove 'is:' prefix
        const kindStr = right.slice(5); // Remove 'kind:' prefix
        const kindNum = parseInt(kindStr, 10);
        
        if (!isNaN(kindNum)) {
          map[kindNum] = `is:${isKey}`;
        }
      }
    }
    
    cachedKindToSearchMap = map;
    return map;
  } catch {
    // Fallback to empty map if loading fails
    cachedKindToSearchMap = {};
    return cachedKindToSearchMap;
  }
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
