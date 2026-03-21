import { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import { applyDateFilter } from '../queryParsing';
import { SearchContext } from '../types';
import { fetchDedupeAndSort, parseResidual } from './strategyUtils';

type TagRFilter = NDKFilter & { '#r'?: string[] };

/**
 * Handle link: filter queries (link:<url>)
 * Finds events that reference a specific URL via #r tags.
 * Supports combining with by: and search terms.
 * Returns null if the query does not contain link: tokens.
 */
export async function tryHandleLinkSearch(
  cleanedQuery: string,
  context: SearchContext
): Promise<NDKEvent[] | null> {
  const { effectiveKinds, dateFilter, nip50Extensions, chosenRelaySet, abortSignal, limit } = context;

  const matches = Array.from(cleanedQuery.matchAll(/\blink:(\S+)/gi));
  if (matches.length === 0) return null;

  const urls = Array.from(new Set(matches.map((m) => m[1]).filter(Boolean)));
  if (urls.length === 0) return [];

  const residual = cleanedQuery.replace(/\blink:\S+/gi, '').replace(/\s+/g, ' ').trim();
  const { authors, search } = await parseResidual(residual, nip50Extensions);

  const filter: TagRFilter = applyDateFilter({
    kinds: effectiveKinds, '#r': urls, limit: Math.max(limit, 500),
    ...(authors && { authors }),
  }, dateFilter) as TagRFilter;

  if (search) (filter as NDKFilter).search = search;

  return fetchDedupeAndSort(filter, chosenRelaySet, Boolean(search), abortSignal, limit);
}
