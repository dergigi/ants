import { NDKEvent, NDKFilter, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { sortEventsNewestFirst } from '../utils/searchUtils';
import { buildSearchQueryWithExtensions, Nip50Extensions } from './searchUtils';
import { extractKindFilter, applyDateFilter, normalizeResidualSearchText } from './queryParsing';
import { expandParenthesizedOr } from './queryTransforms';
import { subscribeAndCollect } from './subscriptions';
import { searchByAnyTerms } from './termSearch';
import { resolveAuthorTokens } from './authorResolve';
import { applyContentFilter } from './contentFilter';
import { searchProfilesFullText } from '../vertex';
/** Deduplicate events by id */
function dedupeEvents(events: NDKEvent[]): NDKEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}

/** Extract all by: tokens from a seed string */
export function extractByTokens(seed: string): string[] {
  const matches = Array.from(seed.matchAll(/\bby:(\S+)/gi));
  return matches.map((m) => m[1] || '').filter(Boolean);
}

/** Extract content of a seed after removing all by: clauses */
export function extractNonByContent(seed: string): string {
  return seed.replace(/\bby:\S+/gi, '').replace(/\s+/g, ' ').trim();
}

/** Optimize pure by: OR queries into a single multi-author filter. */
export async function maybeOptimizeByOnlyOrSeeds(
  seeds: string[], effectiveKinds: number[], dateFilter: { since?: number; until?: number },
  _nip50Extensions: Nip50Extensions | undefined, broadRelaySet: NDKRelaySet,
  abortSignal: AbortSignal | undefined, limit: number, profileProvider?: string): Promise<NDKEvent[] | null> {
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

  // Pure author query: no search text, use broad relays
  let results: NDKEvent[];
  try {
    results = await subscribeAndCollect(filter, 10000, broadRelaySet, abortSignal);
  } catch {
    return null; // Let caller fall back to searchByAnyTerms
  }

  return sortEventsNewestFirst(dedupeEvents(results)).slice(0, limit);
}

/** Handle parenthesized OR expansion: "(GM OR GN) by:dergigi" => multiple seeds. */
export async function handleParenthesizedOr(
  cleanedQuery: string, effectiveKinds: number[], dateFilter: { since?: number; until?: number },
  nip50Extensions: Nip50Extensions | undefined, nip50RelaySet: NDKRelaySet,
  broadRelaySet: NDKRelaySet, abortSignal: AbortSignal | undefined, limit: number,
  profileProvider?: string): Promise<NDKEvent[] | null> {
  const expandedSeeds = expandParenthesizedOr(cleanedQuery)
    .map((seed) => seed.trim())
    .filter(Boolean);
  if (expandedSeeds.length <= 1) return null;

  // Profile search seeds (p:term OR p:term)
  const isPSeed = (s: string) => /^p:\S+/i.test(s.trim());
  if (expandedSeeds.every(isPSeed)) {
    return handleProfileSeeds(expandedSeeds, limit, profileProvider);
  }

  // Pure by: OR queries (no search text, use broad relays)
  const byOnlyResults = await maybeOptimizeByOnlyOrSeeds(
    expandedSeeds, effectiveKinds, dateFilter, nip50Extensions, broadRelaySet, abortSignal, limit, profileProvider
  );
  if (byOnlyResults !== null) return byOnlyResults;

  const firstNonBy = extractNonByContent(expandedSeeds[0]);
  const allSameNonBy = expandedSeeds.every((s) => extractNonByContent(s) === firstNonBy);
  const allHaveBy = expandedSeeds.every((s) => /\bby:\S+/i.test(s));

  if (allSameNonBy && allHaveBy && expandedSeeds.length > 1) {
    const result = await handleSameContentMultiAuthor(
      expandedSeeds, firstNonBy, effectiveKinds, dateFilter, nip50Extensions, nip50RelaySet, broadRelaySet, abortSignal, cleanedQuery, limit, profileProvider
    );
    if (result) return result;
  }

  // Combined hashtag + author patterns
  const tagAuthorResult = await handleTagAuthorCombination(
    expandedSeeds, effectiveKinds, dateFilter, nip50Extensions, nip50RelaySet, broadRelaySet, abortSignal, cleanedQuery, limit, profileProvider
  );
  if (tagAuthorResult) return tagAuthorResult;

  // Fallback: search each seed via searchByAnyTerms, prepend kind tokens if missing
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

  // No global content filter — per-seed filtering happens inside termSearch
  return sortEventsNewestFirst(seedResults).slice(0, limit);
}

export async function handleProfileSeeds(pSeeds: string[], limit: number, profileProvider?: string): Promise<NDKEvent[]> {
  const pTerms = pSeeds.map((s) => s.replace(/^p:/i, '').trim()).filter(Boolean);
  const results = await Promise.allSettled(pTerms.map((t) => searchProfilesFullText(t, undefined, profileProvider)));
  const seen = new Set<string>();
  const merged = results.flatMap((r) => r.status === 'fulfilled' ? r.value : [])
    .filter((evt) => {
      const pk = evt.pubkey || evt.author?.pubkey || '';
      return pk && !seen.has(pk) && (seen.add(pk), true);
    });
  return sortEventsNewestFirst(merged).slice(0, limit);
}

/** Subscribe, dedupe, content-filter, sort, and slice. */
async function collectAndFilter(
  filter: NDKFilter, relaySet: NDKRelaySet, abortSignal: AbortSignal | undefined, cleanedQuery: string, limit: number
): Promise<NDKEvent[]> {
  let raw: NDKEvent[];
  try {
    raw = await subscribeAndCollect(filter, 10000, relaySet, abortSignal);
  } catch {
    return [];
  }
  return sortEventsNewestFirst(applyContentFilter(dedupeEvents(raw), cleanedQuery)).slice(0, limit);
}

/** Strip kind/hashtag tokens to get residual search text */
function extractResidual(preprocessed: string, normalize = false): string {
  const raw = preprocessed.replace(/\bkind:[^\s]+/gi, ' ').replace(/\bkinds:[^\s]+/gi, ' ')
    .replace(/#[A-Za-z0-9_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return normalize ? normalizeResidualSearchText(raw) : raw;
}

async function handleSameContentMultiAuthor(
  expandedSeeds: string[], baseQuery: string, effectiveKinds: number[],
  dateFilter: { since?: number; until?: number }, nip50Extensions: Nip50Extensions | undefined,
  nip50RelaySet: NDKRelaySet, broadRelaySet: NDKRelaySet,
  abortSignal: AbortSignal | undefined, cleanedQuery: string, limit: number,
  profileProvider?: string): Promise<NDKEvent[] | null> {
  const resolvedPubkeys = await resolveAuthorTokens(
    Array.from(new Set(expandedSeeds.flatMap(extractByTokens))), profileProvider
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

  const relaySet = filter.search ? nip50RelaySet : broadRelaySet;
  return collectAndFilter(filter, relaySet, abortSignal, cleanedQuery, limit);
}

async function handleTagAuthorCombination(
  expandedSeeds: string[], effectiveKinds: number[],
  dateFilter: { since?: number; until?: number }, nip50Extensions: Nip50Extensions | undefined,
  nip50RelaySet: NDKRelaySet, broadRelaySet: NDKRelaySet,
  abortSignal: AbortSignal | undefined, cleanedQuery: string, limit: number,
  profileProvider?: string): Promise<NDKEvent[] | null> {
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

  const resolvedPubkeys = await resolveAuthorTokens(Array.from(new Set(allByTokens)), profileProvider);
  if (resolvedPubkeys.length === 0 || allTags.size === 0) return null;

  const { applySimpleReplacements } = await import('./replacements');
  const preprocessed = await applySimpleReplacements(baseCore || '');
  const filter: NDKFilter = applyDateFilter({
    kinds: effectiveKinds, authors: resolvedPubkeys, '#t': Array.from(allTags), limit: Math.max(limit, 500)
  }, dateFilter) as NDKFilter;

  const residual = extractResidual(preprocessed, true);
  if (residual) filter.search = nip50Extensions ? buildSearchQueryWithExtensions(residual, nip50Extensions) : residual;

  const relaySet = filter.search ? nip50RelaySet : broadRelaySet;
  return collectAndFilter(filter, relaySet, abortSignal, cleanedQuery, limit);
}
