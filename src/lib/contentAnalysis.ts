import emojiRegex from 'emoji-regex';
import { extractNonMediaUrls } from '@/lib/utils/urlUtils';
import { extractNip19Identifiers } from '@/lib/utils/nostrIdentifiers';
import { BRIDGED_KEYWORDS } from '@/lib/constants';

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
 * Check if a search query contains multiple emojis
 * This is used to disable the emoji filter when searching for emoji content
 */
export function isEmojiSearch(query: string): boolean {
  if (!query) return false;
  
  const emojiRx = emojiRegex();
  const matches = query.match(emojiRx);
  return matches ? matches.length >= 2 : false;
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
 * Count the number of mentions in a text string
 * Handles both traditional @username mentions and Nostr bech32-encoded entities
 * as per NIP-19: npub, nsec, note, nprofile, nevent, nrelay, naddr
 */
export function countMentions(text: string): number {
  if (!text) return 0;
  
  // Match traditional @username mentions
  const usernameMentionRegex = /@[A-Za-z0-9_]+/g;
  const usernameMatches = text.match(usernameMentionRegex) || [];
  
  // Match Nostr bech32-encoded entities (npub, nsec, note, nprofile, nevent, nrelay, naddr)
  // These are bech32-encoded strings that start with the appropriate prefix
  const nostrMatches = extractNip19Identifiers(text);
  
  return usernameMatches.length + nostrMatches.length;
}

/**
 * Detect if the text contains a URL/link
 */
export function containsLink(text: string): boolean {
  if (!text) return false;
  // Detect any http(s) URL that is NOT an image link
  const nonMediaUrls = extractNonMediaUrls(text);
  return nonMediaUrls.length > 0;
}

/**
 * Detect if the content is from a bridged account based on NIP-05
 */
export function isBridgedContent(nip05: string | undefined): boolean {
  if (!nip05) return false;
  
  const lowerNip05 = nip05.toLowerCase();
  return BRIDGED_KEYWORDS.some(keyword => lowerNip05.includes(keyword.toLowerCase()));
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
type Nip05Value = string | { url?: string; verified?: boolean } | undefined;

export function applyContentFilters<T extends { id?: string; content?: string; author?: { profile?: { nip05?: Nip05Value; bot?: boolean; is_bot?: boolean; about?: string }, pubkey?: string }; pubkey?: string }>(
  events: T[],
  maxEmojis: number | null,
  maxHashtags: number | null,
  maxMentions: number | null,
  hideLinks: boolean = false,
  hideBridged: boolean = false,
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

    // Check mentions limit
    if (maxMentions !== null) {
      const mentionsCount = countMentions(content);
      if (mentionsCount > maxMentions) {
        return false;
      }
    }

    // Hide links if enabled
    if (hideLinks && containsLink(content)) {
      return false;
    }

    // Hide bridged content if enabled
    if (hideBridged) {
      const nip05Raw = event.author?.profile?.nip05 as Nip05Value;
      const nip05 = typeof nip05Raw === 'string' ? nip05Raw : nip05Raw?.url;
      if (isBridgedContent(nip05)) {
        return false;
      }
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
    const nip05Raw = evt.author?.profile?.nip05 as Nip05Value;
    const nip05 = typeof nip05Raw === 'string' ? nip05Raw : nip05Raw?.url;
    const hintedVerified =
      typeof nip05Raw === 'object' && nip05Raw !== null && typeof nip05Raw.verified === 'boolean'
        ? nip05Raw.verified
        : undefined;
    if (!pubkey || !nip05) {
      return Boolean(hintedVerified === true);
    }
    if (hintedVerified === true) return true;
    if (verifyCheck) {
      return verifyCheck(pubkey, nip05) === true;
    }
    // Without a checker, default to exclude until verified
    return false;
  });
}
