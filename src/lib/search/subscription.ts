import { NDKEvent, NDKFilter, NDKRelaySet, NDKSubscriptionCacheUsage, NDKRelay } from '@nostr-dev-kit/ndk';
import { ndk, markRelayActivity, safeSubscribe, isValidFilter } from '../ndk';
import { relaySets } from '../relays';
import { RelayObject, NDKEventWithRelaySource, StreamingSearchOptions } from './types';

// Use a search-capable relay set explicitly for NIP-50 queries (lazy, async)
let searchRelaySetPromise: Promise<NDKRelaySet> | null = null;
async function getSearchRelaySet(): Promise<NDKRelaySet> {
  if (!searchRelaySetPromise) searchRelaySetPromise = relaySets.search();
  return searchRelaySetPromise;
}

// Streaming subscription that keeps connections open and streams results
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

    console.log('subscribeAndStream called with filter:', filter);

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
      relaySet: rs 
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
      const sortedResults = Array.from(collected.values()).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
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
      const sortedResults = Array.from(collected.values()).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
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
          const sortedResults = Array.from(collected.values()).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
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
        const eventWithSource = event as NDKEventWithRelaySource;
        eventWithSource.relaySource = relayUrl;
        eventWithSource.relaySources = [relayUrl];
        collected.set(event.id, eventWithSource);
        
        // Check if we've hit max results
        if (maxResults && collected.size >= maxResults) {
          isComplete = true;
          try { sub.stop(); } catch {}
          clearTimeout(timer);
          const sortedResults = Array.from(collected.values()).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
          if (onResults) {
            onResults(sortedResults, true);
          }
          resolve(sortedResults);
          return;
        }
        
        // Emit results periodically
        emitResults();
      } else {
        // Event already exists, add this relay to the sources
        const existingEvent = collected.get(event.id) as NDKEventWithRelaySource;
        if (existingEvent.relaySources && !existingEvent.relaySources.includes(relayUrl)) {
          existingEvent.relaySources.push(relayUrl);
        }
      }
    });

    sub.on('eose', () => {
      console.log('EOSE received, but keeping connection open for more results...');
      // Don't close on EOSE - keep streaming!
    });

    sub.start();
  });
}

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

    // Debug: log the filter being used
    console.log('subscribeAndCollect called with filter:', filter);

    const collected: Map<string, NDKEvent> = new Map();

    // Debug: which relays are we querying?
    try {
      const relaysContainer = (relaySet as unknown as { relays?: unknown; relayUrls?: unknown }).relays ?? 
                             (relaySet as unknown as { relayUrls?: unknown }).relayUrls;
      const relayEntries: RelayObject[] = Array.isArray(relaysContainer)
        ? relaysContainer
        : relaysContainer && (relaysContainer instanceof Set || relaysContainer instanceof Map)
          ? Array.from((relaysContainer as Set<RelayObject> | Map<string, RelayObject>).values?.() ?? relaysContainer)
          : [];
      const relayUrls = relayEntries
        .map((r: RelayObject) => r?.url || r?.relay?.url || r)
        .filter((u: unknown): u is string => typeof u === 'string');
      console.log('Subscribing with filter on relays:', { relayUrls, filter });
    } catch {}

    (async () => {
      const rs = relaySet || await getSearchRelaySet();
      const sub = safeSubscribe([filter], { closeOnEose: true, cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY, relaySet: rs });
    
      if (!sub) {
        console.warn('Failed to create subscription in subscribeAndCollect');
        resolve([]);
        return;
      }
      const timer = setTimeout(() => {
        try { sub.stop(); } catch {}
        resolve(Array.from(collected.values()));
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
        // Mark this relay as active for robust connection status
        if (relayUrl !== 'unknown') {
          try { markRelayActivity(relayUrl); } catch {}
        }
        
        if (!collected.has(event.id)) {
          // First time seeing this event
          const eventWithSource = event as NDKEventWithRelaySource;
          eventWithSource.relaySource = relayUrl;
          eventWithSource.relaySources = [relayUrl];
          collected.set(event.id, eventWithSource);
        } else {
          // Event already exists, add this relay to the sources
          const existingEvent = collected.get(event.id) as NDKEventWithRelaySource;
          if (existingEvent.relaySources && !existingEvent.relaySources.includes(relayUrl)) {
            existingEvent.relaySources.push(relayUrl);
          }
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

export async function searchByAnyTerms(
  terms: string[],
  limit: number,
  relaySet: NDKRelaySet,
  abortSignal?: AbortSignal,
  nip50Extensions?: any,
  baseFilter?: Partial<NDKFilter>
): Promise<NDKEvent[]> {
  // Run independent NIP-50 searches for each term and merge results (acts like boolean OR)
  const seen = new Set<string>();
  const merged: NDKEvent[] = [];
  for (const term of terms) {
    try {
      const { buildSearchQueryWithExtensions } = require('./nip50');
      const searchQuery = nip50Extensions ? buildSearchQueryWithExtensions(term, nip50Extensions) : term;
      const filter: NDKFilter = {
        kinds: [1],
        ...(baseFilter || {}),
        search: searchQuery,
        limit: Math.max(limit, 200)
      };
      const res = await subscribeAndCollect(filter, 8000, relaySet, abortSignal);
      for (const evt of res) {
        if (!seen.has(evt.id)) { seen.add(evt.id); merged.push(evt); }
      }
    } catch (error) {
      // Don't log aborted searches as errors
      if (error instanceof Error && error.message === 'Search aborted') {
        return merged; // Return what we have so far
      }
      // Log other errors but continue
      console.warn('Search term failed:', term, error);
    }
  }
  return merged;
}
