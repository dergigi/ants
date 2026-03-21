import { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { subscribeAndCollect } from '../subscriptions';
import { getBroadRelaySet } from '../relayManagement';
import { sortEventsNewestFirst } from '../../utils/searchUtils';

/** Resolve an id: token to a hex event ID (hex, note1..., nevent1...). */
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
 * Fetches specific events by their ID directly — no kind/date/relay pipeline.
 * Returns null if the query does not contain id: tokens.
 */
export async function handleIdLookup(
  query: string,
  abortSignal?: AbortSignal,
  limit: number = 200
): Promise<NDKEvent[] | null> {
  const matches = Array.from(query.matchAll(/\bid:(\S+)/gi));
  if (matches.length === 0) return null;

  const eventIds = Array.from(
    new Set(matches.map((m) => resolveEventId(m[1] || '')).filter((id): id is string => Boolean(id)))
  );
  if (eventIds.length === 0) return [];

  const filter: NDKFilter = { ids: eventIds };

  let relaySet;
  try {
    relaySet = await getBroadRelaySet();
  } catch {
    return [];
  }

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
