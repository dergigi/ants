import { NDKEvent, NDKFilter, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { sortEventsNewestFirst } from '../utils/searchUtils';
import { Nip50Extensions } from './searchUtils';
import { extractKindFilter, applyDateFilter } from './queryParsing';
import { expandParenthesizedOr } from './queryTransforms';
import { subscribeAndCollect } from './subscriptions';
import { searchByAnyTerms } from './termSearch';
import { resolveAuthorTokens } from './authorResolve';
import { extractByTokens } from './tokenExtractors';
import {
  dedupeEvents,
  handleProfileSeeds,
  handleSameContentMultiAuthor,
  handleTagAuthorCombination
} from './orHelpers';

// Re-export for consumers
export { dedupeEvents, handleProfileSeeds } from './orHelpers';
export { extractByTokens } from './tokenExtractors';

/** Extract content of a seed after removing all by: clauses */
export function extractNonByContent(seed: string): string {
  return seed.replace(/\bby:\S+/gi, '').replace(/\s+/g, ' ').trim();
}

/** Optimize pure by: OR queries into a single multi-author filter. */
export async function maybeOptimizeByOnlyOrSeeds(
  seeds: string[], effectiveKinds: number[], dateFilter: { since?: number; until?: number },
  _nip50Extensions: Nip50Extensions | undefined, broadRelaySet: NDKRelaySet,
  abortSignal: AbortSignal | undefined, limit: number, profileProvider?: string
): Promise<NDKEvent[] | null> {
  const trimmedSeeds = seeds.map((s) => s.trim()).filter(Boolean);
  if (trimmedSeeds.length < 2) return null;

  for (const seed of trimmedSeeds) {
    if (extractNonByContent(seed).length > 0) return null;
    if (!/\bby:\S+/i.test(seed)) return null;
  }

  const allByTokens = trimmedSeeds.flatMap(extractByTokens);
  const uniqueByTokens = Array.from(new Set(allByTokens));
  if (uniqueByTokens.length === 0) return null;

  const resolvedPubkeys = await resolveAuthorTokens(uniqueByTokens, profileProvider);
  if (resolvedPubkeys.length === 0) return null;

  const filter: NDKFilter = applyDateFilter(
    { kinds: effectiveKinds, authors: resolvedPubkeys, limit: Math.max(limit, 500) },
    dateFilter
  ) as NDKFilter;

  let results: NDKEvent[];
  try {
    results = await subscribeAndCollect(filter, 10000, broadRelaySet, abortSignal);
  } catch {
    return null;
  }

  return sortEventsNewestFirst(dedupeEvents(results)).slice(0, limit);
}

/** Handle parenthesized OR expansion: "(GM OR GN) by:dergigi" => multiple seeds. */
export async function handleParenthesizedOr(
  cleanedQuery: string, effectiveKinds: number[], dateFilter: { since?: number; until?: number },
  nip50Extensions: Nip50Extensions | undefined, nip50RelaySet: NDKRelaySet,
  broadRelaySet: NDKRelaySet, abortSignal: AbortSignal | undefined, limit: number,
  profileProvider?: string
): Promise<NDKEvent[] | null> {
  const expandedSeeds = expandParenthesizedOr(cleanedQuery)
    .map((seed) => seed.trim())
    .filter(Boolean);
  if (expandedSeeds.length <= 1) return null;

  const isPSeed = (s: string) => /^p:\S+/i.test(s.trim());
  if (expandedSeeds.every(isPSeed)) {
    return handleProfileSeeds(expandedSeeds, limit, profileProvider);
  }

  const byOnlyResults = await maybeOptimizeByOnlyOrSeeds(
    expandedSeeds, effectiveKinds, dateFilter, nip50Extensions, broadRelaySet,
    abortSignal, limit, profileProvider
  );
  if (byOnlyResults !== null) return byOnlyResults;

  const firstNonBy = extractNonByContent(expandedSeeds[0]);
  const allSameNonBy = expandedSeeds.every((s) => extractNonByContent(s) === firstNonBy);
  const allHaveBy = expandedSeeds.every((s) => /\bby:\S+/i.test(s));

  if (allSameNonBy && allHaveBy && expandedSeeds.length > 1) {
    const result = await handleSameContentMultiAuthor(
      expandedSeeds, firstNonBy, effectiveKinds, dateFilter, nip50Extensions,
      nip50RelaySet, broadRelaySet, abortSignal, cleanedQuery, limit, profileProvider
    );
    if (result) return result;
  }

  const tagAuthorResult = await handleTagAuthorCombination(
    expandedSeeds, effectiveKinds, dateFilter, nip50Extensions, nip50RelaySet,
    broadRelaySet, abortSignal, cleanedQuery, limit, profileProvider
  );
  if (tagAuthorResult) return tagAuthorResult;

  const kindPrefix = effectiveKinds.map((k) => `kind:${k}`).join(' ');
  const translatedSeeds = expandedSeeds.map((seed) => {
    if (extractKindFilter(seed).kinds?.length) return seed;
    return kindPrefix ? `${kindPrefix} ${seed}`.trim() : seed;
  });

  const seedResults = await searchByAnyTerms(
    translatedSeeds, Math.max(limit, 500), nip50RelaySet, abortSignal,
    nip50Extensions, applyDateFilter({ kinds: effectiveKinds }, dateFilter),
    () => Promise.resolve(broadRelaySet), profileProvider
  );

  return sortEventsNewestFirst(seedResults).slice(0, limit);
}
