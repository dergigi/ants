import { NDKEvent } from '@nostr-dev-kit/ndk';
import { SearchContext } from '../types';

/**
 * Handle URL search queries
 * Returns null if the query is not a URL
 */
export async function tryHandleUrlSearch(
  query: string,
  context: SearchContext
): Promise<NDKEvent[] | null> {
  try {
    const url = new URL(query);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      const { searchUrlEvents } = await import('../urlSearch');
      return await searchUrlEvents(query, context);
    }
  } catch {
    // Not a valid URL
  }

  return null;
}
