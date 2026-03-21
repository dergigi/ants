import { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { applyDateFilter } from '../queryParsing';
import { buildSearchQueryWithExtensions } from '../searchUtils';
import { SearchContext } from '../types';
import { fetchDedupeAndSort } from './strategyUtils';

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
 * Returns null if the query does not contain ref: tokens.
 */
export async function tryHandleRefSearch(
  cleanedQuery: string,
  context: SearchContext
): Promise<NDKEvent[] | null> {
  const { effectiveKinds, dateFilter, nip50Extensions, chosenRelaySet, abortSignal, limit } = context;

  const matches = Array.from(cleanedQuery.matchAll(/\bref:(\S+)/gi));
  if (matches.length === 0) return null;

  const tokens = Array.from(new Set(matches.map((m) => m[1]).filter(Boolean)));
  const coords = tokens.map(resolveATagCoordinate).filter((c): c is string => Boolean(c));
  if (coords.length === 0) return [];

  const residual = cleanedQuery.replace(/\bref:\S+/gi, '').replace(/\s+/g, ' ').trim();

  const filter: TagAFilter = applyDateFilter({
    kinds: effectiveKinds, '#a': coords, limit: Math.max(limit, 500)
  }, dateFilter) as TagAFilter;

  if (residual) {
    (filter as NDKFilter).search = nip50Extensions
      ? buildSearchQueryWithExtensions(residual, nip50Extensions) : residual;
  }

  return fetchDedupeAndSort(filter, chosenRelaySet, Boolean((filter as NDKFilter).search), abortSignal, limit);
}
