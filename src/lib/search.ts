import { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import { ndk } from './ndk';
import { lookupVertexProfile, VERTEX_REGEXP } from './vertex';
import { nip19 } from 'nostr-tools';

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
  // Check for vertex profile lookups
  if (VERTEX_REGEXP.test(query)) {
    const profile = await lookupVertexProfile(query);
    if (profile) {
      return [profile];
    }
    return [];
  }

  // Check if the query is a direct npub
  if (isNpub(query)) {
    const pubkey = getPubkey(query);
    if (!pubkey) return [];
    
    const events = await ndk.fetchEvents({
      kinds: [1],
      authors: [pubkey],
      limit
    });
    return Array.from(events);
  }

  // Check for author filter
  const authorMatch = query.match(/(by:)(\S+)\s*(.*)/);
  if (authorMatch) {
    const [, , author, terms] = authorMatch;
    console.log('Found author filter:', { author, terms });

    // Check if author is a direct npub
    if (isNpub(author)) {
      const pubkey = getPubkey(author);
      if (!pubkey) return [];

      const filters: NDKFilter = {
        kinds: [1],
        authors: [pubkey],
        limit
      };

      // If we have additional search terms, add them to the search
      if (terms && terms.trim()) {
        filters.search = terms.trim();
      }

      console.log('Searching with filters:', filters);
      const events = await ndk.fetchEvents(filters);
      return Array.from(events);
    }

    // Look up author's profile
    const profile = await lookupVertexProfile(`p:${author}`);
    if (!profile) {
      console.log('No profile found for author:', author);
      return [];
    }

    // Search for events by the author
    const filters: NDKFilter = {
      kinds: [1],
      authors: [profile.author.pubkey],
      limit
    };

    // If we have additional search terms, add them to the search
    if (terms && terms.trim()) {
      filters.search = terms.trim();
    }

    console.log('Searching with filters:', filters);
    const events = await ndk.fetchEvents(filters);
    return Array.from(events);
  }
  
  // Regular search without author filter
  try {
    const events = await ndk.fetchEvents({
      kinds: [1],
      search: query,
      limit
    });
    
    const results = Array.from(events);
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