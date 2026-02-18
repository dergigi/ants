import { NDKEvent, NDKFilter, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { resolveAuthor } from '../vertex';
import { SEARCH_DEFAULT_KINDS } from '../constants';
import { Nip50Extensions, buildSearchQueryWithExtensions } from './searchUtils';
import { extractKindFilter, normalizeResidualSearchText } from './queryParsing';
import { subscribeAndCollect } from './subscriptions';

// Max concurrent term searches to avoid overwhelming relays
const MAX_CONCURRENT_TERMS = 8;

/**
 * Search for events matching any of the provided terms (OR logic)
 * Each term is processed independently and results are merged.
 * Concurrency is capped at MAX_CONCURRENT_TERMS to avoid excessive simultaneous subscriptions.
 */
export async function searchByAnyTerms(
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

  // Lazily resolve fallback relay set once (only if a term actually needs it).
  // The resolved promise is shared across all parallel tasks to avoid races.
  let fallbackPromise: Promise<NDKRelaySet | null> | null = null;
  const ensureFallbackRelaySet = (): Promise<NDKRelaySet | null> => {
    if (!fallbackRelaySetFactory) return Promise.resolve(null);
    if (!fallbackPromise) {
      fallbackPromise = fallbackRelaySetFactory().catch((error) => {
        console.warn('Failed to create fallback relay set:', error);
        return null;
      });
    }
    return fallbackPromise;
  };

  // Process terms in batches to cap concurrency
  const processTerm = async (term: string): Promise<NDKEvent[]> => {
      // Check abort before starting each term
      if (abortSignal?.aborted) return [];

      const normalizedTerm = term.replace(/by:\s*(#\w+)/gi, (_m, tag: string) => tag);
      const hasLogicalOperators = /\b(OR|AND)\b|"|\(|\)/i.test(normalizedTerm);
      const tagMatches = Array.from(normalizedTerm.match(/#[A-Za-z0-9_]+/gi) || []).map((t) => t.slice(1).toLowerCase());
      const byMatches = Array.from(normalizedTerm.match(/\bby:(\S+)/gi) || []).map((t) => t.slice(3));

      // Apply simple replacements to expand is: patterns to kind: patterns
      const { applySimpleReplacements } = await import('./replacements');
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
          return [];
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
      const targetRelaySet = needsNip50 ? relaySet : ((await ensureFallbackRelaySet()) || relaySet);

      try {
        return await subscribeAndCollect(filter, 10000, targetRelaySet, abortSignal);
      } catch (error) {
        console.warn(`Search failed for term "${normalizedTerm}":`, error);
        return [];
      }
  };

  // Process in batches of MAX_CONCURRENT_TERMS
  for (let i = 0; i < terms.length; i += MAX_CONCURRENT_TERMS) {
    if (abortSignal?.aborted) break;
    const batch = terms.slice(i, i + MAX_CONCURRENT_TERMS);
    const batchResults = await Promise.allSettled(batch.map(processTerm));
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        for (const evt of result.value) {
          if (!seen.has(evt.id)) { seen.add(evt.id); merged.push(evt); }
        }
      }
    }
  }

  return merged;
}

