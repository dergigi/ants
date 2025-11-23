import { NDKEvent } from '@nostr-dev-kit/ndk';
import { applyDateFilter } from '../queryParsing';
import { subscribeAndStream, subscribeAndCollect } from '../subscriptions';
import { getBroadRelaySet } from '../relayManagement';
import { sortEventsNewestFirst } from '../../utils/searchUtils';
import { SearchContext, TagTFilter } from '../types';

/**
 * Handle pure hashtag search queries
 * Returns null if the query is not a pure hashtag query
 */
export async function tryHandleHashtagSearch(
  query: string,
  context: SearchContext
): Promise<NDKEvent[] | null> {
  const { effectiveKinds, dateFilter, limit, isStreaming, streamingOptions, abortSignal, extensionFilters } = context;
  
  const hashtagMatches = query.match(/#[A-Za-z0-9_]+/g) || [];
  const nonHashtagRemainder = query.replace(/#[A-Za-z0-9_]+/g, '').trim();
  
  if (hashtagMatches.length > 0 && nonHashtagRemainder.length === 0) {
    const tags = Array.from(new Set(hashtagMatches.map((h) => h.slice(1).toLowerCase())));
    const tagFilter: TagTFilter = applyDateFilter({ kinds: effectiveKinds, '#t': tags, limit: Math.max(limit, 500) }, dateFilter) as TagTFilter;

    // Use broader relay set for hashtag searches - include all available relays
    const tagRelaySet = await getBroadRelaySet();

    const results = isStreaming
      ? await subscribeAndStream(tagFilter, {
          timeoutMs: streamingOptions?.timeoutMs || 30000,
          maxResults: streamingOptions?.maxResults || 1000,
          onResults: streamingOptions?.onResults,
          relaySet: tagRelaySet,
          abortSignal
        })
      : await subscribeAndCollect(tagFilter, 10000, tagRelaySet, abortSignal);

    let final = results;
    if (extensionFilters && extensionFilters.length > 0) {
      final = final.filter((e) => extensionFilters.every((f) => f(e.content || '')));
    }
    return sortEventsNewestFirst(final).slice(0, limit);
  }
  
  return null;
}

