import { NDKEvent, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { sortEventsNewestFirst } from '../utils/searchUtils';
import { Nip50Extensions } from './searchUtils';
import { applyDateFilter } from './queryParsing';
import { expandParenthesizedOr } from './queryTransforms';
import { searchByAnyTerms } from './termSearch';
import { maybeOptimizeByOnlyOrSeeds, handleProfileSeeds } from './orExpansion';

/**
 * Handle top-level OR queries: "bitcoin OR lightning" or "by:alice OR by:bob".
 * Returns null if no top-level OR parts are provided.
 */
export async function handleTopLevelOr(
  topLevelOrParts: string[],
  effectiveKinds: number[],
  dateFilter: { since?: number; until?: number },
  nip50Extensions: Nip50Extensions | undefined,
  nip50RelaySet: NDKRelaySet,
  broadRelaySet: NDKRelaySet,
  abortSignal: AbortSignal | undefined,
  limit: number,
  profileProvider?: string
): Promise<NDKEvent[] | null> {
  const normalizedParts = topLevelOrParts
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<string[]>((acc, part) => {
      const expanded = expandParenthesizedOr(part);
      const seeds = expanded.length > 1 ? expanded : [part];
      seeds.forEach((seed) => {
        const trimmed = seed.trim();
        if (trimmed) acc.push(trimmed);
      });
      return acc;
    }, []);

  // Try optimizing pure by: OR queries (no search text, use broad relays)
  const byOnlyResults = await maybeOptimizeByOnlyOrSeeds(
    normalizedParts, effectiveKinds, dateFilter, nip50Extensions, broadRelaySet, abortSignal, limit, profileProvider
  );
  if (byOnlyResults !== null) return byOnlyResults;

  // Profile search: all parts are p:<term>
  const isPClause = (s: string) => /^p:\S+/i.test(s);
  if (normalizedParts.length > 0 && normalizedParts.every(isPClause)) {
    return handleProfileSeeds(normalizedParts, limit, profileProvider);
  }

  // General OR search via searchByAnyTerms
  const orResults = await searchByAnyTerms(
    normalizedParts, Math.max(limit, 500), nip50RelaySet, abortSignal,
    nip50Extensions, applyDateFilter({ kinds: effectiveKinds }, dateFilter),
    () => Promise.resolve(broadRelaySet), profileProvider
  );

  const filtered = orResults.filter((evt) => effectiveKinds.length === 0 || effectiveKinds.includes(evt.kind));
  return sortEventsNewestFirst(filtered).slice(0, limit);
}
