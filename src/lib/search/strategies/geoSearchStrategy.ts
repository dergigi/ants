import { NDKEvent } from '@nostr-dev-kit/ndk';
import { applyDateFilter } from '../queryParsing';
import { subscribeAndStream, subscribeAndCollect } from '../subscriptions';
import { getBroadRelaySet } from '../relayManagement';
import { sortEventsNewestFirst } from '../../utils/searchUtils';
import { SearchContext, TagTFilter } from '../types';
import { prefixes } from '../../geohash';
import { SEARCH_DEFAULT_KINDS } from '../../constants';

// Kinds that commonly carry g tags — NIP-99 listings, NIP-52 calendar events
const GEO_AWARE_KINDS = [30402, 31922, 31923];

/**
 * Check if an event's g tag falls within the search geohash area.
 * Only matches when the event's hash is at least as specific as the search —
 * e.g., search "u129" matches event "u1290pv42" (inside our box)
 * but NOT event "u1" (covers half of Europe, too broad).
 */
function eventMatchesGeohash(event: NDKEvent, searchHash: string): boolean {
  for (const tag of event.tags) {
    if (Array.isArray(tag) && tag[0] === 'g' && tag[1]) {
      const eventHash = tag[1].toLowerCase();
      if (eventHash.startsWith(searchHash)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Handle geohash-based search queries (g:<geohash>).
 *
 * Strategy:
 * 1. Try relay-side #g tag exact match at multiple precision levels
 * 2. If no results, fall back to fetching by kind and filtering client-side
 *    (handles events with only high-precision g tags that don't exact-match)
 *
 * Returns null if no geo filter is present in the context.
 */
export async function tryHandleGeoSearch(
  query: string,
  context: SearchContext
): Promise<NDKEvent[] | null> {
  const { geoFilter, effectiveKinds, dateFilter, limit, isStreaming, streamingOptions, abortSignal } = context;

  if (!geoFilter?.geohash) return null;

  const geohash = geoFilter.geohash;

  // Extract any kind numbers from the query (including inside parens that extractKindFilter misses).
  // e.g., "(kind:31922 OR kind:31923)" → [31922, 31923]
  const inlineKinds: number[] = [];
  const kindRx = /\bkind:(\d+)/gi;
  let km: RegExpExecArray | null;
  while ((km = kindRx.exec(query)) !== null) {
    const n = parseInt(km[1], 10);
    if (!Number.isNaN(n)) inlineKinds.push(n);
  }

  // Strip kind tokens, OR operators, and parens from residual — these are structural,
  // not text to search for.
  const residual = query
    .replace(/\bkind:[0-9,\s]+/gi, '')
    .replace(/\b(OR|AND)\b/gi, '')
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Determine effective kinds for geo query:
  // 1. If user specified kinds inline (e.g., is:event → kind:31922 OR kind:31923), use ONLY those
  // 2. If effectiveKinds differ from defaults, user specified via other means — use those
  // 3. Otherwise (defaults), broaden with geo-aware kinds
  const isDefaultKinds = effectiveKinds.length === SEARCH_DEFAULT_KINDS.length &&
    effectiveKinds.every(k => SEARCH_DEFAULT_KINDS.includes(k));
  let geoKinds: number[];
  if (inlineKinds.length > 0) {
    // User explicitly specified kinds (e.g., "is:event g:u129") — use only those
    geoKinds = Array.from(new Set(inlineKinds));
  } else if (!isDefaultKinds) {
    // Kinds set by other means — respect them
    geoKinds = effectiveKinds;
  } else {
    // Default kinds — broaden with geo-aware kinds
    geoKinds = Array.from(new Set([...effectiveKinds, ...GEO_AWARE_KINDS]));
  }

  const geoRelaySet = await getBroadRelaySet();
  const seen = new Set<string>();
  const merged: NDKEvent[] = [];

  // --- Phase 1: Relay-side #g exact match at multiple precision levels ---
  // Minimum prefix length 3 (~156km) — shorter prefixes are too broad (u1 = half of Europe)
  const geoHashPrefixes = prefixes(geohash, 3);

  const exactQueries = geoHashPrefixes.map(async (prefix) => {
    if (abortSignal?.aborted) return [];

    const filter: TagTFilter = applyDateFilter(
      { kinds: geoKinds, '#g': [prefix], limit: Math.max(limit, 200) },
      dateFilter
    ) as TagTFilter;

    if (residual.length > 0) {
      (filter as TagTFilter & { search?: string }).search = residual;
    }

    try {
      if (isStreaming) {
        return await subscribeAndStream(filter, {
          timeoutMs: streamingOptions?.timeoutMs || 30000,
          maxResults: streamingOptions?.maxResults || 1000,
          onResults: streamingOptions?.onResults,
          relaySet: geoRelaySet,
          abortSignal,
        });
      }
      return await subscribeAndCollect(filter, 10000, geoRelaySet, abortSignal);
    } catch (error) {
      console.warn(`Geo search failed for prefix "${prefix}":`, error);
      return [];
    }
  });

  const exactResults = await Promise.allSettled(exactQueries);
  for (const result of exactResults) {
    if (result.status === 'fulfilled') {
      for (const evt of result.value) {
        if (!seen.has(evt.id) && eventMatchesGeohash(evt, geohash)) {
          seen.add(evt.id);
          merged.push(evt);
        }
      }
    }
  }

  // --- Phase 2: Fallback — fetch by kind, filter client-side by geohash prefix ---
  // Handles events that only have a single high-precision g tag (e.g., "u1290pv42")
  // that doesn't exact-match our search prefix (e.g., "u129").
  if (merged.length === 0) {
    const fallbackFilter: TagTFilter = applyDateFilter(
      { kinds: geoKinds, limit: Math.max(limit, 500) },
      dateFilter
    ) as TagTFilter;

    if (residual.length > 0) {
      (fallbackFilter as TagTFilter & { search?: string }).search = residual;
    }

    try {
      const allEvents = await subscribeAndCollect(fallbackFilter, 10000, geoRelaySet, abortSignal);
      for (const evt of allEvents) {
        if (!seen.has(evt.id) && eventMatchesGeohash(evt, geohash)) {
          seen.add(evt.id);
          merged.push(evt);
        }
      }
    } catch (error) {
      console.warn('Geo fallback search failed:', error);
    }
  }

  return sortEventsNewestFirst(merged).slice(0, limit);
}
