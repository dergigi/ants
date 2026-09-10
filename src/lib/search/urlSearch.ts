import { NDKEvent } from '@nostr-dev-kit/ndk';
import {
  sortEventsNewestFirst,
  buildSearchQueryWithExtensions
} from './searchUtils';
import { subscribeAndCollect } from './subscriptions';
import { SearchContext } from './types';

export async function searchUrlEvents(
  cleanedQuery: string,
  context: SearchContext
): Promise<NDKEvent[]> {
  const { effectiveKinds, nip50Extensions, limit, chosenRelaySet, abortSignal, onPartialResults } = context;

  // Search for the URL content (protocol stripping now handled by replacement rules)
  const searchQuery = buildSearchQueryWithExtensions(`"${cleanedQuery}"`, nip50Extensions || {});

  const results = await subscribeAndCollect({
    kinds: effectiveKinds,
    search: searchQuery,
    limit: Math.max(limit, 200)
  }, {
    timeoutMs: 8000,
    relaySet: chosenRelaySet,
    abortSignal,
    onPartial: onPartialResults
  });

  return sortEventsNewestFirst(results).slice(0, limit);
}
