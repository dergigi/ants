import { NDKEvent, NDKFilter, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { resetLastReducedFilters, ndk, ensureCacheInitialized } from './ndk';
import { getNip50SearchRelaySet } from './relays';
import { SEARCH_DEFAULT_KINDS } from './constants';

// Import shared utilities
import { buildSearchQueryWithExtensions } from './search/searchUtils';
import { sortEventsNewestFirst } from './utils/searchUtils';

// Import query parsing utilities
import {
  extractNip50Extensions,
  stripRelayFilters,
  applyDateFilter,
  parseSearchQuery
} from './search/queryParsing';

// Import relay management utilities
import { getBroadRelaySet } from './search/relayManagement';

// Import subscription utilities
import { subscribeAndStream, subscribeAndCollect } from './search/subscriptions';

// Import orchestrator
import { runSearchStrategies } from './search/searchOrchestrator';
import { tryHandleAuthorSearch } from './search/strategies/authorSearchStrategy';

// Import OR handling
import { handleParenthesizedOr } from './search/orExpansion';
import { handleTopLevelOr } from './search/topLevelOr';

// Import content filtering
import { applyContentFilter } from './search/contentFilter';

// Import id lookup for early bypass
import { handleIdLookup } from './search/strategies/idSearchStrategy';

// Import types
import { StreamingSearchOptions, SearchContext } from './search/types';

// Centralized media extension lists (keep DRY)
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'gifs', 'apng', 'webp', 'avif', 'svg'] as const;
export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogg', 'ogv', 'mov', 'm4v'] as const;
export const GIF_EXTENSIONS = ['gif', 'gifs', 'apng'] as const;

// Re-export query transformation utilities for backwards compatibility
export { parseOrQuery, expandParenthesizedOr } from './search/queryTransforms';

export async function searchEvents(
  query: string,
  limit: number = 200,
  options?: { exact?: boolean } | StreamingSearchOptions,
  relaySetOverride?: NDKRelaySet,
  abortSignal?: AbortSignal
): Promise<NDKEvent[]> {
  resetLastReducedFilters();
  if (abortSignal?.aborted) throw new Error('Search aborted');

  await ensureCacheInitialized();

  // Non-blocking: kick off relay connections if not already up
  const hasConnectedRelays = Array.from(ndk.pool?.relays?.values() ?? []).some((r) => r.status === 1);
  if (!hasConnectedRelays) ndk.connect().catch(() => {});

  if (abortSignal?.aborted) throw new Error('Search aborted');

  // Early bypass: id: queries skip the full pipeline (no relay discovery, no kind/date parsing)
  if (/\bid:\S+/i.test(query)) {
    const idResults = await handleIdLookup(query, abortSignal, limit);
    if (idResults) return idResults;
  }

  const isStreaming = options && 'streaming' in options && options.streaming;
  const streamingOptions = isStreaming ? (options as StreamingSearchOptions) : undefined;

  // Extract NIP-50 extensions and strip relay filters
  const nip50Extraction = extractNip50Extensions(query);
  const nip50Extensions = nip50Extraction.extensions;

  let chosenRelaySet: NDKRelaySet;
  if (relaySetOverride) {
    chosenRelaySet = relaySetOverride;
  } else {
    try {
      chosenRelaySet = await getNip50SearchRelaySet();
    } catch {
      chosenRelaySet = await getBroadRelaySet();
    }
  }

  const extCleanedQuery = stripRelayFilters(nip50Extraction.cleaned);
  const { applySimpleReplacements } = await import('./search/replacements');
  const preprocessedQuery = await applySimpleReplacements(extCleanedQuery);

  const parsedQuery = parseSearchQuery(preprocessedQuery, SEARCH_DEFAULT_KINDS);
  const { cleanedQuery, effectiveKinds, dateFilter, hasTopLevelOr, topLevelOrParts, extensionFilters, geoFilter } = parsedQuery;

  const searchContext: SearchContext = {
    effectiveKinds, dateFilter, geoFilter, nip50Extensions, chosenRelaySet,
    relaySetOverride, isStreaming: isStreaming || false, streamingOptions,
    abortSignal, limit, extensionFilters
  };

  // EARLY: Geo search — must run before OR expansion to avoid losing the #g filter
  if (geoFilter?.geohash) {
    const { tryHandleGeoSearch } = await import('./search/strategies/geoSearchStrategy');
    const geoResults = await tryHandleGeoSearch(cleanedQuery, searchContext);
    if (geoResults) return geoResults;
  }

  // 1. Try parenthesized OR expansion: "(GM OR GN) by:dergigi"
  const parenOrResult = await handleParenthesizedOr(
    cleanedQuery, effectiveKinds, dateFilter, nip50Extensions, chosenRelaySet, abortSignal, limit
  );
  if (parenOrResult) return parenOrResult;

  // 2. Early author filter: "by:dergigi" without top-level OR
  if (!hasTopLevelOr) {
    const earlyAuthorResults = await tryHandleAuthorSearch(cleanedQuery, searchContext);
    if (earlyAuthorResults) return earlyAuthorResults;
  }

  // 3. Top-level OR: "bitcoin OR lightning"
  if (hasTopLevelOr) {
    const topOrResult = await handleTopLevelOr(
      topLevelOrParts, effectiveKinds, dateFilter, nip50Extensions,
      chosenRelaySet, relaySetOverride, abortSignal, limit
    );
    if (topOrResult) return topOrResult;
  }

  // 4. Run search strategies (URL, hashtag, mentions, etc.)
  const strategyResults = await runSearchStrategies(extCleanedQuery, cleanedQuery, searchContext);
  if (strategyResults) return strategyResults;

  // 5. Regular NIP-50 search
  try {
    const baseSearch = options?.exact ? `"${cleanedQuery}"` : cleanedQuery;
    const searchQuery = buildSearchQueryWithExtensions(baseSearch || '', nip50Extensions) || undefined;
    const searchFilter = applyDateFilter({ kinds: effectiveKinds, search: searchQuery }, dateFilter) as NDKFilter;

    const results: NDKEvent[] = isStreaming
      ? await subscribeAndStream(searchFilter, {
          timeoutMs: streamingOptions?.timeoutMs || 30000,
          maxResults: streamingOptions?.maxResults || 1000,
          onResults: streamingOptions?.onResults,
          relaySet: chosenRelaySet,
          abortSignal
        })
      : await subscribeAndCollect(searchFilter, 8000, chosenRelaySet, abortSignal);

    // Dedupe by event id
    const seen = new Set<string>();
    let filtered = results.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });

    filtered = applyContentFilter(filtered, cleanedQuery);
    return sortEventsNewestFirst(filtered).slice(0, limit);
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Search aborted')) {
      return [];
    }
    console.error('Error fetching events:', error);
    return [];
  }
}

// Convenience function for streaming search
export async function searchEventsStreaming(
  query: string,
  onResults: (results: NDKEvent[], isComplete: boolean) => void,
  options: {
    maxResults?: number;
    timeoutMs?: number;
    exact?: boolean;
    relaySetOverride?: NDKRelaySet;
    abortSignal?: AbortSignal;
  } = {}
): Promise<NDKEvent[]> {
  return searchEvents(query, 1000, {
    streaming: true, onResults,
    maxResults: options.maxResults || 1000,
    timeoutMs: options.timeoutMs || 30000,
    exact: options.exact
  }, options.relaySetOverride, options.abortSignal);
}
