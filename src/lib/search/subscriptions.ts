import { NDKEvent, NDKFilter, NDKRelaySet, NDKSubscriptionCacheUsage, NDKRelay } from '@nostr-dev-kit/ndk';
import { safeSubscribe, isValidFilter, markRelayActivity } from '../ndk';
import { normalizeRelayUrl } from '../urlUtils';
import { trackEventRelay } from '../eventRelayTracking';
import { sortEventsNewestFirst } from '../utils/searchUtils';
import { RELAYS, createRelaySet, filterNip50Relays } from '../relays';
import { getSearchRelaySet } from './relayManagement';

/**
 * Text searches MUST only go to NIP-50 relays. Relays without NIP-50 support
 * ignore the `search` field and return arbitrary events matching the rest of
 * the filter, polluting the results. This is the single choke point for all
 * event subscriptions, so every `search` filter gets restricted here no
 * matter which relay set (broad, user, fallback) the caller picked.
 */
async function restrictToNip50Relays(relaySet: NDKRelaySet): Promise<NDKRelaySet> {
  try {
    const urls = Array.from(relaySet.relays).map((relay) => relay.url);
    const nip50Urls = await filterNip50Relays(urls);
    if (nip50Urls.length === urls.length) return relaySet;
    if (nip50Urls.length > 0) return createRelaySet(nip50Urls);
  } catch (error) {
    console.warn('NIP-50 relay filtering failed, using curated search relays:', error);
  }
  // Never fall back to non-NIP-50 relays; use the curated search relays instead
  return createRelaySet([...RELAYS.SEARCH]);
}

const PARTIAL_EMIT_INTERVAL_MS = 500;

export type CollectOptions = {
  timeoutMs?: number;
  relaySet?: NDKRelaySet;
  abortSignal?: AbortSignal;
  /**
   * Called with batches of newly collected events while the subscription is
   * open. Pass an emitter from createPartialEmitter, which accumulates,
   * dedupes, sorts, and throttles before notifying the UI.
   */
  onPartial?: (events: NDKEvent[]) => void;
};

/**
 * Create a callback that merges partial batches (by event id) across multiple
 * subscriptions and emits the sorted union, throttled to one emission per
 * PARTIAL_EMIT_INTERVAL_MS (with a trailing flush so the last batch always
 * lands). Multi-seed paths (OR queries, author fallbacks) share one emitter
 * so partials accumulate instead of clobbering each other.
 */
export function createPartialEmitter(
  onPartialResults?: (events: NDKEvent[]) => void
): ((events: NDKEvent[]) => void) | undefined {
  if (!onPartialResults) return undefined;
  const all = new Map<string, NDKEvent>();
  let lastEmitTime = 0;
  let trailingTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    lastEmitTime = Date.now();
    onPartialResults(sortEventsNewestFirst(Array.from(all.values())));
  };

  return (events: NDKEvent[]) => {
    for (const evt of events) {
      if (evt.id && !all.has(evt.id)) all.set(evt.id, evt);
    }
    const elapsed = Date.now() - lastEmitTime;
    if (elapsed >= PARTIAL_EMIT_INTERVAL_MS) {
      if (trailingTimer) { clearTimeout(trailingTimer); trailingTimer = null; }
      flush();
    } else if (!trailingTimer) {
      trailingTimer = setTimeout(() => {
        trailingTimer = null;
        flush();
      }, PARTIAL_EMIT_INTERVAL_MS - elapsed);
    }
  };
}

/**
 * Collect events from a subscription until EOSE or timeout.
 * When onPartial is provided, newly collected events are forwarded to it
 * while collecting and once more on completion.
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
    let settled = false;

    (async () => {
      let rs: NDKRelaySet;
      try {
        rs = relaySet || await getSearchRelaySet();
      } catch (error) {
        console.warn('Failed to resolve relay set in subscribeAndCollect:', error);
        resolve([]);
        return;
      }

      if (filter.search) {
        rs = await restrictToNip50Relays(rs);
      }

      // An abort may have fired while awaiting the relay set
      if (abortSignal?.aborted) {
        resolve([]);
        return;
      }

      try {
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
            onPartial(finalResults);
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
            // Throttling happens in the shared emitter (createPartialEmitter)
            if (onPartial && !settled) onPartial([event]);
          }
        });

        sub.on('eose', finish);

        sub.start();
      } catch (error) {
        console.warn('subscribeAndCollect setup failed:', error);
        settled = true;
        resolve(Array.from(collected.values()));
      }
    })();
  });
}
