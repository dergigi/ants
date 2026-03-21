import { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { SearchContext } from '../types';
import { fetchDedupeAndSort } from './strategyUtils';

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
 * Fetches specific events by their ID.
 * Returns null if the query does not contain id: tokens.
 */
export async function tryHandleIdSearch(
  cleanedQuery: string,
  context: SearchContext
): Promise<NDKEvent[] | null> {
  const { chosenRelaySet, abortSignal, limit } = context;

  const matches = Array.from(cleanedQuery.matchAll(/\bid:(\S+)/gi));
  if (matches.length === 0) return null;

  const eventIds = Array.from(
    new Set(matches.map((m) => resolveEventId(m[1] || '')).filter((id): id is string => Boolean(id)))
  );
  if (eventIds.length === 0) return [];

  const filter: NDKFilter = { ids: eventIds };

  return fetchDedupeAndSort(filter, chosenRelaySet, false, abortSignal, limit);
}
