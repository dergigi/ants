import emojiRegex from 'emoji-regex';

/**
 * Count the number of emojis in a text string
 */
export function countEmojis(text: string): number {
  if (!text) return 0;
  
  const emojiRx = emojiRegex();
  const matches = text.match(emojiRx);
  return matches ? matches.length : 0;
}

/**
 * Count the number of hashtags in a text string
 */
export function countHashtags(text: string): number {
  if (!text) return 0;
  
  // Match hashtags that start with # followed by alphanumeric characters and underscores
  const hashtagRegex = /#[A-Za-z0-9_]+/g;
  const matches = text.match(hashtagRegex);
  return matches ? matches.length : 0;
}

/**
 * Detect if the text contains a URL/link
 */
export function containsLink(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return lower.includes('http://') || lower.includes('https://');
}

/**
 * Apply client-side filters to a list of events based on emoji and hashtag counts
 */
export function applyContentFilters<T extends { content?: string; author?: { profile?: { nip05?: string }, pubkey?: string }; pubkey?: string }>(
  events: T[],
  maxEmojis: number | null,
  maxHashtags: number | null,
  hideLinks: boolean = false,
  verifiedOnly: boolean = false,
  verifyCheck?: (pubkeyHex?: string, nip05?: string) => boolean
): T[] {
  const base = events.filter(event => {
    const content = event.content || '';
    
    // Check emoji limit
    if (maxEmojis !== null) {
      const emojiCount = countEmojis(content);
      if (emojiCount > maxEmojis) {
        return false;
      }
    }
    
    // Check hashtag limit
    if (maxHashtags !== null) {
      const hashtagCount = countHashtags(content);
      if (hashtagCount > maxHashtags) {
        return false;
      }
    }

    // Hide links if enabled
    if (hideLinks && containsLink(content)) {
      return false;
    }
    
    return true;
  });

  if (!verifiedOnly) return base;

  // Only include events whose authors are actually verified according to verifyCheck map.
  return base.filter((evt) => {
    const pubkey = (evt.pubkey || evt.author?.pubkey) as string | undefined;
    const nip05 = evt.author?.profile?.nip05;
    if (!pubkey || !nip05) return false;
    if (verifyCheck) {
      return verifyCheck(pubkey, nip05) === true;
    }
    // Without a checker, default to exclude until verified
    return false;
  });
}
