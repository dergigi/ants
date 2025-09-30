/**
 * Maps Nostr event kinds to their corresponding is: search queries
 * Based on the replacements.txt mapping
 */
export const KIND_TO_SEARCH_MAP: Record<number, string> = {
  1: 'is:tweet',
  6: 'is:repost', 
  7: 'is:reaction',
  20: 'is:image',
  21: 'is:video',
  22: 'is:video',
  1063: 'is:file',
  1617: 'is:patch',
  1621: 'is:issue',
  1984: 'is:report',
  9735: 'is:zap',
  9321: 'is:nutzap',
  9802: 'is:highlight',
  30023: 'is:blogpost',
  10000: 'is:muted',
  10001: 'is:pin',
  10003: 'is:bookmark',
};

/**
 * Get the search query for a given event kind
 * @param kind - The Nostr event kind number
 * @returns The is: search query or null if not found
 */
export function getKindSearchQuery(kind: number): string | null {
  return KIND_TO_SEARCH_MAP[kind] || null;
}

/**
 * Check if a given event kind has a corresponding search query
 * @param kind - The Nostr event kind number
 * @returns True if the kind has a search query, false otherwise
 */
export function hasKindSearchQuery(kind: number): boolean {
  return kind in KIND_TO_SEARCH_MAP;
}
