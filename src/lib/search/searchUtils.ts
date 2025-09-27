import { NDKEvent } from '@nostr-dev-kit/ndk';

// NIP-50 extension options
export interface Nip50Extensions {
  includeSpam?: boolean;
  domain?: string;
  language?: string;
  sentiment?: 'negative' | 'neutral' | 'positive';
  nsfw?: boolean;
}

// Ensure newest-first ordering by created_at
export function sortEventsNewestFirst(events: NDKEvent[]): NDKEvent[] {
  return [...events].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
}

// Build search query with NIP-50 extensions
export function buildSearchQueryWithExtensions(baseQuery: string, extensions: Nip50Extensions): string {
  if (!baseQuery.trim()) return baseQuery;
  
  let query = baseQuery;
  
  // Add domain filter
  if (extensions.domain) {
    query += ` domain:${extensions.domain}`;
  }
  
  // Add language filter
  if (extensions.language) {
    query += ` language:${extensions.language}`;
  }
  
  // Add sentiment filter
  if (extensions.sentiment) {
    query += ` sentiment:${extensions.sentiment}`;
  }
  
  // Add NSFW filter
  if (extensions.nsfw !== undefined) {
    query += ` nsfw:${extensions.nsfw}`;
  }
  
  // Add spam filter
  if (extensions.includeSpam) {
    query += ' include:spam';
  }
  
  return query.trim();
}

// Re-export the subscription functions from the main search module
export { subscribeAndStream, subscribeAndCollect } from '../search';
