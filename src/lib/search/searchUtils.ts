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
// When baseQuery is empty but extensions exist, produces extension-only strings
export function buildSearchQueryWithExtensions(baseQuery: string, extensions: Nip50Extensions): string {
  const hasExtensions = extensions.domain || extensions.language || extensions.sentiment
    || extensions.nsfw !== undefined || extensions.includeSpam;
  if (!baseQuery.trim() && !hasExtensions) return baseQuery;

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

/**
 * Deduplicate parameterized replaceable events (kinds 30000-39999).
 * These are keyed by kind:pubkey:d-tag — keeps only the newest version.
 * Non-replaceable events pass through unchanged.
 */
export function deduplicateReplaceableEvents(events: NDKEvent[]): NDKEvent[] {
  const replaceableNewest = new Map<string, NDKEvent>();
  const result: NDKEvent[] = [];

  for (const event of events) {
    const kind = event.kind ?? 0;
    if (kind >= 30000 && kind < 40000) {
      const dTag = event.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
      const key = `${kind}:${event.pubkey}:${dTag}`;
      const existing = replaceableNewest.get(key);
      if (!existing || (event.created_at ?? 0) > (existing.created_at ?? 0)) {
        replaceableNewest.set(key, event);
      }
    } else {
      result.push(event);
    }
  }

  return [...result, ...replaceableNewest.values()];
}

// Re-export the subscription functions from the subscriptions module
export { subscribeAndStream, subscribeAndCollect } from './subscriptions';
