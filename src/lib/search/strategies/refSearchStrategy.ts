import { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { applyDateFilter } from '../queryParsing';
import { buildSearchQueryWithExtensions } from '../searchUtils';
import { subscribeAndCollect } from '../subscriptions';
import { getBroadRelaySet } from '../relayManagement';
import { sortEventsNewestFirst } from '../../utils/searchUtils';
import { SearchContext } from '../types';

type TagAFilter = NDKFilter & { '#a'?: string[] };

/**
 * Resolve a ref: token to an NIP-33 `a` tag coordinate.
 * Accepts: raw coordinates (kind:pubkey:d-tag) or naddr1... bech32.
 */
function resolveATagCoordinate(token: string): string | null {
  // Raw coordinate format: kind:pubkey:d-tag
  if (/^\d+:[0-9a-f]{64}:/.test(token)) return token;

  // Bech32 naddr
  try {
    const decoded = nip19.decode(token);
    if (decoded.type === 'naddr') {
      const { kind, pubkey, identifier } = decoded.data;
      return `${kind}:${pubkey}:${identifier}`;
    }
  } catch {}

  return null;
}

/**
 * Handle ref: filter queries (ref:<coordinate-or-naddr>)
 * Finds events that reference a specific replaceable event via #a tags.
 * Supports multiple ref: tokens and optional search terms.
 * Returns null if the query does not contain ref: tokens.
 */
export async function tryHandleRefSearch(
  cleanedQuery: string,
  context: SearchContext
): Promise<NDKEvent[] | null> {
  const { effectiveKinds, dateFilter, nip50Extensions, chosenRelaySet, abortSignal, limit } = context;

  const refMatches = Array.from(cleanedQuery.matchAll(/\bref:(\S+)/gi));
  if (refMatches.length === 0) return null;

  const tokens = Array.from(new Set(refMatches.map((m) => m[1]).filter(Boolean)));
  const coordinates = tokens.map(resolveATagCoordinate).filter(Boolean) as string[];
  if (coordinates.length === 0) return [];

  const residual = cleanedQuery.replace(/\bref:\S+/gi, '').replace(/\s+/g, ' ').trim();

  const filter: TagAFilter = applyDateFilter({
    kinds: effectiveKinds,
    '#a': coordinates,
    limit: Math.max(limit, 500)
  }, dateFilter) as TagAFilter;

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
