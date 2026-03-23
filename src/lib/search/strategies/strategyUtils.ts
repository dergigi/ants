import { NDKEvent, NDKFilter, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { subscribeAndCollect } from '../subscriptions';
import { resolveAuthorTokens } from '../authorResolve';
import { buildSearchQueryWithExtensions, Nip50Extensions } from '../searchUtils';
import { sortEventsNewestFirst } from '../../utils/searchUtils';

/**
 * Shared helper for tag-filter strategies: select relay set, fetch with fallback,
 * deduplicate by event ID, sort newest-first, and slice to limit.
 */
export async function fetchDedupeAndSort(
  filter: NDKFilter,
  nip50RelaySet: NDKRelaySet,
  broadRelaySet: NDKRelaySet,
  hasSearchTerm: boolean,
  abortSignal: AbortSignal | undefined,
  limit: number
): Promise<NDKEvent[]> {
  const relaySet = hasSearchTerm ? nip50RelaySet : broadRelaySet;

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

/**
 * Parse residual text after stripping the primary keyword: extract by: tokens
 * into an authors filter, and build the remaining search string.
 * Returns { authors, searchTerms } where either may be empty/undefined.
 */
export async function parseResidual(
  residual: string,
  nip50Extensions: Nip50Extensions | undefined,
  profileProvider?: string
): Promise<{ authors?: string[]; search?: string }> {
  const byMatches = Array.from(residual.matchAll(/\bby:(\S+)/gi));
  let authors: string[] | undefined;

  if (byMatches.length > 0) {
    const tokens = Array.from(new Set(byMatches.map((m) => m[1]).filter(Boolean)));
    const resolved = await resolveAuthorTokens(tokens, profileProvider);
    if (resolved.length > 0) authors = resolved;
  }

  const searchText = residual.replace(/\bby:\S+/gi, '').replace(/\s+/g, ' ').trim();
  const search = searchText
    ? (nip50Extensions ? buildSearchQueryWithExtensions(searchText, nip50Extensions) : searchText)
    : undefined;

  return { authors, search };
}
