import { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import { ndk } from './ndk';
import { lookupVertexProfile, VERTEX_REGEXP } from './vertex';

export async function searchEvents(query: string, limit: number = 21): Promise<NDKEvent[]> {
  // Check for vertex profile lookups
  if (VERTEX_REGEXP.test(query)) {
    const profile = await lookupVertexProfile(query);
    if (profile) {
      return [profile];
    }
    return [];
  }

  // Check for author filter
  const authorMatch = query.match(/(by:)(\S+)\s*(.*)/);
  if (authorMatch) {
    const [, , author, terms] = authorMatch;
    console.log('Found author filter:', { author, terms });

    // Check if author is a direct npub
    if (author.startsWith('npub')) {
      // For npub searches, we need to use the correct filter format
      const filters: NDKFilter = {
        kinds: [1],
        authors: [author],
        limit
      };

      // If we have additional search terms, add them to the search
      if (terms) {
        filters.search = terms;
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
      authors: [profile.author.npub],
      limit
    };

    // If we have additional search terms, add them to the search
    if (terms) {
      filters.search = terms;
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