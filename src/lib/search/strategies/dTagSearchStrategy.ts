import { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import { applyDateFilter } from '../queryParsing';
import { buildSearchQueryWithExtensions } from '../searchUtils';
import { SearchContext } from '../types';
import { fetchDedupeAndSort } from './strategyUtils';

type TagDFilter = NDKFilter & { '#d'?: string[] };

/**
 * Handle d: filter queries (d:<identifier>)
 * Finds replaceable events by their d-tag identifier.
 * Returns null if the query does not contain d: tokens.
 */
export async function tryHandleDTagSearch(
  cleanedQuery: string,
  context: SearchContext
): Promise<NDKEvent[] | null> {
  const { effectiveKinds, dateFilter, nip50Extensions, chosenRelaySet, abortSignal, limit } = context;

  const matches = Array.from(cleanedQuery.matchAll(/\bd:(\S+)/gi));
  if (matches.length === 0) return null;

  const identifiers = Array.from(new Set(matches.map((m) => m[1]).filter(Boolean)));
  if (identifiers.length === 0) return [];

  const residual = cleanedQuery.replace(/\bd:\S+/gi, '').replace(/\s+/g, ' ').trim();

  const filter: TagDFilter = applyDateFilter({
    kinds: effectiveKinds, '#d': identifiers, limit: Math.max(limit, 500)
  }, dateFilter) as TagDFilter;

  if (residual) {
    (filter as NDKFilter).search = nip50Extensions
      ? buildSearchQueryWithExtensions(residual, nip50Extensions) : residual;
  }

  return fetchDedupeAndSort(filter, chosenRelaySet, Boolean((filter as NDKFilter).search), abortSignal, limit);
}
