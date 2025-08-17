import { NDKEvent, NDKFilter, NDKRelaySet, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import { ndk } from './ndk';
import { lookupVertexProfile, searchProfilesFullText, resolveNip05ToPubkey, profileEventFromPubkey } from './vertex';
import { nip19 } from 'nostr-tools';



// Use a search-capable relay set explicitly for NIP-50 queries
const searchRelaySet = NDKRelaySet.fromRelayUrls(['wss://relay.nostr.band'], ndk);

async function subscribeAndCollect(filter: NDKFilter, timeoutMs: number = 8000): Promise<NDKEvent[]> {
  return new Promise<NDKEvent[]>((resolve) => {
    const collected: Map<string, NDKEvent> = new Map();

    const sub = ndk.subscribe([filter], { closeOnEose: true, cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY }, searchRelaySet);
    const timer = setTimeout(() => {
      try { sub.stop(); } catch {}
      resolve(Array.from(collected.values()));
    }, timeoutMs);

    sub.on('event', (event: NDKEvent) => {
      if (!collected.has(event.id)) {
        collected.set(event.id, event);
      }
    });

    sub.on('eose', () => {
      clearTimeout(timer);
      resolve(Array.from(collected.values()));
    });

    sub.start();
  });
}

function isNpub(str: string): boolean {
  return str.startsWith('npub1') && str.length > 10;
}

function getPubkey(str: string): string | null {
  if (isNpub(str)) {
    try {
      const { data } = nip19.decode(str);
      return data as string;
    } catch (error) {
      console.error('Error decoding npub:', error);
      return null;
    }
  }
  return str;
}

function eventHasImage(event?: NDKEvent): boolean {
  if (!event || !event.content) return false;
  const text = event.content;
  const imageRegex = /(https?:\/\/[^\s'"<>]+?\.(?:png|jpe?g|gif|webp|avif|svg))(?!\w)/i;
  return imageRegex.test(text);
}

export function parseOrQuery(query: string): string[] {
  // Split by " OR " (case-insensitive) while preserving quoted segments
  const parts: string[] = [];
  let currentPart = '';
  let inQuotes = false;

  const stripOuterQuotes = (value: string): string => {
    const trimmed = value.trim();
    return trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2
      ? trimmed.slice(1, -1)
      : trimmed;
  };

  for (let i = 0; i < query.length; i++) {
    const char = query[i];

    if (char === '"') {
      inQuotes = !inQuotes;
      currentPart += char;
      continue;
    }

    // Detect the literal sequence " OR " when not inside quotes
    if (!inQuotes && query.substr(i, 4).toUpperCase() === ' OR ') {
      const cleaned = stripOuterQuotes(currentPart);
      if (cleaned) parts.push(cleaned);
      currentPart = '';
      i += 3; // skip the remaining characters of " OR " (loop will +1)
      continue;
    }

    currentPart += char;
  }

  const cleaned = stripOuterQuotes(currentPart);
  if (cleaned) parts.push(cleaned);
  return parts;
}

export async function searchEvents(
  query: string,
  limit: number = 21,
  options?: { exact?: boolean }
): Promise<NDKEvent[]> {
  // Ensure we're connected before issuing any queries
  try {
    await ndk.connect();
  } catch (e) {
    console.warn('NDK connect failed or already connected:', e);
  }

  // Detect and strip has:image flag; apply post-filter later
  const hasImageFlag = /(?:^|\s)has:image(?:\s|$)/i.test(query);
  const cleanedQuery = query.replace(/(?:^|\s)has:image(?:\s|$)/gi, ' ').trim();

  // Check for OR operator
  const orParts = parseOrQuery(cleanedQuery);
  if (orParts.length > 1) {
    console.log('Processing OR query with parts:', orParts);
    const allResults: NDKEvent[] = [];
    const seenIds = new Set<string>();
    
    // Process each part of the OR query
    for (const part of orParts) {
      try {
        const partResults = await searchEvents(part, limit, options);
        for (const event of partResults) {
          if (!seenIds.has(event.id)) {
            seenIds.add(event.id);
            allResults.push(event);
          }
        }
      } catch (error) {
        console.error(`Error processing OR query part "${part}":`, error);
      }
    }
    
    // Sort by creation time (newest first) and limit results
    return (hasImageFlag ? allResults.filter(eventHasImage) : allResults)
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
      .slice(0, limit);
  }

  // URL search: always do exact (literal) match for http(s) URLs
  try {
    const url = new URL(cleanedQuery);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      const results = await subscribeAndCollect({
        kinds: [1],
        search: `"${cleanedQuery}"`,
        limit
      });
      return hasImageFlag ? results.filter(eventHasImage).slice(0, limit) : results;
    }
  } catch {}

  // Full-text profile search `p:<term>` (not only username)
  const fullProfileMatch = cleanedQuery.match(/^p:(.+)$/i);
  if (fullProfileMatch) {
    const term = (fullProfileMatch[1] || '').trim();
    if (!term) return [];
    try {
      const profiles = await searchProfilesFullText(term, 21);
      return profiles;
    } catch (e) {
      console.warn('Full-text profile search failed:', e);
      return [];
    }
  }

  // Check if the query is a direct npub
  if (isNpub(cleanedQuery)) {
    try {
      const pubkey = getPubkey(cleanedQuery);
      if (!pubkey) return [];

      return await subscribeAndCollect({
        kinds: [1],
        authors: [pubkey],
        limit
      });
    } catch (error) {
      console.error('Error processing npub query:', error);
      return [];
    }
  }

  // NIP-05 resolution: '@name@domain' or 'domain.tld' or '@domain.tld'
  const nip05Like = cleanedQuery.match(/^@?([^\s@]+@[^\s@]+|[^\s@]+\.[^\s@]+)$/);
  if (nip05Like) {
    try {
      const pubkey = await resolveNip05ToPubkey(cleanedQuery);
      if (pubkey) {
        const profileEvt = await profileEventFromPubkey(pubkey);
        return [profileEvt];
      }
    } catch {}
  }

  // Check for author filter
  const authorMatch = cleanedQuery.match(/(?:^|\s)by:(\S+)(?:\s|$)/);
  if (authorMatch) {
    const [, author] = authorMatch;
    // Extract search terms by removing the author filter
    const terms = cleanedQuery.replace(/(?:^|\s)by:(\S+)(?:\s|$)/, '').trim();
    console.log('Found author filter:', { author, terms });

    let pubkey: string | null = null;

    // Check if author is a direct npub
    if (isNpub(author)) {
      try {
        pubkey = getPubkey(author);
      } catch (error) {
        console.error('Error decoding author npub:', error);
        pubkey = null;
      }
    } else {
      // Look up author's profile via Vertex DVM (personalized when logged in, global otherwise)
      try {
        const profile = await lookupVertexProfile(`p:${author}`);
        if (profile) {
          pubkey = profile.author.pubkey;
        }
      } catch (error) {
        console.error('Error looking up author profile:', error);
      }
    }

    if (!pubkey) {
      console.log('No valid pubkey found for author:', author);
      return [];
    }

    const filters: NDKFilter = {
      kinds: [1],
      authors: [pubkey],
      limit
    };

    // Add search term to the filter if present
    if (terms) {
      filters.search = terms;
      // Increase limit for filtered text searches to improve recall
      // Many relays require higher limits to surface matching events
      filters.limit = Math.max(limit, 200);
    }

    console.log('Searching with filters:', filters);
    {
      const res = await subscribeAndCollect(filters);
      const filtered = hasImageFlag ? res.filter(eventHasImage) : res;
      return filtered.slice(0, limit);
    }
  }
  
  // Regular search without author filter
  try {
    const baseSearch = cleanedQuery || (hasImageFlag ? 'jpg png jpeg gif webp svg' : undefined);
    const results = await subscribeAndCollect({
      kinds: [1],
      search: options?.exact ? `"${cleanedQuery}"` : baseSearch,
      limit
    });
    console.log('Search results:', {
      query: cleanedQuery,
      resultCount: results.length
    });
    
    const filtered = hasImageFlag ? results.filter(eventHasImage) : results;
    return filtered.slice(0, limit);
  } catch (error) {
    console.error('Error fetching events:', error);
    return [];
  }
} 