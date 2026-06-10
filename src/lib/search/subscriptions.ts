import { NDKEvent, NDKFilter, NDKRelaySet, NDKSubscriptionCacheUsage, NDKRelay } from '@nostr-dev-kit/ndk';
import { safeSubscribe, isValidFilter, markRelayActivity } from '../ndk';
import { normalizeRelayUrl } from '../urlUtils';
import { trackEventRelay } from '../eventRelayTracking';
import { sortEventsNewestFirst } from '../utils/searchUtils';
import { getSearchRelaySet } from './relayManagement';

const PARTIAL_EMIT_INTERVAL_MS = 500;

export type CollectOptions = {
  timeoutMs?: number;
  relaySet?: NDKRelaySet;
  abortSignal?: AbortSignal;
  /** Called with the deduped, newest-first sorted events collected so far (throttled). */
  onPartial?: (events: NDKEvent[]) => void;
};

/**
 * Create a callback that merges partial batches (by event id) across multiple
 * subscriptions and emits the sorted union. Multi-seed paths (OR queries,
 * author fallbacks) share one emitter so partials accumulate instead of
 * clobbering each other.
 */
export function createPartialEmitter(
  onPartialResults?: (events: NDKEvent[]) => void
): ((events: NDKEvent[]) => void) | undefined {
  if (!onPartialResults) return undefined;
  const all = new Map<string, NDKEvent>();
  return (events: NDKEvent[]) => {
    for (const evt of events) {
      if (evt.id && !all.has(evt.id)) all.set(evt.id, evt);
    }
    onPartialResults(sortEventsNewestFirst(Array.from(all.values())));
  };
}

/**
 * Collect events from a subscription until EOSE or timeout.
 * When onPartial is provided, partial results are emitted while collecting
 * (throttled) and once more on completion.
 */
export async function subscribeAndCollect(filter: NDKFilter, options: CollectOptions = {}): Promise<NDKEvent[]> {
  const { timeoutMs = 8000, relaySet, abortSignal, onPartial } = options;

  return new Promise<NDKEvent[]>((resolve) => {
    // Check if already aborted
    if (abortSignal?.aborted) {
      resolve([]);
      return;
    }

    // Validate filter - ensure it has at least one meaningful property
    if (!isValidFilter(filter)) {
      console.warn('Invalid filter passed to subscribeAndCollect, returning empty results');
      resolve([]);
      return;
    }

    const collected: Map<string, NDKEvent> = new Map();
    let lastEmitTime = 0;
    let settled = false;

    const emitPartial = () => {
      if (!onPartial || settled) return;
      const now = Date.now();
      if (now - lastEmitTime < PARTIAL_EMIT_INTERVAL_MS) return;
      lastEmitTime = now;
      onPartial(sortEventsNewestFirst(Array.from(collected.values())));
    };

    (async () => {
      const rs = relaySet || await getSearchRelaySet();
      const sub = safeSubscribe([filter], { closeOnEose: true, cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY, relaySet: rs, __trackFilters: true });

      if (!sub) {
        console.warn('Failed to create subscription in subscribeAndCollect');
        resolve([]);
        return;
      }

      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (abortSignal) {
          try { abortSignal.removeEventListener('abort', abortHandler); } catch {}
        }
        try { sub.stop(); } catch {}
        const finalResults = Array.from(collected.values());
        // Final emission so shared emitters see this subscription's full set
        if (onPartial && finalResults.length > 0) {
          onPartial(sortEventsNewestFirst(finalResults));
        }
        resolve(finalResults);
      };

      const timer = setTimeout(finish, timeoutMs);
      const abortHandler = () => finish();

      if (abortSignal) {
        abortSignal.addEventListener('abort', abortHandler);
      }

      sub.on('event', (event: NDKEvent, relay: NDKRelay | undefined) => {
        const relayUrl = relay?.url || 'unknown';
        if (relayUrl !== 'unknown') {
          try { markRelayActivity(relayUrl); } catch {}
        }
        const normalizedUrl = normalizeRelayUrl(relayUrl);
        trackEventRelay(event, normalizedUrl);
        if (!collected.has(event.id)) {
          collected.set(event.id, event);
          emitPartial();
        }
      });

      sub.on('eose', finish);

      sub.start();
    })();
  });
}
