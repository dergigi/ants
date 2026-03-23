import { NDKEvent, NDKFilter, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { sortEventsNewestFirst } from '../utils/searchUtils';
import { buildSearchQueryWithExtensions, Nip50Extensions } from './searchUtils';
import { applyDateFilter, normalizeResidualSearchText } from './queryParsing';
import { subscribeAndCollect } from './subscriptions';
import { resolveAuthorTokens } from './authorResolve';
import { applyContentFilter } from './contentFilter';
import { searchProfilesFullText } from '../vertex';
import { extractByTokens } from './orExpansion';

/** Deduplicate events by id */
export function dedupeEvents(events: NDKEvent[]): NDKEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}

/** Subscribe, dedupe, content-filter, sort, and slice. */
export async function collectAndFilter(
  filter: NDKFilter, relaySet: NDKRelaySet, abortSignal: AbortSignal | undefined,
  cleanedQuery: string, limit: number
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

/** Handle profile search seeds (p:term OR p:term) */
export async function handleProfileSeeds(
  pSeeds: string[], limit: number, profileProvider?: string
): Promise<NDKEvent[]> {
  const pTerms = pSeeds.map((s) => s.replace(/^p:/i, '').trim()).filter(Boolean);
  const results = await Promise.allSettled(
    pTerms.map((t) => searchProfilesFullText(t, undefined, profileProvider))
  );
  const seen = new Set<string>();
  const merged = results.flatMap((r) => r.status === 'fulfilled' ? r.value : [])
    .filter((evt) => {
      const pk = evt.pubkey || evt.author?.pubkey || '';
      return pk && !seen.has(pk) && (seen.add(pk), true);
    });
  return sortEventsNewestFirst(merged).slice(0, limit);
}

/** Handle same-content multi-author OR expansion */
export async function handleSameContentMultiAuthor(
  expandedSeeds: string[], baseQuery: string, effectiveKinds: number[],
  dateFilter: { since?: number; until?: number }, nip50Extensions: Nip50Extensions | undefined,
  nip50RelaySet: NDKRelaySet, broadRelaySet: NDKRelaySet,
  abortSignal: AbortSignal | undefined, cleanedQuery: string, limit: number,
  profileProvider?: string
): Promise<NDKEvent[] | null> {
  const resolvedPubkeys = await resolveAuthorTokens(
    Array.from(new Set(expandedSeeds.flatMap(extractByTokens))), profileProvider
  );
  if (resolvedPubkeys.length === 0) return null;

  const { applySimpleReplacements } = await import('./replacements');
  const preprocessed = await applySimpleReplacements(baseQuery || '');
  const tagMatches = Array.from(preprocessed.match(/#[A-Za-z0-9_]+/gi) || [])
    .map((t) => t.slice(1).toLowerCase());

  const filter: NDKFilter = applyDateFilter({
    kinds: effectiveKinds, authors: resolvedPubkeys, limit: Math.max(limit, 500),
    ...(tagMatches.length > 0 && { '#t': Array.from(new Set(tagMatches)) })
  }, dateFilter) as NDKFilter;

  const residual = extractResidual(preprocessed);
  if (residual) {
    filter.search = nip50Extensions
      ? buildSearchQueryWithExtensions(residual, nip50Extensions) : residual;
  }

  const relaySet = filter.search ? nip50RelaySet : broadRelaySet;
  return collectAndFilter(filter, relaySet, abortSignal, cleanedQuery, limit);
}

/** Handle combined hashtag + author OR patterns */
export async function handleTagAuthorCombination(
  expandedSeeds: string[], effectiveKinds: number[],
  dateFilter: { since?: number; until?: number }, nip50Extensions: Nip50Extensions | undefined,
  nip50RelaySet: NDKRelaySet, broadRelaySet: NDKRelaySet,
  abortSignal: AbortSignal | undefined, cleanedQuery: string, limit: number,
  profileProvider?: string
): Promise<NDKEvent[] | null> {
  const extractTags = (s: string): string[] =>
    Array.from(s.matchAll(/#[A-Za-z0-9_]+/gi))
      .map((m) => (m[0] || '').slice(1).toLowerCase()).filter(Boolean);
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

  const resolvedPubkeys = await resolveAuthorTokens(
    Array.from(new Set(allByTokens)), profileProvider
  );
  if (resolvedPubkeys.length === 0 || allTags.size === 0) return null;

  const { applySimpleReplacements } = await import('./replacements');
  const preprocessed = await applySimpleReplacements(baseCore || '');
  const filter: NDKFilter = applyDateFilter({
    kinds: effectiveKinds, authors: resolvedPubkeys, '#t': Array.from(allTags),
    limit: Math.max(limit, 500)
  }, dateFilter) as NDKFilter;

  const residual = extractResidual(preprocessed, true);
  if (residual) {
    filter.search = nip50Extensions
      ? buildSearchQueryWithExtensions(residual, nip50Extensions) : residual;
  }

  const relaySet = filter.search ? nip50RelaySet : broadRelaySet;
  return collectAndFilter(filter, relaySet, abortSignal, cleanedQuery, limit);
}
