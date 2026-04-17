import { NDKEvent, NDKFilter, NDKRelaySet, NDKSubscriptionCacheUsage, NDKRelay } from '@nostr-dev-kit/ndk';
import { safeSubscribe, isValidFilter, markRelayActivity } from '../ndk';
import { normalizeRelayUrl } from '../urlUtils';
import { trackEventRelay } from '../eventRelayTracking';
import { sortEventsNewestFirst } from '../utils/searchUtils';
import { getSearchRelaySet } from './relayManagement';

/**
 * Streaming subscription that keeps connections open and streams results
 */
export async function subscribeAndStream(
  filter: NDKFilter, 
  options: {
    timeoutMs?: number;
    maxResults?: number;
    onResults?: (results: NDKEvent[], isComplete: boolean) => void;
    relaySet?: NDKRelaySet;
    abortSignal?: AbortSignal;
  } = {}
): Promise<NDKEvent[]> {
  const { timeoutMs = 30000, maxResults = 1000, onResults, relaySet, abortSignal } = options;
  const rs = relaySet || await getSearchRelaySet();
  
  return new Promise<NDKEvent[]>((resolve) => {
    // Check if already aborted
    if (abortSignal?.aborted) {
      resolve([]);
      return;
    }

    // Validate filter
    if (!isValidFilter(filter)) {
      console.warn('Invalid filter passed to subscribeAndStream, returning empty results');
      resolve([]);
      return;
    }

    const collected: Map<string, NDKEvent> = new Map();
    let isComplete = false;
    let lastEmitTime = 0;
    const emitInterval = 500; // Emit results every 500ms

    // Remove limit from filter for streaming - we'll handle it ourselves
    const streamingFilter = { ...filter };
    delete streamingFilter.limit;

    // Validate the streaming filter after modification
    if (!isValidFilter(streamingFilter)) {
      console.warn('Streaming filter became invalid after removing limit, returning empty results');
      resolve([]);
      return;
    }

    const sub = safeSubscribe([streamingFilter], { 
      closeOnEose: false, // Keep connection open!
      cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY, 
      relaySet: rs,
      __trackFilters: true
    });

    if (!sub) {
      console.warn('Failed to create subscription in subscribeAndStream');
      resolve([]);
      return;
    }

    const timer = setTimeout(() => {
      isComplete = true;
      try { sub.stop(); } catch {}
      // Final emit before resolving
      const sortedResults = sortEventsNewestFirst(Array.from(collected.values()));
      if (onResults) {
        onResults(sortedResults, true);
      }
      resolve(sortedResults);
    }, timeoutMs);

    // Handle abort signal
    const abortHandler = () => {
      isComplete = true;
      try { sub.stop(); } catch {}
      clearTimeout(timer);
      if (abortSignal) {
        try { abortSignal.removeEventListener('abort', abortHandler); } catch {}
      }
      const sortedResults = sortEventsNewestFirst(Array.from(collected.values()));
      if (onResults) {
        onResults(sortedResults, true);
      }
      resolve(sortedResults);
    };

    if (abortSignal) {
      abortSignal.addEventListener('abort', abortHandler);
    }

    // Periodic emission of results
    const emitResults = () => {
      if (onResults && !isComplete) {
        const now = Date.now();
        if (now - lastEmitTime >= emitInterval) {
          const sortedResults = sortEventsNewestFirst(Array.from(collected.values()));
          onResults(sortedResults, false);
          lastEmitTime = now;
        }
      }
    };

    sub.on('event', (event: NDKEvent, relay: NDKRelay | undefined) => {
      const relayUrl = relay?.url || 'unknown';
      // Mark this relay as active
      if (relayUrl !== 'unknown') {
        try { markRelayActivity(relayUrl); } catch {}
      }
      
      if (!collected.has(event.id)) {
        // Track this event's relay source
        trackEventRelay(event, relayUrl);
        collected.set(event.id, event);
        
        // Check if we've hit max results
        if (maxResults && collected.size >= maxResults) {
          isComplete = true;
          try { sub.stop(); } catch {}
          clearTimeout(timer);
          const sortedResults = sortEventsNewestFirst(Array.from(collected.values()));
          if (onResults) {
            onResults(sortedResults, true);
          }
          resolve(sortedResults);
          return;
        }
        
        // Emit results periodically
        emitResults();
      } else {
        // Event already exists, track this additional relay source
        trackEventRelay(event, relayUrl);
      }
    });

    sub.on('eose', () => {
      // Keep streaming after EOSE
    });
    
    sub.start();
  });
}

/**
 * Collect events from a subscription until EOSE or timeout
 */
export async function subscribeAndCollect(filter: NDKFilter, timeoutMs: number = 8000, relaySet?: NDKRelaySet, abortSignal?: AbortSignal): Promise<NDKEvent[]> {
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

    (async () => {
      const rs = relaySet || await getSearchRelaySet();
      const sub = safeSubscribe([filter], { closeOnEose: true, cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY, relaySet: rs, __trackFilters: true });
    
      if (!sub) {
        console.warn('Failed to create subscription in subscribeAndCollect');
        resolve([]);
        return;
      }
    const timer = setTimeout(() => {
      try { sub.stop(); } catch {}
      const finalResults = Array.from(collected.values());
      resolve(finalResults);
    }, timeoutMs);

    // Handle abort signal
    const abortHandler = () => {
      try { sub.stop(); } catch {}
      clearTimeout(timer);
      if (abortSignal) {
        try { abortSignal.removeEventListener('abort', abortHandler); } catch {}
      }
      // Resolve with whatever we have so far (partial results) instead of rejecting
      resolve(Array.from(collected.values()));
    };

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
      }
    });

      sub.on('eose', () => {
        clearTimeout(timer);
        if (abortSignal) {
          abortSignal.removeEventListener('abort', abortHandler);
        }
        resolve(Array.from(collected.values()));
      });
      
      sub.start();
    })();
  });
}

