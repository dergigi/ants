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
    const profile = await lookupVertexProfile(`p:${filter.author}`);
    if (!profile) {
      return [];
    }
    authorPubkey = profile.pubkey;
  }
  
  // Perform the search with author filter if present
  const events = await ndk.fetchEvents({
    kinds: [1],
    authors: authorPubkey ? [authorPubkey] : undefined,
    search: filter.terms,
    limit
  });
  
  return Array.from(events);
} 