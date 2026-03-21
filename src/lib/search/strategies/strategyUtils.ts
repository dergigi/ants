import { NDKEvent, NDKFilter, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { subscribeAndCollect } from '../subscriptions';
import { getBroadRelaySet } from '../relayManagement';
import { sortEventsNewestFirst } from '../../utils/searchUtils';

/**
 * Shared helper for tag-filter strategies: select relay set, fetch with fallback,
 * deduplicate by event ID, sort newest-first, and slice to limit.
 */
export async function fetchDedupeAndSort(
  filter: NDKFilter,
  chosenRelaySet: NDKRelaySet,
  hasSearchTerm: boolean,
  abortSignal: AbortSignal | undefined,
  limit: number
): Promise<NDKEvent[]> {
  let relaySet: NDKRelaySet;
  try {
    relaySet = hasSearchTerm ? chosenRelaySet : await getBroadRelaySet();
  } catch {
    relaySet = chosenRelaySet;
  }

  let results: NDKEvent[];
  try {
    results = await subscribeAndCollect(filter, 10000, relaySet, abortSignal);
  } catch {
    if (relaySet !== chosenRelaySet) {
      try {
        results = await subscribeAndCollect(filter, 10000, chosenRelaySet, abortSignal);
      } catch {
        results = [];
      }
    } else {
      results = [];
    }
  }

  const dedupe = new Map<string, NDKEvent>();
  for (const e of results) if (!dedupe.has(e.id)) dedupe.set(e.id, e);

  return sortEventsNewestFirst(Array.from(dedupe.values())).slice(0, limit);
}
