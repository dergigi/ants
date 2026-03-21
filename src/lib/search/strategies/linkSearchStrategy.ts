import { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import { applyDateFilter } from '../queryParsing';
import { buildSearchQueryWithExtensions } from '../searchUtils';
import { subscribeAndCollect } from '../subscriptions';
import { getBroadRelaySet } from '../relayManagement';
import { sortEventsNewestFirst } from '../../utils/searchUtils';
import { SearchContext } from '../types';

type TagRFilter = NDKFilter & { '#r'?: string[] };

/**
 * Handle link: filter queries (link:<url>)
 * Finds events that reference a specific URL via #r tags.
 * Supports multiple link: tokens and optional search terms.
 * Returns null if the query does not contain link: tokens.
 */
export async function tryHandleLinkSearch(
  cleanedQuery: string,
  context: SearchContext
): Promise<NDKEvent[] | null> {
  const { effectiveKinds, dateFilter, nip50Extensions, chosenRelaySet, abortSignal, limit } = context;

  const linkMatches = Array.from(cleanedQuery.matchAll(/\blink:(\S+)/gi));
  if (linkMatches.length === 0) return null;

  const urls = Array.from(new Set(linkMatches.map((m) => m[1]).filter(Boolean)));
  if (urls.length === 0) return [];

  const residual = cleanedQuery.replace(/\blink:\S+/gi, '').replace(/\s+/g, ' ').trim();

  const filter: TagRFilter = applyDateFilter({
    kinds: effectiveKinds,
    '#r': urls,
    limit: Math.max(limit, 500)
  }, dateFilter) as TagRFilter;

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
