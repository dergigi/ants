import emojiRegex from 'emoji-regex';
import { URL_REGEX, IMAGE_EXT_REGEX } from '@/lib/urlPatterns';

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
  // Detect any http(s) URL that is NOT an image link
  let m: RegExpExecArray | null;
  while ((m = URL_REGEX.exec(text)) !== null) {
    const raw = (m[1] || '').replace(/[),.;]+$/, '').trim();
    if (!IMAGE_EXT_REGEX.test(raw)) {
      return true; // counts as an external link
    }
  }
  return false;
}

// --- NSFW detection helpers ---
const NSFW_TAGS = new Set(['nsfw', 'nude']);

export function isNsfwText(text: string): boolean {
  if (!text) return false;
  // check hashtags and plain words (case-insensitive)
  const lower = text.toLowerCase();
  if (/(^|\s)#(nsfw|nude)(?=\b)/i.test(text)) return true;
  for (const tag of NSFW_TAGS) {
    if (lower.includes(tag)) return true;
  }
  return false;
}

/**
 * Apply client-side filters to a list of events based on emoji and hashtag counts
 */
export function applyContentFilters<T extends { id?: string; content?: string; author?: { profile?: { nip05?: string; bot?: boolean; is_bot?: boolean; about?: string }, pubkey?: string }; pubkey?: string }>(
  events: T[],
  maxEmojis: number | null,
  maxHashtags: number | null,
  hideLinks: boolean = false,
  verifiedOnly: boolean = false,
  verifyCheck?: (pubkeyHex?: string, nip05?: string) => boolean,
  hideBots: boolean = false,
  hideNsfw: boolean = false,
  nsfwCheck?: (evt: T) => boolean
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

    // Hide bots when requested (based on kind:0 metadata heuristics per NIP-24)
    if (hideBots) {
      const profile = event.author?.profile as { bot?: boolean; is_bot?: boolean; about?: string } | undefined;
      const declaredBot = profile?.bot === true || profile?.is_bot === true;
      const aboutHints = typeof profile?.about === 'string' && /\b(bot|automated|autopost)\b/i.test(profile.about);
      if (declaredBot || aboutHints) return false;
    }

    // Hide NSFW
    if (hideNsfw) {
      const flagged = nsfwCheck ? nsfwCheck(event) : isNsfwText(content);
      if (flagged) return false;
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
