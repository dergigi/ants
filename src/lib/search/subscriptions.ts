import { NDKEvent, NDKFilter, NDKRelaySet, NDKSubscriptionCacheUsage, NDKSubscription, NDKRelay } from '@nostr-dev-kit/ndk';
import { safeSubscribe, isValidFilter, markRelayActivity } from '../ndk';
import { normalizeRelayUrl } from '../urlUtils';
import { trackEventRelay } from '../eventRelayTracking';
import { sortEventsNewestFirst } from '../utils/searchUtils';
import { createRelaySet, filterNip50Relays, getNip50SearchRelaySet } from '../relays';
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
    console.warn('NIP-50 relay filtering failed, resolving curated NIP-50 search relays:', error);
  }
  // Never fall back to unverified relays; resolve the curated set through the
  // NIP-50 pipeline (memoized) so even the error path honors the invariant.
  // An empty set (no results) is preferable to polluted results.
  return getNip50SearchRelaySet().catch(() => createRelaySet([]));
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
export type PartialEmitter = ((events: NDKEvent[]) => void) & { dispose: () => void };

export function createPartialEmitter(
  onPartialResults?: (events: NDKEvent[]) => void,
  abortSignal?: AbortSignal
): PartialEmitter | undefined {
  if (!onPartialResults) return undefined;
  const all = new Map<string, NDKEvent>();
  let lastEmitTime = -Infinity;
  let disposed = false;
  let trailingTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (disposed) return;
    lastEmitTime = Date.now();
    try { onPartialResults(sortEventsNewestFirst(Array.from(all.values()))); }
    catch (error) { console.warn('Search partial callback failed:', error); }
  };

  const emit = (events: NDKEvent[]) => {
    if (disposed) return;
    let changed = false;
    for (const evt of events) {
      if (evt.id && !all.has(evt.id)) { all.set(evt.id, evt); changed = true; }
    }
    if (!changed) return;
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
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (trailingTimer) clearTimeout(trailingTimer);
    trailingTimer = null;
    all.clear();
    abortSignal?.removeEventListener('abort', dispose);
  };
  abortSignal?.addEventListener('abort', dispose, { once: true });
  if (abortSignal?.aborted) dispose();
  return Object.assign(emit, { dispose });
}

/**
 * Collect events from a subscription until EOSE or timeout.
 * When onPartial is provided, newly collected events are forwarded to it
 * while collecting and once more on completion.
 */
export async function subscribeAndCollect(filter: NDKFilter, options: CollectOptions = {}): Promise<NDKEvent[]> {
  const { timeoutMs = 8000, relaySet, abortSignal, onPartial } = options;

  return new Promise<NDKEvent[]>((resolve) => {
    if (abortSignal?.aborted || !isValidFilter(filter)) {
      resolve([]);
      return;
    }

    const collected = new Map<string, NDKEvent>();
    let settled = false;
    let sub: NDKSubscription | null = null;

    const emit = (events: NDKEvent[]) => {
      if (!onPartial || abortSignal?.aborted || events.length === 0) return;
      try { onPartial(events); }
      catch (error) { console.warn('Search partial callback failed:', error); }
    };
    const onEvent = (event: NDKEvent, relay: NDKRelay | undefined) => {
      if (settled || abortSignal?.aborted) return;
      const relayUrl = relay?.url || 'unknown';
      if (relayUrl !== 'unknown') {
        try { markRelayActivity(relayUrl); } catch {}
      }
      trackEventRelay(event, normalizeRelayUrl(relayUrl));
      if (event.id && !collected.has(event.id)) {
        collected.set(event.id, event);
        emit([event]);
      }
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      abortSignal?.removeEventListener('abort', finish);
      if (sub) {
        sub.removeListener('event', onEvent);
        sub.removeListener('eose', finish);
        try { sub.stop(); } catch {}
      }
      const results = Array.from(collected.values());
      emit(results);
      resolve(results);
    };

    // The deadline includes relay discovery and NIP-50 capability checks.
    const timer = setTimeout(finish, timeoutMs);
    abortSignal?.addEventListener('abort', finish, { once: true });

    void (async () => {
      try {
        let rs = relaySet || await getSearchRelaySet();
        if (settled) return;
        if (filter.search) rs = await restrictToNip50Relays(rs);
        if (settled) return;

        // NDK otherwise schedules an automatic start in addition to ours.
        sub = safeSubscribe([filter], {
          closeOnEose: true, cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
          relaySet: rs, __trackFilters: true
        }, false);
        if (!sub) { finish(); return; }
        sub.on('event', onEvent);
        sub.on('eose', finish);
        sub.start();
      } catch (error) {
        console.warn('subscribeAndCollect setup failed:', error);
        finish();
      }
    })();
  });
}
