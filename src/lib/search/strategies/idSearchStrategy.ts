import { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { subscribeAndCollect } from '../subscriptions';
import { getBroadRelaySet } from '../relayManagement';
import { sortEventsNewestFirst } from '../../utils/searchUtils';
import { SearchContext } from '../types';

/**
 * Resolve an id: token to a hex event ID.
 * Accepts: hex event IDs, note1... bech32, nevent1... bech32.
 */
function resolveEventId(token: string): string | null {
  if (/^[0-9a-f]{64}$/i.test(token)) return token.toLowerCase();

  try {
    const decoded = nip19.decode(token);
    if (decoded.type === 'note') return decoded.data;
    if (decoded.type === 'nevent') return decoded.data.id;
  } catch {}

  return null;
}

/**
 * Handle id: filter queries (id:<event-id>)
 * Fetches specific events by their ID.
 * Supports multiple id: tokens. Any non-id: residual text is ignored
 * (id: is a direct lookup, not a search).
 * Returns null if the query does not contain id: tokens.
 */
export async function tryHandleIdSearch(
  cleanedQuery: string,
  context: SearchContext
): Promise<NDKEvent[] | null> {
  const { abortSignal, limit } = context;

  const idMatches = Array.from(cleanedQuery.matchAll(/\bid:(\S+)/gi));
  if (idMatches.length === 0) return null;

  const tokens = Array.from(new Set(idMatches.map((m) => m[1]).filter(Boolean)));
  const eventIds = tokens.map(resolveEventId).filter(Boolean) as string[];
  if (eventIds.length === 0) return [];

  const filter: NDKFilter = { ids: eventIds };
  const relaySet = await getBroadRelaySet();

  let results: NDKEvent[];
  try {
    results = await subscribeAndCollect(filter, 10000, relaySet, abortSignal);
  } catch {
    results = [];
  }

  const dedupe = new Map<string, NDKEvent>();
  for (const e of results) if (!dedupe.has(e.id)) dedupe.set(e.id, e);

  return sortEventsNewestFirst(Array.from(dedupe.values())).slice(0, limit);
}
