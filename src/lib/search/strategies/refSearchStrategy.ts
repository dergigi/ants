import { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { applyDateFilter } from '../queryParsing';
import { SearchContext } from '../types';
import { fetchDedupeAndSort, parseResidual } from './strategyUtils';

type TagAFilter = NDKFilter & { '#a'?: string[] };

/** Resolve a ref: token to an NIP-33 coordinate (raw or naddr1...). */
function resolveATagCoordinate(token: string): string | null {
  if (/^\d+:[0-9a-f]{64}:/i.test(token)) return token.toLowerCase();
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
 * Finds events that reference a replaceable event via #a tags.
 * Supports combining with by: and search terms.
 * Returns null if the query does not contain ref: tokens.
 */
export async function tryHandleRefSearch(
  cleanedQuery: string,
  context: SearchContext
): Promise<NDKEvent[] | null> {
  const { effectiveKinds, dateFilter, nip50Extensions, nip50RelaySet, broadRelaySet, abortSignal, limit } = context;

  const matches = Array.from(cleanedQuery.matchAll(/\bref:(\S+)/gi));
  if (matches.length === 0) return null;

  const tokens = Array.from(new Set(matches.map((m) => m[1]).filter(Boolean)));
  const coords = tokens.map(resolveATagCoordinate).filter((c): c is string => Boolean(c));
  if (coords.length === 0) return [];

  const residual = cleanedQuery.replace(/\bref:\S+/gi, '').replace(/\s+/g, ' ').trim();
  const { authors, search } = await parseResidual(residual, nip50Extensions);

  const filter: TagAFilter = applyDateFilter({
    kinds: effectiveKinds, '#a': coords, limit: Math.max(limit, 500),
    ...(authors && { authors }),
  }, dateFilter) as TagAFilter;

  if (search) (filter as NDKFilter).search = search;

  return fetchDedupeAndSort(filter, nip50RelaySet, broadRelaySet, Boolean(search), abortSignal, limit);
}
