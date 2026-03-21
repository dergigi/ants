import { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import { applyDateFilter } from '../queryParsing';
import { buildSearchQueryWithExtensions } from '../searchUtils';
import { subscribeAndCollect } from '../subscriptions';
import { getBroadRelaySet } from '../relayManagement';
import { sortEventsNewestFirst } from '../../utils/searchUtils';
import { SearchContext } from '../types';

type TagDFilter = NDKFilter & { '#d'?: string[] };

/**
 * Handle d: filter queries (d:<identifier>)
 * Finds replaceable events by their d-tag identifier.
 * Supports multiple d: tokens and optional search terms.
 * Returns null if the query does not contain d: tokens.
 */
export async function tryHandleDTagSearch(
  cleanedQuery: string,
  context: SearchContext
): Promise<NDKEvent[] | null> {
  const { effectiveKinds, dateFilter, nip50Extensions, chosenRelaySet, abortSignal, limit } = context;

  const dMatches = Array.from(cleanedQuery.matchAll(/\bd:(\S+)/gi));
  if (dMatches.length === 0) return null;

  const identifiers = Array.from(new Set(dMatches.map((m) => m[1]).filter(Boolean)));
  if (identifiers.length === 0) return [];

  const residual = cleanedQuery.replace(/\bd:\S+/gi, '').replace(/\s+/g, ' ').trim();

  const filter: TagDFilter = applyDateFilter({
    kinds: effectiveKinds,
    '#d': identifiers,
    limit: Math.max(limit, 500)
  }, dateFilter) as TagDFilter;

  if (residual) {
    (filter as NDKFilter).search = nip50Extensions
      ? buildSearchQueryWithExtensions(residual, nip50Extensions)
      : residual;
  }

  const hasSearchTerm = Boolean((filter as NDKFilter).search);
  const relaySet = hasSearchTerm ? chosenRelaySet : await getBroadRelaySet();

  let results: NDKEvent[];
  try {
    results = await subscribeAndCollect(filter, 10000, relaySet, abortSignal);
  } catch {
    results = await subscribeAndCollect(filter, 10000, chosenRelaySet, abortSignal);
  }

  const dedupe = new Map<string, NDKEvent>();
  for (const e of results) if (!dedupe.has(e.id)) dedupe.set(e.id, e);

  return sortEventsNewestFirst(Array.from(dedupe.values())).slice(0, limit);
}
