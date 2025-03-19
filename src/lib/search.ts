import { NDKEvent } from '@nostr-dev-kit/ndk';
import { ndk } from './ndk';
import { lookupVertexProfile } from './vertex';

interface SearchFilter {
  author?: string;
  terms: string;
}

function parseSearchQuery(query: string): SearchFilter {
  const filter: SearchFilter = {
    terms: query
  };

  // Check for from: filter
  const fromMatch = query.match(/from:(\S+)\s*(.*)/);
  if (fromMatch) {
    filter.author = fromMatch[1];
    filter.terms = fromMatch[2].trim();
  }

  return filter;
}

export async function searchEvents(query: string, limit: number = 21): Promise<NDKEvent[]> {
  const filter = parseSearchQuery(query);
  
  // If we have an author filter, look up their npub first
  let authorPubkey: string | undefined;
  if (filter.author) {
    try {
      const profile = await lookupVertexProfile(`p:${filter.author}`);
      if (profile) {
        // Use the hex pubkey directly
        authorPubkey = profile.pubkey;
        console.log('Found author pubkey:', authorPubkey);
      } else {
        console.log('No profile found for author:', filter.author);
        return [];
      }
    } catch (error) {
      console.error('Error looking up profile:', error);
      return [];
    }
  }
  
  // Perform the search with author filter if present
  try {
    // Construct the search query in nostr.band format
    let searchQuery = filter.terms;
    if (authorPubkey) {
      searchQuery = `pubkey:${authorPubkey} ${filter.terms}`.trim();
    }
    
    const events = await ndk.fetchEvents({
      kinds: [1],
      search: searchQuery,
      limit
    });
    
    const results = Array.from(events);
    console.log('Search results:', {
      query,
      authorPubkey,
      searchQuery,
      terms: filter.terms,
      resultCount: results.length
    });
    
    return results;
  } catch (error) {
    console.error('Error fetching events:', error);
    return [];
  }
} 