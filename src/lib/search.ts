import { NDKEvent } from '@nostr-dev-kit/ndk';
import { ndk } from './ndk';
import { lookupVertexProfile, VERTEX_REGEXP } from './vertex';

export async function searchEvents(query: string, limit: number = 21): Promise<NDKEvent[]> {
  // If this is a vertex profile lookup, handle it directly
  if (VERTEX_REGEXP.test(query)) {
    const profile = await lookupVertexProfile(query);
    return profile ? [profile] : [];
  }
  
  // Check for author search
  const authorMatch = query.match(/(from:|by:)(\S+)\s*(.*)/);
  if (authorMatch) {
    const [_, prefix, author, terms] = authorMatch;
    
    // Use vertex lookup to find the author's profile
    const profile = await lookupVertexProfile(`p:${author}`);
    if (!profile) {
      console.log('No profile found for author:', author);
      return [];
    }

    // Search for events by this author
    const searchQuery = terms.trim() ? `pubkey:${profile.pubkey} ${terms}`.trim() : `pubkey:${profile.pubkey}`;
    console.log('Searching with query:', searchQuery);
    
    const events = await ndk.fetchEvents({
      kinds: [1],
      search: searchQuery,
      limit
    });

    const results = Array.from(events);
    console.log('Search results:', {
      query,
      authorNpub: profile.author.npub,
      searchQuery,
      terms,
      resultCount: results.length
    });

    return results;
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