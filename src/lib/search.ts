import { NDKEvent } from '@nostr-dev-kit/ndk';
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
      const searchQuery = terms ? `npub:${author} ${terms}` : `npub:${author}`;
      console.log('Searching with query:', searchQuery);
      const events = await ndk.fetchEvents({
        kinds: [1],
        search: searchQuery,
        limit
      });
      return Array.from(events);
    }

    // Look up author's profile
    const profile = await lookupVertexProfile(`p:${author}`);
    if (!profile) {
      console.log('No profile found for author:', author);
      return [];
    }

    // Search for events by the author
    const searchQuery = terms ? `npub:${profile.author.npub} ${terms}` : `npub:${profile.author.npub}`;
    console.log('Searching with query:', searchQuery);
    const events = await ndk.fetchEvents({
      kinds: [1],
      search: searchQuery,
      limit
    });
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