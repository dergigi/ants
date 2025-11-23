import { NDKEvent, NDKFilter, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { resolveAuthor } from '../vertex';
import { SEARCH_DEFAULT_KINDS } from '../constants';
import { Nip50Extensions, buildSearchQueryWithExtensions } from './searchUtils';
import { extractKindFilter, normalizeResidualSearchText } from './queryParsing';
import { subscribeAndCollect } from './subscriptions';

/**
 * Search for events matching any of the provided terms (OR logic)
 * Each term is processed independently and results are merged
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

