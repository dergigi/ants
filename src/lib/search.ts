import { NDKEvent, NDKFilter, NDKRelaySet, NDKSubscriptionCacheUsage, NDKRelay } from '@nostr-dev-kit/ndk';
import { ndk, connectWithTimeout, markRelayActivity, safeSubscribe, isValidFilter, resetLastReducedFilters } from './ndk';
import { searchProfilesFullText, resolveNip05ToPubkey, profileEventFromPubkey, resolveAuthor } from './vertex';
import { nip19 } from 'nostr-tools';
import { RELAYS, getNip50SearchRelaySet } from './relays';
import { normalizeRelayUrl } from './urlUtils';
import { trackEventRelay } from './eventRelayTracking';
import { SEARCH_DEFAULT_KINDS } from './constants';

// Import shared utilities
import { 
  Nip50Extensions, 
  buildSearchQueryWithExtensions
} from './search/searchUtils';
import { sortEventsNewestFirst } from './utils/searchUtils';

// Import query parsing utilities
import {
  extractNip50Extensions,
  stripRelayFilters,
  extractKindFilter,
  extractDateFilter,
  applyDateFilter,
  normalizeResidualSearchText
} from './search/queryParsing';

// Import query transformation utilities
import {
  parseOrQuery,
  expandParenthesizedOr
} from './search/queryTransforms';

// Import identifier lookup utilities
import {
  isNpub,
  getPubkey,
  searchByNip19Identifier
} from './search/idLookup';

// Import relay management utilities
import {
  getSearchRelaySet,
  getBroadRelaySet
} from './search/relayManagement';

// Note: We no longer inject properties into NDKEvent objects
// Instead, we use the eventRelayTracking system to track relay sources


// Extend filter type to include tag queries for "t" (hashtags) and "a" (replaceable events)
type TagTFilter = NDKFilter & { '#t'?: string[]; '#a'?: string[] };



// Centralized media extension lists (keep DRY)
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'gifs', 'apng', 'webp', 'avif', 'svg'] as const;
export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogg', 'ogv', 'mov', 'm4v'] as const;
export const GIF_EXTENSIONS = ['gif', 'gifs', 'apng'] as const;


// (Removed heuristic content filter; rely on recursive OR expansion + relay-side search)


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

async function searchByAnyTerms(
  terms: string[],
  limit: number,
  relaySet: NDKRelaySet,
  abortSignal?: AbortSignal,
  nip50Extensions?: Nip50Extensions,
  baseFilter?: Partial<NDKFilter>,
  fallbackRelaySetFactory?: () => Promise<NDKRelaySet>
): Promise<NDKEvent[]> {
  const seen = new Set<string>();
  const merged: NDKEvent[] = [];
  let fallbackRelaySet: NDKRelaySet | null = null;

  const ensureFallbackRelaySet = async (): Promise<NDKRelaySet | null> => {
    if (!fallbackRelaySetFactory) return null;
    if (!fallbackRelaySet) {
      try {
        fallbackRelaySet = await fallbackRelaySetFactory();
      } catch (error) {
        console.warn('Failed to create fallback relay set:', error);
        return null;
      }
    }
    return fallbackRelaySet;
  };

  for (const term of terms) {
    try {
      const normalizedTerm = term.replace(/by:\s*(#\w+)/gi, (_m, tag: string) => tag);
      const hasLogicalOperators = /\b(OR|AND)\b|"|\(|\)/i.test(normalizedTerm);
      const tagMatches = Array.from(normalizedTerm.match(/#[A-Za-z0-9_]+/gi) || []).map((t) => t.slice(1).toLowerCase());
      const byMatches = Array.from(normalizedTerm.match(/\bby:(\S+)/gi) || []).map((t) => t.slice(3));

      // Apply simple replacements to expand is: patterns to kind: patterns
      const { applySimpleReplacements } = await import('./search/replacements');
      const preprocessedTerm = await applySimpleReplacements(normalizedTerm);
      const kindExtraction = extractKindFilter(preprocessedTerm);
      const baseKinds = baseFilter?.kinds;
      const effectiveKinds = (kindExtraction.kinds && kindExtraction.kinds.length > 0)
        ? kindExtraction.kinds
        : tagMatches.length > 0
          ? SEARCH_DEFAULT_KINDS
          : (baseKinds && baseKinds.length > 0 ? baseKinds : SEARCH_DEFAULT_KINDS);

      const filterBase = baseFilter ? { ...baseFilter } : {};
      const filter: NDKFilter = {
        ...filterBase,
        kinds: effectiveKinds,
        limit: Math.max(limit, 200)
      };

      if (tagMatches.length > 0) {
        filter['#t'] = Array.from(new Set(tagMatches.map((tag) => tag.toLowerCase())));
      }

      if (byMatches.length > 0) {
        const authors: string[] = [];
        const resolvedAuthors: string[] = [];
        
        for (const author of byMatches) {
          if (/^npub1[0-9a-z]+$/i.test(author)) {
            authors.push(author);
            resolvedAuthors.push(author);
          } else {
            try {
              const resolved = await resolveAuthor(author);
              if (resolved.pubkeyHex) {
                const npub = nip19.npubEncode(resolved.pubkeyHex);
                authors.push(npub);
                resolvedAuthors.push(npub);
              } else {
                console.warn(`Failed to resolve author: ${author}`);
              }
            } catch (error) {
              console.warn(`Error resolving author ${author}:`, error);
            }
          }
        }
        
        // Only skip if we couldn't resolve ANY authors
        if (authors.length === 0) {
          console.warn(`No authors could be resolved for term: ${normalizedTerm}`);
          continue;
        }
        
        // Log which authors were resolved vs which failed
        if (resolvedAuthors.length < byMatches.length) {
          const failedAuthors = byMatches.filter(author => !resolvedAuthors.includes(author));
          console.warn(`Some authors failed to resolve: ${failedAuthors.join(', ')}`);
        }
        
        filter.authors = Array.from(new Set(authors.map((a) => nip19.decode(a).data as string)));
      }
      const residualRaw = preprocessedTerm
        .replace(/\bkind:[^\s]+/gi, ' ')
        .replace(/\bkinds:[^\s]+/gi, ' ')
        .replace(/\bby:[^\s]+/gi, ' ')
        .replace(/\ba:[^\s]+/gi, ' ')
        .replace(/\bsince:[^\s]+/gi, ' ')
        .replace(/\buntil:[^\s]+/gi, ' ')
        .replace(/#[A-Za-z0-9_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const residual = normalizeResidualSearchText(residualRaw);
      const needsFullTextSearch = hasLogicalOperators || residual.length > 0;
      const searchBasis = residual;
      const searchQuery = needsFullTextSearch && searchBasis.length > 0
        ? (nip50Extensions ? buildSearchQueryWithExtensions(searchBasis, nip50Extensions) : searchBasis)
        : undefined;

      if (searchQuery) {
        filter.search = searchQuery;
      }

      const needsNip50 = Boolean(filter.search);

      const selectRelaySet = async (): Promise<NDKRelaySet> => {
        if (needsNip50) return relaySet;
        const fallback = await ensureFallbackRelaySet();
        return fallback || relaySet;
      };

      try {
        const targetRelaySet = await selectRelaySet();
        const res = await subscribeAndCollect(filter, 10000, targetRelaySet, abortSignal);
        for (const evt of res) {
          if (!seen.has(evt.id)) { seen.add(evt.id); merged.push(evt); }
        }
      } catch (error) {
        console.warn(`Search failed for term "${normalizedTerm}":`, error);
        // Continue with other terms even if one fails
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

// Re-export getUserRelayUrls for backwards compatibility
export { getUserRelayUrls } from './search/relayManagement';



// Re-export query transformation utilities for backwards compatibility
export { parseOrQuery, expandParenthesizedOr } from './search/queryTransforms';

// Streaming search options
interface StreamingSearchOptions {
  exact?: boolean;
  streaming?: boolean;
  maxResults?: number;
  timeoutMs?: number;
  onResults?: (results: NDKEvent[], isComplete: boolean) => void;
}

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
  
  // Extract kind filters and default to SEARCH_DEFAULT_KINDS when not provided
  const kindExtraction = extractKindFilter(preprocessedQuery);
  const kindCleanedQuery = kindExtraction.cleaned;
  const effectiveKinds: number[] = (kindExtraction.kinds && kindExtraction.kinds.length > 0)
    ? kindExtraction.kinds
    : SEARCH_DEFAULT_KINDS; // Default to richly rendered kinds when no kind filter is specified
  
  // Extract date filters
  const dateExtraction = extractDateFilter(kindCleanedQuery);
  const dateFilter = { since: dateExtraction.since, until: dateExtraction.until };
  const cleanedQuery = dateExtraction.cleaned;
  
  const extensionFilters: Array<(content: string) => boolean> = [];
  const topLevelOrParts = parseOrQuery(cleanedQuery);
  const hasTopLevelOr = topLevelOrParts.length > 1;

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
    const earlyAuthorMatch = (!hasTopLevelOr && !cleanedQuery.includes('('))
      ? cleanedQuery.match(/(?:^|\s)by:(\S+)(?:\s|$)/i)
      : null;
    if (earlyAuthorMatch) {
      const [, author] = earlyAuthorMatch;
      const terms = cleanedQuery.replace(/(?:^|\s)by:(\S+)(?:\s|$)/i, '').trim();

      let pubkey: string | null = null;
      try {
        const resolved = await resolveAuthor(author);
        pubkey = resolved.pubkeyHex;
      } catch {}

      if (!pubkey) {
        return [];
        return [];
      }

      if (!terms) {
        let res = await subscribeAndCollect(applyDateFilter({ kinds: effectiveKinds, authors: [pubkey], limit: Math.max(limit, 200) }, dateFilter) as NDKFilter, 8000, chosenRelaySet, abortSignal);
        if (res.length === 0) {
          const broadRelays = Array.from(new Set<string>([...RELAYS.DEFAULT, ...RELAYS.SEARCH]));
          const broadRelaySet = NDKRelaySet.fromRelayUrls(broadRelays, ndk);
          res = await subscribeAndCollect(applyDateFilter({ kinds: effectiveKinds, authors: [pubkey], limit: Math.max(limit, 200) }, dateFilter) as NDKFilter, 10000, broadRelaySet, abortSignal);
        }
        const dedupe = new Map<string, NDKEvent>();
        for (const e of res) { if (!dedupe.has(e.id)) dedupe.set(e.id, e); }
        return sortEventsNewestFirst(Array.from(dedupe.values())).slice(0, limit);
      }

      const seeds = expandParenthesizedOr(terms);
      const filters: Partial<NDKFilter> = { kinds: effectiveKinds, authors: [pubkey] };
      let res = await searchByAnyTerms(
        seeds,
        Math.max(limit, 500),
        chosenRelaySet,
        abortSignal,
        nip50Extensions,
        applyDateFilter(filters, dateFilter),
        () => getBroadRelaySet()
      );

      if (res.length === 0) {
        const broadRelays = Array.from(new Set<string>([...RELAYS.DEFAULT, ...RELAYS.SEARCH]));
        const broadRelaySet = NDKRelaySet.fromRelayUrls(broadRelays, ndk);
        const authorOnlyFilter: NDKFilter = applyDateFilter({ kinds: effectiveKinds, authors: [pubkey], limit: Math.max(limit, 600) }, dateFilter) as NDKFilter;
        let authorOnly = await subscribeAndCollect(authorOnlyFilter, 10000, broadRelaySet, abortSignal);
        const trimmed = terms.trim();
        if (trimmed) {
          const needle = trimmed.toLowerCase();
          authorOnly = authorOnly.filter((e) => (e.content || '').toLowerCase().includes(needle));
        }
        res = authorOnly;
      }

      const dedupe = new Map<string, NDKEvent>();
      for (const e of res) { if (!dedupe.has(e.id)) dedupe.set(e.id, e); }
      return sortEventsNewestFirst(Array.from(dedupe.values())).slice(0, limit);
    }
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

  // URL search: strip protocol and search for domain/path content
  try {
    const url = new URL(cleanedQuery);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      const { searchUrlEvents } = await import('./search/urlSearch');
      return await searchUrlEvents(
        cleanedQuery,
        effectiveKinds,
        nip50Extensions,
        limit,
        isStreaming || false,
        streamingOptions,
        chosenRelaySet,
        abortSignal
      );
    }
  } catch {}

  // nevent/note/naddr bech32: fetch by NIP-19 identifier
  const nip19Results = await searchByNip19Identifier(extCleanedQuery, abortSignal, getSearchRelaySet);
  if (nip19Results.length > 0) return nip19Results;

  // Pure hashtag search: use tag-based filter across broad relay set (no NIP-50 required)
  const hashtagMatches = cleanedQuery.match(/#[A-Za-z0-9_]+/g) || [];
  const nonHashtagRemainder = cleanedQuery.replace(/#[A-Za-z0-9_]+/g, '').trim();
  // Handle license:VALUE-only queries via direct tag subscription (#license)
  {
    const licenseMatches = Array.from(cleanedQuery.match(/\blicense:([^\s)]+)\b/gi) || []).map((m) => m.split(':')[1]?.trim()).filter(Boolean) as string[];
    const nonLicenseRemainder = cleanedQuery.replace(/\blicense:[^\s)]+/gi, '').trim();
    if (licenseMatches.length > 0 && nonLicenseRemainder.length === 0) {
      const licenses = Array.from(new Set(licenseMatches.map((v) => v.toUpperCase())));
      const licenseFilter: NDKFilter & { '#license'?: string[] } = applyDateFilter({ kinds: effectiveKinds, '#license': licenses, limit: Math.max(limit, 500) }, dateFilter) as NDKFilter & { '#license'?: string[] };
      const tagRelaySet = await getBroadRelaySet();
      const results = isStreaming
        ? await subscribeAndStream(licenseFilter, {
            timeoutMs: streamingOptions?.timeoutMs || 30000,
            maxResults: streamingOptions?.maxResults || 1000,
            onResults: streamingOptions?.onResults,
            relaySet: tagRelaySet,
            abortSignal
          })
        : await subscribeAndCollect(licenseFilter, 10000, tagRelaySet, abortSignal);
      let final = results;
      if (extensionFilters.length > 0) {
        final = final.filter((e) => extensionFilters.every((f) => f(e.content || '')));
      }
      return sortEventsNewestFirst(final).slice(0, limit);
    }
  }

  if (hashtagMatches.length > 0 && nonHashtagRemainder.length === 0) {
    const tags = Array.from(new Set(hashtagMatches.map((h) => h.slice(1).toLowerCase())));
    const tagFilter: TagTFilter = applyDateFilter({ kinds: effectiveKinds, '#t': tags, limit: Math.max(limit, 500) }, dateFilter) as TagTFilter;

    // Use broader relay set for hashtag searches - include all available relays
    const tagRelaySet = await getBroadRelaySet();

    const results = isStreaming
      ? await subscribeAndStream(tagFilter, {
          timeoutMs: streamingOptions?.timeoutMs || 30000,
          maxResults: streamingOptions?.maxResults || 1000,
          onResults: streamingOptions?.onResults,
          relaySet: tagRelaySet,
          abortSignal
        })
      : await subscribeAndCollect(tagFilter, 10000, tagRelaySet, abortSignal);

    let final = results;
    if (extensionFilters.length > 0) {
      final = final.filter((e) => extensionFilters.every((f) => f(e.content || '')));
    }
    return sortEventsNewestFirst(final).slice(0, limit);
  }

  // Handle a: tag queries for replaceable events (e.g., a:30023:pubkey:d-tag)
  const aTagMatch = cleanedQuery.match(/^a:(.+)$/i);
  if (aTagMatch) {
    const aTagValue = (aTagMatch[1] || '').trim();
    if (aTagValue) {
      const aTagFilter: TagTFilter = applyDateFilter({ kinds: effectiveKinds, '#a': [aTagValue], limit: Math.max(limit, 500) }, dateFilter) as TagTFilter;
      
      // Use broader relay set for a tag searches
      const aTagRelaySet = await getBroadRelaySet();

      const results = isStreaming
        ? await subscribeAndStream(aTagFilter, {
            timeoutMs: streamingOptions?.timeoutMs || 30000,
            maxResults: streamingOptions?.maxResults || 1000,
            onResults: streamingOptions?.onResults,
            relaySet: aTagRelaySet,
            abortSignal
          })
        : await subscribeAndCollect(aTagFilter, 10000, aTagRelaySet, abortSignal);

      let final = results;
      if (extensionFilters.length > 0) {
        final = final.filter((e) => extensionFilters.every((f) => f(e.content || '')));
      }
      return sortEventsNewestFirst(final).slice(0, limit);
    }
  }

  // Full-text profile search `p:<term>` (not only username)
  // Also supports hex or npub directly to fetch that exact profile
  const fullProfileMatch = cleanedQuery.match(/^p:(.+)$/i);
  if (fullProfileMatch) {
    const term = (fullProfileMatch[1] || '').trim();
    if (!term) return [];
    // If term is an npub or 64-char hex, fetch the exact profile event
    if (/^npub1[0-9a-z]+$/i.test(term)) {
      try {
        const decoded = nip19.decode(term);
        if (decoded?.type === 'npub' && typeof decoded.data === 'string') {
          const evt = await profileEventFromPubkey(decoded.data);
          return evt ? [evt] : [];
        }
      } catch {}
    }
    if (/^[0-9a-fA-F]{64}$/.test(term)) {
      try {
        const evt = await profileEventFromPubkey(term.toLowerCase());
        return evt ? [evt] : [];
      } catch {}
    }
    // Otherwise, do a general full-text profile search
    try {
      const profiles = await searchProfilesFullText(term);
      return profiles;
    } catch (error) {
      console.warn('Full-text profile search failed:', error);
      return [];
    }
  }

  // Check if the query is a direct npub
  if (isNpub(cleanedQuery)) {
    try {
      const pubkey = getPubkey(cleanedQuery);
      if (!pubkey) return [];

      const res = await subscribeAndCollect(applyDateFilter({
        kinds: effectiveKinds,
        authors: [pubkey],
        limit: Math.max(limit, 200)
      }, dateFilter) as NDKFilter, 8000, chosenRelaySet, abortSignal);
      return sortEventsNewestFirst(res).slice(0, limit);
    } catch (error) {
      console.error('Error processing npub query:', error);
      return [];
    }
  }

  // NIP-05 resolution: '@name@domain' or 'domain.tld' or '@domain.tld'
  const nip05Like = cleanedQuery.match(/^@?([^\s@]+@[^\s@]+|[^\s@]+\.[^\s@]+)$/);
  if (nip05Like) {
    try {
      const pubkey = await resolveNip05ToPubkey(cleanedQuery);
      if (pubkey) {
        const profileEvt = await profileEventFromPubkey(pubkey);
        return [profileEvt];
      }
    } catch {}
  }

  // Check for author filter
  const authorMatch = cleanedQuery.match(/(?:^|\s)by:(\S+)(?:\s|$)/i);
  if (authorMatch) {
    const [, author] = authorMatch;
    // Extract search terms by removing the author filter
    const terms = cleanedQuery.replace(/(?:^|\s)by:(\S+)(?:\s|$)/i, '').trim();

    let pubkey: string | null = null;
    try {
      // Unified resolver handles npub, nip05, and username with a single DVM attempt
      const resolved = await resolveAuthor(author);
      pubkey = resolved.pubkeyHex;
    } catch (error) {
      console.error('Error resolving author:', error);
    }

    if (!pubkey) {
      return [];
      return [];
    }

    const filters: NDKFilter = applyDateFilter({
      kinds: effectiveKinds,
      authors: [pubkey],
      limit: Math.max(limit, 200)
    }, dateFilter) as NDKFilter;

    // Add search term to the filter if present
    if (terms) {
      const seedExpansions2 = expandParenthesizedOr(terms);
      if (seedExpansions2.length === 1) {
        filters.search = buildSearchQueryWithExtensions(terms, nip50Extensions);
        filters.limit = Math.max(limit, 200);
      }
    }

    // No additional post-filtering; use default limits

    {
      // Fetch by base terms if any, restricted to author
      let res: NDKEvent[] = [];
      if (terms) {
        const seedExpansions3 = expandParenthesizedOr(terms);
        if (seedExpansions3.length > 1) {
          const seen = new Set<string>();
          for (const seed of seedExpansions3) {
            try {
              const f: NDKFilter = applyDateFilter({ kinds: effectiveKinds, authors: [pubkey], search: buildSearchQueryWithExtensions(seed, nip50Extensions), limit: Math.max(limit, 200) }, dateFilter) as NDKFilter;
              const r = await subscribeAndCollect(f, 8000, chosenRelaySet, abortSignal);
              for (const e of r) { if (!seen.has(e.id)) { seen.add(e.id); res.push(e); } }
            } catch {}
          }
        } else {
          res = await subscribeAndCollect(filters, 8000, chosenRelaySet, abortSignal);
        }
      } else {
        res = await subscribeAndCollect(filters, 8000, chosenRelaySet, abortSignal);
      }

      // If the remaining terms contain parenthesized OR seeds like (a OR b), run a seeded OR search too
      const seedMatches = Array.from(terms.matchAll(/\(([^)]+\s+OR\s+[^)]+)\)/gi));
      const seedTerms: string[] = [];
      for (const m of seedMatches) {
        const inner = (m[1] || '').trim();
        if (!inner) continue;
        inner.split(/\s+OR\s+/i).forEach((t) => {
          const token = t.trim();
          if (token) seedTerms.push(token);
        });
      }
      if (seedTerms.length > 0) {
        try {
          const seeded = await searchByAnyTerms(
            seedTerms,
            limit,
            chosenRelaySet,
            abortSignal,
            nip50Extensions,
            applyDateFilter({ authors: [pubkey], kinds: effectiveKinds }, dateFilter),
            () => getBroadRelaySet()
          );
          res = [...res, ...seeded];
        } catch {}
      }
      // Fallback: if no results, try a broader relay set (default + search)
      const broadRelays = Array.from(new Set<string>([...RELAYS.DEFAULT, ...RELAYS.SEARCH]));
      const broadRelaySet = NDKRelaySet.fromRelayUrls(broadRelays, ndk);
      if (res.length === 0) {
        res = await subscribeAndCollect(filters, 10000, broadRelaySet, abortSignal);
      }
      // Additional fallback for very short terms (e.g., "GM") or stubborn empties:
      // some relays require >=3 chars for NIP-50 search; fetch author-only and filter client-side
      const termStr = terms.trim();
      const hasShortToken = termStr.length > 0 && termStr.split(/\s+/).some((t) => t.length < 3);
      if (res.length === 0 && termStr) {
        const authorOnly = await subscribeAndCollect(applyDateFilter({ kinds: effectiveKinds, authors: [pubkey], limit: Math.max(limit, 600) }, dateFilter) as NDKFilter, 10000, broadRelaySet, abortSignal);
        const needle = termStr.toLowerCase();
        res = authorOnly.filter((e) => (e.content || '').toLowerCase().includes(needle));
      } else if (res.length === 0 && hasShortToken) {
        const authorOnly = await subscribeAndCollect(applyDateFilter({ kinds: effectiveKinds, authors: [pubkey], limit: Math.max(limit, 600) }, dateFilter) as NDKFilter, 10000, broadRelaySet, abortSignal);
        const needle = termStr.toLowerCase();
        res = authorOnly.filter((e) => (e.content || '').toLowerCase().includes(needle));
      }
      let mergedResults: NDKEvent[] = res;
      // Dedupe
      const dedupe = new Map<string, NDKEvent>();
      for (const e of mergedResults) { if (!dedupe.has(e.id)) dedupe.set(e.id, e); }
      mergedResults = Array.from(dedupe.values());
      // Do not enforce additional client-side text match; rely on relay-side search
      const filtered = mergedResults;
      
      return sortEventsNewestFirst(filtered).slice(0, limit);
    }
  }
  
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
    streaming: true,
    onResults,
    maxResults: options.maxResults || 1000,
    timeoutMs: options.timeoutMs || 30000,
    exact: options.exact
  }, options.relaySetOverride, options.abortSignal);
} 