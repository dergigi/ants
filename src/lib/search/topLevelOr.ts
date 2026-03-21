import { NDKEvent, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { sortEventsNewestFirst } from '../utils/searchUtils';
import { Nip50Extensions } from './searchUtils';
import { applyDateFilter } from './queryParsing';
import { expandParenthesizedOr } from './queryTransforms';
import { getBroadRelaySet } from './relayManagement';
import { searchByAnyTerms } from './termSearch';
import { searchProfilesFullText } from '../vertex';
import { maybeOptimizeByOnlyOrSeeds } from './orExpansion';

/**
 * Handle top-level OR queries: "bitcoin OR lightning" or "by:alice OR by:bob".
 * Returns null if no top-level OR parts are provided.
 */
export async function handleTopLevelOr(
  topLevelOrParts: string[],
  effectiveKinds: number[],
  dateFilter: { since?: number; until?: number },
  nip50Extensions: Nip50Extensions | undefined,
  chosenRelaySet: NDKRelaySet,
  relaySetOverride: NDKRelaySet | undefined,
  abortSignal: AbortSignal | undefined,
  limit: number
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

  // Try optimizing pure by: OR queries
  const byOnlyResults = await maybeOptimizeByOnlyOrSeeds(
    normalizedParts, effectiveKinds, dateFilter, nip50Extensions, chosenRelaySet, abortSignal, limit
  );
  if (byOnlyResults !== null) return byOnlyResults;

  // Profile search: all parts are p:<term>
  const isPClause = (s: string) => /^p:\S+/i.test(s);
  if (normalizedParts.length > 0 && normalizedParts.every(isPClause)) {
    const pTerms = normalizedParts.map((s) => s.replace(/^p:/i, '').trim()).filter(Boolean);
    const mergedProfiles: NDKEvent[] = [];
    const seenPubkeys = new Set<string>();
    for (const term of pTerms) {
      try {
        const profiles = await searchProfilesFullText(term);
        for (const evt of profiles) {
          const pk = evt.pubkey || evt.author?.pubkey || '';
          if (pk && !seenPubkeys.has(pk)) {
            seenPubkeys.add(pk);
            mergedProfiles.push(evt);
          }
        }
      } catch {}
    }
    return sortEventsNewestFirst(mergedProfiles).slice(0, limit);
  }

  // General OR search via searchByAnyTerms
  let orResults = await searchByAnyTerms(
    normalizedParts, Math.max(limit, 500), chosenRelaySet, abortSignal,
    nip50Extensions, applyDateFilter({ kinds: effectiveKinds }, dateFilter),
    () => getBroadRelaySet()
  );

  // Retry with broader relay set if no results
  if (orResults.length === 0 && !relaySetOverride) {
    const broadRelaySet = await getBroadRelaySet();
    orResults = await searchByAnyTerms(
      normalizedParts, Math.max(limit, 500), broadRelaySet, abortSignal,
      nip50Extensions, applyDateFilter({ kinds: effectiveKinds }, dateFilter)
    );
  }

  const filtered = orResults.filter((evt) => effectiveKinds.length === 0 || effectiveKinds.includes(evt.kind));
  return sortEventsNewestFirst(filtered).slice(0, limit);
}
