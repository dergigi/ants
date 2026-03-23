import { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { applyDateFilter } from '../queryParsing';
import { SearchContext } from '../types';
import { fetchDedupeAndSort, parseResidual } from './strategyUtils';

type TagEFilter = NDKFilter & { '#e'?: string[] };

/** Resolve a reply: token to a hex event ID (hex, note1..., nevent1...). */
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
 * Handle reply: filter queries (reply:<event-id>)
 * Finds events that reference a specific event via #e tags.
 * Supports combining with by: and search terms.
 * Returns null if the query does not contain reply: tokens.
 */
export async function tryHandleReplySearch(
  cleanedQuery: string,
  context: SearchContext
): Promise<NDKEvent[] | null> {
  const { effectiveKinds, dateFilter, nip50Extensions, nip50RelaySet, broadRelaySet, abortSignal, limit, profileProvider } = context;

  const matches = Array.from(cleanedQuery.matchAll(/\breply:(\S+)/gi));
  if (matches.length === 0) return null;

  const tokens = Array.from(new Set(matches.map((m) => m[1]).filter(Boolean)));
  const eventIds = Array.from(new Set(tokens.map(resolveEventId).filter((id): id is string => Boolean(id))));
  if (eventIds.length === 0) return [];

  const residual = cleanedQuery.replace(/\breply:\S+/gi, '').replace(/\s+/g, ' ').trim();
  const { authors, search } = await parseResidual(residual, nip50Extensions, profileProvider);

  const filter: TagEFilter = applyDateFilter({
    kinds: effectiveKinds, '#e': eventIds, limit: Math.max(limit, 500),
    ...(authors && { authors }),
  }, dateFilter) as TagEFilter;

  if (search) (filter as NDKFilter).search = search;

  return fetchDedupeAndSort(filter, nip50RelaySet, broadRelaySet, Boolean(search), abortSignal, limit);
}
