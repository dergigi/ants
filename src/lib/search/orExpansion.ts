import { NDKEvent, NDKFilter, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { sortEventsNewestFirst } from '../utils/searchUtils';
import { buildSearchQueryWithExtensions, Nip50Extensions } from './searchUtils';
import { extractKindFilter, applyDateFilter, normalizeResidualSearchText } from './queryParsing';
import { expandParenthesizedOr } from './queryTransforms';
import { subscribeAndCollect } from './subscriptions';
import { getBroadRelaySet } from './relayManagement';
import { searchByAnyTerms } from './termSearch';
import { resolveAuthorTokens } from './authorResolve';
import { applyContentFilter } from './contentFilter';

const SUBSCRIBE_TIMEOUT_MS = 10000;
import { searchProfilesFullText } from '../vertex';

/** Extract all by: tokens from a seed string */
export function extractByTokens(seed: string): string[] {
  const matches = Array.from(seed.matchAll(/\bby:(\S+)/gi));
  return matches.map((m) => m[1] || '').filter(Boolean);
}

/** Extract content of a seed after removing all by: clauses */
export function extractNonByContent(seed: string): string {
  return seed.replace(/\bby:\S+/gi, '').replace(/\s+/g, ' ').trim();
}

/** Optimize pure by: OR queries into a single multi-author filter. Returns null if not applicable. */
export async function maybeOptimizeByOnlyOrSeeds(
  seeds: string[], effectiveKinds: number[], dateFilter: { since?: number; until?: number },
  nip50Extensions: Nip50Extensions | undefined, chosenRelaySet: NDKRelaySet,
  abortSignal: AbortSignal | undefined, limit: number
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

  const resolvedPubkeys = await resolveAuthorTokens(uniqueByTokens);
  if (resolvedPubkeys.length === 0) return null;

  const filter: NDKFilter = applyDateFilter(
    { kinds: effectiveKinds, authors: resolvedPubkeys, limit: Math.max(limit, 500) },
    dateFilter
  ) as NDKFilter;

  const results = await subscribeAndCollect(filter, SUBSCRIBE_TIMEOUT_MS, chosenRelaySet, abortSignal);
  return sortEventsNewestFirst(results).slice(0, limit);
}

/** Handle parenthesized OR expansion: "(GM OR GN) by:dergigi" => multiple seeds. */
export async function handleParenthesizedOr(
  cleanedQuery: string, effectiveKinds: number[], dateFilter: { since?: number; until?: number },
  nip50Extensions: Nip50Extensions | undefined, chosenRelaySet: NDKRelaySet,
  abortSignal: AbortSignal | undefined, limit: number
): Promise<NDKEvent[] | null> {
  const expandedSeeds = expandParenthesizedOr(cleanedQuery)
    .map((seed) => seed.trim())
    .filter(Boolean);
  if (expandedSeeds.length <= 1) return null;

  // Profile search seeds (p:term OR p:term)
  const isPSeed = (s: string) => /^p:\S+/i.test(s.trim());
  if (expandedSeeds.every(isPSeed)) {
    return handleProfileSeeds(expandedSeeds, limit);
  }

  // Pure by: OR queries
  const byOnlyResults = await maybeOptimizeByOnlyOrSeeds(
    expandedSeeds, effectiveKinds, dateFilter, nip50Extensions, chosenRelaySet, abortSignal, limit
  );
  if (byOnlyResults !== null) return byOnlyResults;

  // Same non-by content with different authors
  const firstNonBy = extractNonByContent(expandedSeeds[0]);
  const allSameNonBy = expandedSeeds.every((seed) => extractNonByContent(seed) === firstNonBy);
  const allHaveBy = expandedSeeds.every((seed) => /\bby:\S+/i.test(seed));

  if (allSameNonBy && allHaveBy && expandedSeeds.length > 1) {
    const result = await handleSameContentMultiAuthor(
      expandedSeeds, firstNonBy, effectiveKinds, dateFilter, nip50Extensions, chosenRelaySet, abortSignal, cleanedQuery, limit
    );
    if (result) return result;
  }

  // Combined hashtag + author patterns
  const tagAuthorResult = await handleTagAuthorCombination(
    expandedSeeds, effectiveKinds, dateFilter, nip50Extensions, chosenRelaySet, abortSignal, cleanedQuery, limit
  );
  if (tagAuthorResult) return tagAuthorResult;

  // Fallback: search each seed via searchByAnyTerms
  const translatedSeeds = expandedSeeds.map((seed) => {
    const existingKind = extractKindFilter(seed);
    if (existingKind.kinds && existingKind.kinds.length > 0) return seed;
    const kindTokens = effectiveKinds.map((k) => `kind:${k}`).join(' ');
    return kindTokens ? `${kindTokens} ${seed}`.trim() : seed;
  });

  const seedResults = await searchByAnyTerms(
    translatedSeeds, Math.max(limit, 500), chosenRelaySet, abortSignal,
    nip50Extensions, applyDateFilter({ kinds: effectiveKinds }, dateFilter),
    () => getBroadRelaySet()
  );

  // No global content filter — per-seed filtering happens inside termSearch
  return sortEventsNewestFirst(seedResults).slice(0, limit);
}

export async function handleProfileSeeds(pSeeds: string[], limit: number): Promise<NDKEvent[]> {
  const pTerms = pSeeds.map((s) => s.replace(/^p:/i, '').trim()).filter(Boolean);
  const profileResults = await Promise.allSettled(pTerms.map((term) => searchProfilesFullText(term)));
  const mergedProfiles: NDKEvent[] = [];
  const seenPubkeys = new Set<string>();
  for (const result of profileResults) {
    if (result.status !== 'fulfilled') continue;
    for (const evt of result.value) {
      const pk = evt.pubkey || evt.author?.pubkey || '';
      if (pk && !seenPubkeys.has(pk)) {
        seenPubkeys.add(pk);
        mergedProfiles.push(evt);
      }
    }
  }
  return sortEventsNewestFirst(mergedProfiles).slice(0, limit);
}

/** Build filter, subscribe, apply content filter, and return sorted results. */
async function collectAndFilter(
  filter: NDKFilter, chosenRelaySet: NDKRelaySet,
  abortSignal: AbortSignal | undefined, cleanedQuery: string, limit: number
): Promise<NDKEvent[]> {
  const results = await subscribeAndCollect(filter, SUBSCRIBE_TIMEOUT_MS, chosenRelaySet, abortSignal);
  return sortEventsNewestFirst(applyContentFilter(results, cleanedQuery)).slice(0, limit);
}

/** Strip kind/hashtag tokens from preprocessed query to get residual search text */
function extractResidual(preprocessed: string, normalize = false): string {
  const raw = preprocessed.replace(/\bkind:[^\s]+/gi, ' ').replace(/\bkinds:[^\s]+/gi, ' ')
    .replace(/#[A-Za-z0-9_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return normalize ? normalizeResidualSearchText(raw) : raw;
}

async function handleSameContentMultiAuthor(
  expandedSeeds: string[], baseQuery: string,
  effectiveKinds: number[], dateFilter: { since?: number; until?: number },
  nip50Extensions: Nip50Extensions | undefined, chosenRelaySet: NDKRelaySet,
  abortSignal: AbortSignal | undefined, cleanedQuery: string, limit: number
): Promise<NDKEvent[] | null> {
  const resolvedPubkeys = await resolveAuthorTokens(
    Array.from(new Set(expandedSeeds.flatMap(extractByTokens)))
  );
  if (resolvedPubkeys.length === 0) return null;

  const { applySimpleReplacements } = await import('./replacements');
  const preprocessed = await applySimpleReplacements(baseQuery || '');
  const tagMatches = Array.from(preprocessed.match(/#[A-Za-z0-9_]+/gi) || []).map((t) => t.slice(1).toLowerCase());

  const filter: NDKFilter = applyDateFilter({
    kinds: effectiveKinds, authors: resolvedPubkeys, limit: Math.max(limit, 500),
    ...(tagMatches.length > 0 && { '#t': Array.from(new Set(tagMatches)) })
  }, dateFilter) as NDKFilter;

  const residual = extractResidual(preprocessed);
  if (residual) filter.search = nip50Extensions ? buildSearchQueryWithExtensions(residual, nip50Extensions) : residual;

  return collectAndFilter(filter, chosenRelaySet, abortSignal, cleanedQuery, limit);
}

async function handleTagAuthorCombination(
  expandedSeeds: string[], effectiveKinds: number[],
  dateFilter: { since?: number; until?: number }, nip50Extensions: Nip50Extensions | undefined,
  chosenRelaySet: NDKRelaySet, abortSignal: AbortSignal | undefined,
  cleanedQuery: string, limit: number
): Promise<NDKEvent[] | null> {
  const extractTags = (s: string): string[] =>
    Array.from(s.matchAll(/#[A-Za-z0-9_]+/gi)).map((m) => (m[0] || '').slice(1).toLowerCase()).filter(Boolean);
  const extractCore = (s: string): string =>
    s.replace(/\bby:\S+/gi, '').replace(/#[A-Za-z0-9_]+/g, '').replace(/\s+/g, ' ').trim();

  const baseCore = extractCore(expandedSeeds[0]);
  if (!expandedSeeds.every((s) => extractCore(s) === baseCore)) return null;
  if (!expandedSeeds.every((s) => extractTags(s).length > 0 && extractByTokens(s).length > 0)) return null;

  const allTags = new Set<string>();
  const allByTokens: string[] = [];
  for (const seed of expandedSeeds) {
    extractTags(seed).forEach((t) => allTags.add(t));
    allByTokens.push(...extractByTokens(seed));
  }

  const resolvedPubkeys = await resolveAuthorTokens(Array.from(new Set(allByTokens)));
  if (resolvedPubkeys.length === 0 || allTags.size === 0) return null;

  const { applySimpleReplacements } = await import('./replacements');
  const preprocessed = await applySimpleReplacements(baseCore || '');
  const filter: NDKFilter = applyDateFilter({
    kinds: effectiveKinds, authors: resolvedPubkeys, '#t': Array.from(allTags), limit: Math.max(limit, 500)
  }, dateFilter) as NDKFilter;

  const residual = extractResidual(preprocessed, true);
  if (residual) filter.search = nip50Extensions ? buildSearchQueryWithExtensions(residual, nip50Extensions) : residual;

  return collectAndFilter(filter, chosenRelaySet, abortSignal, cleanedQuery, limit);
}
