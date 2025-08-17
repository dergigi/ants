import { NDKEvent, NDKFilter, NDKRelaySet, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import { ndk } from './ndk';
import { lookupVertexProfile, VERTEX_REGEXP, searchProfilesFullText } from './vertex';
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
  return str.startsWith('npub');
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

export async function searchEvents(query: string, limit: number = 21): Promise<NDKEvent[]> {
  // Ensure we're connected before issuing any queries
  try {
    await ndk.connect();
  } catch (e) {
    console.warn('NDK connect failed or already connected:', e);
  }
  // Check for vertex profile lookups
  if (VERTEX_REGEXP.test(query)) {
    const profile = await lookupVertexProfile(query);
    if (profile) {
      return [profile];
    }
    return [];
  }

  // Full-text profile search `p:<term>` (not only username)
  const fullProfileMatch = query.match(/^p:(.+)$/i);
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
  if (isNpub(query)) {
    const pubkey = getPubkey(query);
    if (!pubkey) return [];

    return await subscribeAndCollect({
      kinds: [1],
      authors: [pubkey],
      limit
    });
  }

  // Check for author filter
  const authorMatch = query.match(/(?:^|\s)by:(\S+)(?:\s|$)/);
  if (authorMatch) {
    const [, author] = authorMatch;
    // Extract search terms by removing the author filter
    const terms = query.replace(/(?:^|\s)by:(\S+)(?:\s|$)/, '').trim();
    console.log('Found author filter:', { author, terms });

    let pubkey: string | null = null;

    // Check if author is a direct npub
    if (isNpub(author)) {
      pubkey = getPubkey(author);
    } else {
      // Look up author's profile via Vertex DVM (personalized when logged in, global otherwise)
      const profile = await lookupVertexProfile(`p:${author}`);
      if (profile) {
        pubkey = profile.author.pubkey;
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
    return await subscribeAndCollect(filters);
  }
  
  // Regular search without author filter
  try {
    const results = await subscribeAndCollect({
      kinds: [1],
      search: query,
      limit
    });
    console.log('Search results:', {
      query,
      resultCount: results.length
    });
    
    return results;
  } catch (error) {
    console.error('Error fetching events:', error);
    return [];
  }
} 