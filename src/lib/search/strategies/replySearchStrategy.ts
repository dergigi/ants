import { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { applyDateFilter } from '../queryParsing';
import { buildSearchQueryWithExtensions } from '../searchUtils';
import { subscribeAndCollect } from '../subscriptions';
import { getBroadRelaySet } from '../relayManagement';
import { sortEventsNewestFirst } from '../../utils/searchUtils';
import { SearchContext } from '../types';

type TagEFilter = NDKFilter & { '#e'?: string[] };

/**
 * Resolve a reply: token to a hex event ID.
 * Accepts: hex event IDs, note1... bech32, nevent1... bech32.
 */
function resolveEventId(token: string): string | null {
  // Already hex (64 chars)
  if (/^[0-9a-f]{64}$/i.test(token)) return token.toLowerCase();

  // Bech32 note or nevent
  try {
    const decoded = nip19.decode(token);
    if (decoded.type === 'note') return decoded.data;
    if (decoded.type === 'nevent') return decoded.data.id;
  } catch {}

  return null;
}

/**
 * Handle reply: filter queries (reply:<event-id>)
 * Finds events that reference a specific event via #e tags.
 * Supports multiple reply: tokens and optional search terms.
 * Returns null if the query does not contain reply: tokens.
 */
export async function tryHandleReplySearch(
  cleanedQuery: string,
  context: SearchContext
): Promise<NDKEvent[] | null> {
  const { effectiveKinds, dateFilter, nip50Extensions, chosenRelaySet, abortSignal, limit } = context;

  const replyMatches = Array.from(cleanedQuery.matchAll(/\breply:(\S+)/gi));
  if (replyMatches.length === 0) return null;

  const tokens = Array.from(new Set(replyMatches.map((m) => m[1]).filter(Boolean)));
  const eventIds = tokens.map(resolveEventId).filter(Boolean) as string[];
  if (eventIds.length === 0) return [];

  const residual = cleanedQuery.replace(/\breply:\S+/gi, '').replace(/\s+/g, ' ').trim();

  const filter: TagEFilter = applyDateFilter({
    kinds: effectiveKinds,
    '#e': eventIds,
    limit: Math.max(limit, 500)
  }, dateFilter) as TagEFilter;

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
