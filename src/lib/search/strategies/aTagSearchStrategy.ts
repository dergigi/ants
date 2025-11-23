import { NDKEvent } from '@nostr-dev-kit/ndk';
import { applyDateFilter } from '../queryParsing';
import { subscribeAndStream, subscribeAndCollect } from '../subscriptions';
import { getBroadRelaySet } from '../relayManagement';
import { sortEventsNewestFirst } from '../../utils/searchUtils';
import { SearchContext, TagTFilter } from '../types';

/**
 * Handle a: tag queries for replaceable events (e.g., a:30023:pubkey:d-tag)
 * Returns null if the query is not an a: tag query
 */
export async function tryHandleATagSearch(
  query: string,
  context: SearchContext
): Promise<NDKEvent[] | null> {
  const { effectiveKinds, dateFilter, limit, isStreaming, streamingOptions, abortSignal, extensionFilters } = context;
  
  const aTagMatch = query.match(/^a:(.+)$/i);
  if (aTagMatch) {
    const aTagValue = (aTagMatch[1] || '').trim();
    if (aTagValue) {
      const aTagFilter: TagTFilter = applyDateFilter({ kinds: effectiveKinds, '#a': [aTagValue], limit: Math.max(limit, 500) }, dateFilter) as TagTFilter;
      
      // Use broader relay set for a tag searches
      const aTagRelaySet = await getBroadRelaySet();

      const results = isStreaming
        ? await subscribeAndStream(aTagFilter, {
            timeoutMs: streamingOptions?.timeoutMs || 30000,
            maxResults: streamingOptions?.maxResults || 1000,
            onResults: streamingOptions?.onResults,
            relaySet: aTagRelaySet,
            abortSignal
          })
        : await subscribeAndCollect(aTagFilter, 10000, aTagRelaySet, abortSignal);

      let final = results;
      if (extensionFilters && extensionFilters.length > 0) {
        final = final.filter((e) => extensionFilters.every((f) => f(e.content || '')));
      }
      return sortEventsNewestFirst(final).slice(0, limit);
    }
  }
  
  return null;
}

