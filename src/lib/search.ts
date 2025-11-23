import { NDKEvent, NDKFilter, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { connectWithTimeout, resetLastReducedFilters } from './ndk';
import { searchProfilesFullText, resolveAuthor } from './vertex';
import { nip19 } from 'nostr-tools';
import { getNip50SearchRelaySet } from './relays';
import { SEARCH_DEFAULT_KINDS } from './constants';

// Import shared utilities
import { 
  buildSearchQueryWithExtensions
} from './search/searchUtils';
import { sortEventsNewestFirst } from './utils/searchUtils';

// Import query parsing utilities
import {
  extractNip50Extensions,
  stripRelayFilters,
  extractKindFilter,
  applyDateFilter,
  normalizeResidualSearchText,
  parseSearchQuery
} from './search/queryParsing';

// Import query transformation utilities
import {
  expandParenthesizedOr
} from './search/queryTransforms';

// Import relay management utilities
import {
  getBroadRelaySet
} from './search/relayManagement';

// Import subscription utilities
import {
  subscribeAndStream,
  subscribeAndCollect
} from './search/subscriptions';

// Import orchestrator
import { runSearchStrategies } from './search/searchOrchestrator';
// Import author search strategy for early author handling
import { tryHandleAuthorSearch } from './search/strategies/authorSearchStrategy';

// Import term search utilities
import { searchByAnyTerms } from './search/termSearch';

// Import types
import { StreamingSearchOptions, SearchContext } from './search/types';


// Note: We no longer inject properties into NDKEvent objects
// Instead, we use the eventRelayTracking system to track relay sources





// Centralized media extension lists (keep DRY)
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'gifs', 'apng', 'webp', 'avif', 'svg'] as const;
export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogg', 'ogv', 'mov', 'm4v'] as const;
export const GIF_EXTENSIONS = ['gif', 'gifs', 'apng'] as const;


// (Removed heuristic content filter; rely on recursive OR expansion + relay-side search)

// Re-export getUserRelayUrls for backwards compatibility
export { getUserRelayUrls } from './search/relayManagement';



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

  // Check if this is a streaming search
  const isStreaming = options && 'streaming' in options && options.streaming;
  const streamingOptions = isStreaming ? options as StreamingSearchOptions : undefined;

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
    isStreaming: isStreaming || false,
    streamingOptions,
    abortSignal,
    limit,
    extensionFilters
  };

  // Distribute parenthesized OR seeds across the entire query BEFORE any specialized handling
  // e.g., "(GM OR GN) by:dergigi" => ["GM by:dergigi", "GN by:dergigi"]
  {
    const expandedSeeds = expandParenthesizedOr(cleanedQuery).map((seed) => seed.trim()).filter(Boolean);
    if (expandedSeeds.length > 1) {

      // Special-case: if all expanded seeds are profile searches (p:<term>), run profile full-text search per seed
      const isPSeed = (s: string) => /^p:\S+/i.test(s.replace(/^\s+|\s+$/g, ''));
      const allPSeeds = expandedSeeds.every(isPSeed);
      if (allPSeeds) {
        const pTerms = expandedSeeds
          .map((s) => s.replace(/^p:/i, '').trim())
          .filter((t) => t.length > 0);
        const mergedProfiles: NDKEvent[] = [];
        const seenPubkeys = new Set<string>();
        for (const term of pTerms) {
          try {
            const profiles = await searchProfilesFullText(term);
            for (const evt of profiles) {
              const pk = evt.pubkey || evt.author?.pubkey || '';
              if (pk && !seenPubkeys.has(pk)) {
                seenPubkeys.add(pk);
                mergedProfiles.push(evt);
              }
            }
          } catch {}
        }
        return sortEventsNewestFirst(mergedProfiles).slice(0, limit);
      }

      // Check if all seeds differ only by by: clauses (optimization: single filter with multiple authors)
      const extractByTokens = (s: string): string[] => {
        const matches = Array.from(s.matchAll(/\bby:(\S+)/gi));
        return matches.map(m => m[1] || '').filter(Boolean);
      };
      
      const extractNonByContent = (s: string): string => {
        return s.replace(/\bby:\S+/gi, '').replace(/\s+/g, ' ').trim();
      };
      
      const firstNonBy = extractNonByContent(expandedSeeds[0]);
      const allSameNonBy = expandedSeeds.every(seed => extractNonByContent(seed) === firstNonBy);
      const allHaveBy = expandedSeeds.every(seed => /\bby:\S+/i.test(seed));
      
      if (allSameNonBy && allHaveBy && expandedSeeds.length > 1) {
        // All seeds are identical except for by: clauses - optimize with single filter
        const allByTokens = expandedSeeds.flatMap(extractByTokens);
        const uniqueByTokens = Array.from(new Set(allByTokens));
        
        // Resolve all authors to pubkeys
        const resolvedPubkeys: string[] = [];
        for (const authorToken of uniqueByTokens) {
          try {
            if (/^npub1[0-9a-z]+$/i.test(authorToken)) {
              const hex = nip19.decode(authorToken).data as string;
              resolvedPubkeys.push(hex);
            } else {
              const resolved = await resolveAuthor(authorToken);
              if (resolved.pubkeyHex) {
                resolvedPubkeys.push(resolved.pubkeyHex);
              }
            }
          } catch (error) {
            console.warn(`Failed to resolve author ${authorToken}:`, error);
          }
        }
        
        if (resolvedPubkeys.length > 0) {
          // Build single filter with all authors
          const baseQuery = firstNonBy || '';
          const { applySimpleReplacements } = await import('./search/replacements');
          const preprocessed = await applySimpleReplacements(baseQuery);
          const tagMatches = Array.from(preprocessed.match(/#[A-Za-z0-9_]+/gi) || []).map((t) => t.slice(1).toLowerCase());
          
          const filter: NDKFilter = applyDateFilter({
            kinds: effectiveKinds,
            authors: resolvedPubkeys,
            limit: Math.max(limit, 500),
            ...(tagMatches.length > 0 && { '#t': Array.from(new Set(tagMatches)) })
          }, dateFilter) as NDKFilter;
          
          // Extract residual search text
          const residual = preprocessed
            .replace(/\bkind:[^\s]+/gi, ' ')
            .replace(/\bkinds:[^\s]+/gi, ' ')
            .replace(/#[A-Za-z0-9_]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          
          if (residual.length > 0) {
            filter.search = nip50Extensions 
              ? buildSearchQueryWithExtensions(residual, nip50Extensions)
              : residual;
          }
          
          const results = await subscribeAndCollect(filter, 10000, chosenRelaySet, abortSignal);
          return sortEventsNewestFirst(results).slice(0, limit);
        }
      }

      // Check for combined hashtag + author OR patterns like:
      // "(#yestr OR #nostr) (by:dergigi OR by:IntuitiveGuy)"
      const extractTags = (s: string): string[] => {
        const matches = Array.from(s.matchAll(/#[A-Za-z0-9_]+/gi));
        return matches.map((m) => (m[0] || '').slice(1).toLowerCase()).filter(Boolean);
      };

      const extractCoreWithoutByAndTags = (s: string): string => {
        return s
          .replace(/\bby:\S+/gi, '')
          .replace(/#[A-Za-z0-9_]+/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      };

      const baseCore = extractCoreWithoutByAndTags(expandedSeeds[0]);
      const allSameCore = expandedSeeds.every((seed) => extractCoreWithoutByAndTags(seed) === baseCore);
      const allHaveTagAndBy = expandedSeeds.every((seed) => extractTags(seed).length > 0 && extractByTokens(seed).length > 0);

      if (allSameCore && allHaveTagAndBy) {
        const allTags = new Set<string>();
        const allByTokens: string[] = [];
        for (const seed of expandedSeeds) {
          extractTags(seed).forEach((t) => allTags.add(t));
          allByTokens.push(...extractByTokens(seed));
        }

        const uniqueByTokens = Array.from(new Set(allByTokens));

        // Resolve all authors to pubkeys
        const resolvedPubkeys: string[] = [];
        for (const authorToken of uniqueByTokens) {
          try {
            if (/^npub1[0-9a-z]+$/i.test(authorToken)) {
              const hex = nip19.decode(authorToken).data as string;
              resolvedPubkeys.push(hex);
            } else {
              const resolved = await resolveAuthor(authorToken);
              if (resolved.pubkeyHex) {
                resolvedPubkeys.push(resolved.pubkeyHex);
              }
            }
          } catch (error) {
            console.warn(`Failed to resolve author ${authorToken}:`, error);
          }
        }

        if (resolvedPubkeys.length > 0 && allTags.size > 0) {
          const { applySimpleReplacements } = await import('./search/replacements');
          const baseQuery = baseCore || '';
          const preprocessed = await applySimpleReplacements(baseQuery);

          const filter: NDKFilter = applyDateFilter({
            kinds: effectiveKinds,
            authors: resolvedPubkeys,
            '#t': Array.from(allTags),
            limit: Math.max(limit, 500)
          }, dateFilter) as NDKFilter;

          const residualRaw = preprocessed
            .replace(/\bkind:[^\s]+/gi, ' ')
            .replace(/\bkinds:[^\s]+/gi, ' ')
            .replace(/#[A-Za-z0-9_]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          const residual = normalizeResidualSearchText(residualRaw);

          if (residual.length > 0) {
            filter.search = nip50Extensions
              ? buildSearchQueryWithExtensions(residual, nip50Extensions)
              : residual;
          }

          const results = await subscribeAndCollect(filter, 10000, chosenRelaySet, abortSignal);
          return sortEventsNewestFirst(results).slice(0, limit);
        }
      }

      const translatedSeeds = expandedSeeds
        .map((seed) => {
          const existingKind = extractKindFilter(seed);
          if (existingKind.kinds && existingKind.kinds.length > 0) {
            return seed;
          }
          const kindTokens = effectiveKinds.map((k) => `kind:${k}`).join(' ');
          return kindTokens ? `${kindTokens} ${seed}`.trim() : seed;
        });


      const seedResults = await searchByAnyTerms(
        translatedSeeds,
        Math.max(limit, 500),
        chosenRelaySet,
        abortSignal,
        nip50Extensions,
        applyDateFilter({ kinds: effectiveKinds }, dateFilter),
        () => getBroadRelaySet()
      );
      
      
      return sortEventsNewestFirst(seedResults).slice(0, limit);
    }
  }

  // EARLY: Author filter handling (resolve by:<author> to npub and use authors[] filter)
  if (!hasTopLevelOr) {
    const earlyAuthorResults = await tryHandleAuthorSearch(cleanedQuery, searchContext);
    if (earlyAuthorResults) return earlyAuthorResults;
  }

  // (Already expanded above)

  // Check for top-level OR operator (outside parentheses)
  if (hasTopLevelOr) {
    const normalizedParts = topLevelOrParts
      .map((part) => part.trim())
      .filter(Boolean)
      .reduce<string[]>((acc, part) => {
        const expanded = expandParenthesizedOr(part);
        const treatAsGroup = expanded.length > 1;
        const seeds = treatAsGroup ? expanded : [part];
        seeds.forEach((seed) => {
          const trimmedSeed = seed.trim();
          if (!trimmedSeed) return;
          const seedKind = extractKindFilter(trimmedSeed);
          if (seedKind.kinds && seedKind.kinds.length > 0) {
            acc.push(trimmedSeed);
            return;
          }
          if (/\bby:\S+/i.test(trimmedSeed)) {
            acc.push(trimmedSeed);
            return;
          }
          if (/#\w+/i.test(trimmedSeed)) {
            acc.push(trimmedSeed);
            return;
          }
          acc.push(trimmedSeed);
        });
        return acc;
      }, []);


    // If all OR parts are p:<term>, do profile full-text search across parts
    const isPClause = (s: string) => /^p:\S+/i.test(s);
    const allPClauses = normalizedParts.length > 0 && normalizedParts.every(isPClause);
    if (allPClauses) {
      const pTerms = normalizedParts.map((s) => s.replace(/^p:/i, '').trim()).filter(Boolean);
      const mergedProfiles: NDKEvent[] = [];
      const seenPubkeys = new Set<string>();
      for (const term of pTerms) {
        try {
          const profiles = await searchProfilesFullText(term);
          for (const evt of profiles) {
            const pk = evt.pubkey || evt.author?.pubkey || '';
            if (pk && !seenPubkeys.has(pk)) {
              seenPubkeys.add(pk);
              mergedProfiles.push(evt);
            }
          }
        } catch {}
      }
      return sortEventsNewestFirst(mergedProfiles).slice(0, limit);
    }

    let orResults = await searchByAnyTerms(
      normalizedParts,
      Math.max(limit, 500),
      chosenRelaySet,
      abortSignal,
      nip50Extensions,
      applyDateFilter({ kinds: effectiveKinds }, dateFilter),
      () => getBroadRelaySet()
    );
    
    // If we got no results and we're using NIP-50 relays, try with broader relay set
    if (orResults.length === 0 && !relaySetOverride) {
      const broadRelaySet = await getBroadRelaySet();
      orResults = await searchByAnyTerms(normalizedParts, Math.max(limit, 500), broadRelaySet, abortSignal, nip50Extensions, applyDateFilter({ kinds: effectiveKinds }, dateFilter));
    }
    
    const filteredResults = orResults.filter((evt) => effectiveKinds.length === 0 || effectiveKinds.includes(evt.kind));
    return sortEventsNewestFirst(filteredResults).slice(0, limit);
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
    
    results = isStreaming 
      ? await subscribeAndStream(searchFilter, {
          timeoutMs: streamingOptions?.timeoutMs || 30000,
          maxResults: streamingOptions?.maxResults || 1000,
          onResults: streamingOptions?.onResults,
          relaySet: chosenRelaySet,
          abortSignal
        })
      : await subscribeAndCollect(searchFilter, 8000, chosenRelaySet, abortSignal);
    // Enforce AND: must match text and contain requested media
    const filtered = results.filter((e, idx, arr) => {
      // dedupe by id while mapping
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

