import { NDKEvent, NDKFilter, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { connectWithTimeout, resetLastReducedFilters } from './ndk';
import { getNip50SearchRelaySet } from './relays';
import { SEARCH_DEFAULT_KINDS } from './constants';
import { buildSearchQueryWithExtensions } from './search/searchUtils';
import { sortEventsNewestFirst } from './utils/searchUtils';
import {
  extractNip50Extensions,
  stripRelayFilters,
  applyDateFilter,
  parseSearchQuery
} from './search/queryParsing';
import { getBroadRelaySet } from './search/relayManagement';
import { subscribeAndCollect, createPartialEmitter } from './search/subscriptions';
import { runSearchStrategies } from './search/searchOrchestrator';
import { tryHandleAuthorSearch } from './search/strategies/authorSearchStrategy';
import { handleParenthesizedOr, handleTopLevelOr } from './search/orQueryHandler';
import { SearchOptions, SearchContext } from './search/types';

export async function searchEvents(
  query: string,
  limit: number = 200,
  options?: SearchOptions,
  relaySetOverride?: NDKRelaySet,
  abortSignal?: AbortSignal
): Promise<NDKEvent[]> {
  resetLastReducedFilters();
  // Check if already aborted
  if (abortSignal?.aborted) {
    throw new Error('Search aborted');
  }

  // Ensure we're connected before issuing any queries (with timeout)
  try {
    await connectWithTimeout(5000); // Increased timeout
  } catch (e) {
    console.warn('NDK connect failed or timed out:', e);
    // Continue anyway - search might still work with cached connections
  }

  // Check if aborted after connection
  if (abortSignal?.aborted) {
    throw new Error('Search aborted');
  }

  // Shared emitter: merges partials across all subscriptions of this search
  const onPartialResults = createPartialEmitter(options?.onPartialResults);
  const onProfileResultsUpdate = options?.onProfileResultsUpdate;

  // Extract NIP-50 extensions first
  const nip50Extraction = extractNip50Extensions(query);
  const nip50Extensions = nip50Extraction.extensions;

  // Remove legacy relay filters and choose the default search relay set
  let chosenRelaySet: NDKRelaySet;
  if (relaySetOverride) {
    chosenRelaySet = relaySetOverride;
  } else {
    try {
      chosenRelaySet = await getNip50SearchRelaySet();
    } catch (error) {
      console.warn('Failed to get NIP-50 search relay set, falling back to broader relay set:', error);
      // Fallback to broader relay set if NIP-50 search fails
      chosenRelaySet = await getBroadRelaySet();
    }
  }

  // Strip legacy relay filters but keep the rest of the query intact
  const extCleanedQuery = stripRelayFilters(nip50Extraction.cleaned);

  // Apply simple replacements to expand is: patterns to kind: patterns
  const { applySimpleReplacements } = await import('./search/replacements');
  const preprocessedQuery = await applySimpleReplacements(extCleanedQuery);

  // Parse query into structured format
  const parsedQuery = parseSearchQuery(preprocessedQuery, SEARCH_DEFAULT_KINDS);
  const { cleanedQuery, effectiveKinds, dateFilter, hasTopLevelOr, topLevelOrParts, extensionFilters } = parsedQuery;

  // Build search context for strategies (needed early for author search)
  const searchContext: SearchContext = {
    effectiveKinds,
    dateFilter,
    nip50Extensions,
    chosenRelaySet,
    relaySetOverride,
    abortSignal,
    limit,
    extensionFilters,
    onPartialResults,
    onProfileResultsUpdate
  };

  // Distribute parenthesized OR seeds across the entire query BEFORE any specialized handling
  // e.g., "(GM OR GN) by:dergigi" => ["GM by:dergigi", "GN by:dergigi"]
  const parenthesizedOrResults = await handleParenthesizedOr(cleanedQuery, searchContext);
  if (parenthesizedOrResults !== null) {
    return parenthesizedOrResults;
  }

  // EARLY: Author filter handling (resolve by:<author> to npub and use authors[] filter)
  if (!hasTopLevelOr) {
    const earlyAuthorResults = await tryHandleAuthorSearch(cleanedQuery, searchContext);
    if (earlyAuthorResults) return earlyAuthorResults;
  }

  // Check for top-level OR operator (outside parentheses)
  if (hasTopLevelOr) {
    return handleTopLevelOr(topLevelOrParts, searchContext);
  }

  // Run search strategies in order
  const strategyResults = await runSearchStrategies(extCleanedQuery, cleanedQuery, searchContext);
  if (strategyResults) return strategyResults;

  // Regular search without author filter
  try {
    let results: NDKEvent[] = [];
    const baseSearch = options?.exact ? `"${cleanedQuery}"` : cleanedQuery || undefined;
    const searchQuery = baseSearch ? buildSearchQueryWithExtensions(baseSearch, nip50Extensions) : undefined;
    // Create the filter object that will be sent to NDK
    const searchFilter = applyDateFilter({
      kinds: effectiveKinds,
      search: searchQuery
    }, dateFilter) as NDKFilter;

    results = await subscribeAndCollect(searchFilter, {
      timeoutMs: 8000,
      relaySet: chosenRelaySet,
      abortSignal,
      onPartial: onPartialResults
    });
    // Dedupe by id
    const filtered = results.filter((e, idx, arr) => {
      const firstIdx = arr.findIndex((x) => x.id === e.id);
      return firstIdx === idx;
    });

    return sortEventsNewestFirst(filtered).slice(0, limit);
  } catch (error) {
    // Treat aborted searches as benign; return empty without logging an error
    if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Search aborted')) {
      return [];
    }
    console.error('Error fetching events:', error);
    return [];
  }
}
