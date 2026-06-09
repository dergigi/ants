import { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import { searchProfilesFullText } from '../vertex';
import { buildSearchQueryWithExtensions } from './searchUtils';
import { sortEventsNewestFirst } from '../utils/searchUtils';
import { extractKindFilter, applyDateFilter, normalizeResidualSearchText } from './queryParsing';
import { expandParenthesizedOr } from './queryTransforms';
import { getBroadRelaySet } from './relayManagement';
import { subscribeAndCollect } from './subscriptions';
import { searchByAnyTerms } from './termSearch';
import { SearchContext } from './types';
import {
  extractByTokens,
  extractNonByContent,
  extractTags,
  extractCoreWithoutByAndTags,
  resolveByTokensToPubkeys,
  maybeOptimizeByOnlyOrSeeds
} from './orOptimizations';

/** Merge profile full-text results across p:<term> seeds, deduped by pubkey */
async function searchProfilesForTerms(pTerms: string[], limit: number): Promise<NDKEvent[]> {
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

/**
 * Handle queries with parenthesized OR groups, e.g.
 * "(GM OR GN) by:dergigi" => seeds ["GM by:dergigi", "GN by:dergigi"].
 * Returns null when the query does not expand into multiple seeds.
 */
export async function handleParenthesizedOr(
  cleanedQuery: string,
  ctx: SearchContext
): Promise<NDKEvent[] | null> {
  const { effectiveKinds, nip50Extensions, chosenRelaySet, abortSignal, limit } = ctx;
  const dateFilter = ctx.dateFilter || {};

  const expandedSeeds = expandParenthesizedOr(cleanedQuery).map((seed) => seed.trim()).filter(Boolean);
  if (expandedSeeds.length <= 1) return null;

  // Special-case: if all expanded seeds are profile searches (p:<term>), run profile full-text search per seed
  const isPSeed = (s: string) => /^p:\S+/i.test(s.replace(/^\s+|\s+$/g, ''));
  if (expandedSeeds.every(isPSeed)) {
    const pTerms = expandedSeeds
      .map((s) => s.replace(/^p:/i, '').trim())
      .filter((t) => t.length > 0);
    return searchProfilesForTerms(pTerms, limit);
  }

  // Try optimizing pure by: OR queries (only by: clauses, no other content)
  const byOnlyResults = await maybeOptimizeByOnlyOrSeeds(
    expandedSeeds,
    effectiveKinds,
    dateFilter,
    nip50Extensions,
    chosenRelaySet,
    abortSignal,
    limit
  );
  if (byOnlyResults !== null) {
    return byOnlyResults;
  }

  // Check if all seeds differ only by by: clauses (optimization: single filter with multiple authors)
  const firstNonBy = extractNonByContent(expandedSeeds[0]);
  const allSameNonBy = expandedSeeds.every(seed => extractNonByContent(seed) === firstNonBy);
  const allHaveBy = expandedSeeds.every(seed => /\bby:\S+/i.test(seed));

  if (allSameNonBy && allHaveBy && expandedSeeds.length > 1) {
    // All seeds are identical except for by: clauses - optimize with single filter
    const allByTokens = expandedSeeds.flatMap(extractByTokens);
    const uniqueByTokens = Array.from(new Set(allByTokens));
    const resolvedPubkeys = await resolveByTokensToPubkeys(uniqueByTokens);

    if (resolvedPubkeys.length > 0) {
      // Build single filter with all authors
      const baseQuery = firstNonBy || '';
      const { applySimpleReplacements } = await import('./replacements');
      const preprocessed = await applySimpleReplacements(baseQuery);
      const tagMatches = Array.from(preprocessed.match(/#[A-Za-z0-9_]+/gi) || []).map((t) => t.slice(1).toLowerCase());

      const filter: NDKFilter = applyDateFilter({
        kinds: effectiveKinds,
        authors: resolvedPubkeys,
        limit: Math.max(limit, 500),
        ...(tagMatches.length > 0 && { '#t': Array.from(new Set(tagMatches)) })
      }, dateFilter) as NDKFilter;

      // Extract residual search text
      const residual = preprocessed
        .replace(/\bkind:[^\s]+/gi, ' ')
        .replace(/\bkinds:[^\s]+/gi, ' ')
        .replace(/#[A-Za-z0-9_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (residual.length > 0) {
        filter.search = nip50Extensions
          ? buildSearchQueryWithExtensions(residual, nip50Extensions)
          : residual;
      }

      const results = await subscribeAndCollect(filter, 10000, chosenRelaySet, abortSignal);
      return sortEventsNewestFirst(results).slice(0, limit);
    }
  }

  // Check for combined hashtag + author OR patterns like:
  // "(#yestr OR #nostr) (by:dergigi OR by:IntuitiveGuy)"
  const baseCore = extractCoreWithoutByAndTags(expandedSeeds[0]);
  const allSameCore = expandedSeeds.every((seed) => extractCoreWithoutByAndTags(seed) === baseCore);
  const allHaveTagAndBy = expandedSeeds.every((seed) => extractTags(seed).length > 0 && extractByTokens(seed).length > 0);

  if (allSameCore && allHaveTagAndBy) {
    const allTags = new Set<string>();
    const allByTokens: string[] = [];
    for (const seed of expandedSeeds) {
      extractTags(seed).forEach((t) => allTags.add(t));
      allByTokens.push(...extractByTokens(seed));
    }

    const uniqueByTokens = Array.from(new Set(allByTokens));
    const resolvedPubkeys = await resolveByTokensToPubkeys(uniqueByTokens);

    if (resolvedPubkeys.length > 0 && allTags.size > 0) {
      const { applySimpleReplacements } = await import('./replacements');
      const baseQuery = baseCore || '';
      const preprocessed = await applySimpleReplacements(baseQuery);

      const filter: NDKFilter = applyDateFilter({
        kinds: effectiveKinds,
        authors: resolvedPubkeys,
        '#t': Array.from(allTags),
        limit: Math.max(limit, 500)
      }, dateFilter) as NDKFilter;

      const residualRaw = preprocessed
        .replace(/\bkind:[^\s]+/gi, ' ')
        .replace(/\bkinds:[^\s]+/gi, ' ')
        .replace(/#[A-Za-z0-9_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const residual = normalizeResidualSearchText(residualRaw);

      if (residual.length > 0) {
        filter.search = nip50Extensions
          ? buildSearchQueryWithExtensions(residual, nip50Extensions)
          : residual;
      }

      const results = await subscribeAndCollect(filter, 10000, chosenRelaySet, abortSignal);
      return sortEventsNewestFirst(results).slice(0, limit);
    }
  }

  const translatedSeeds = expandedSeeds
    .map((seed) => {
      const existingKind = extractKindFilter(seed);
      if (existingKind.kinds && existingKind.kinds.length > 0) {
        return seed;
      }
      const kindTokens = effectiveKinds.map((k) => `kind:${k}`).join(' ');
      return kindTokens ? `${kindTokens} ${seed}`.trim() : seed;
    });

  const seedResults = await searchByAnyTerms(
    translatedSeeds,
    Math.max(limit, 500),
    chosenRelaySet,
    abortSignal,
    nip50Extensions,
    applyDateFilter({ kinds: effectiveKinds }, dateFilter),
    () => getBroadRelaySet()
  );

  return sortEventsNewestFirst(seedResults).slice(0, limit);
}

/**
 * Handle top-level OR queries (OR outside parentheses): normalize the parts,
 * apply the pure-by: optimization and the all-p: profile path, then fall back
 * to per-term searches with a broad-relay retry.
 */
export async function handleTopLevelOr(
  topLevelOrParts: string[],
  ctx: SearchContext
): Promise<NDKEvent[]> {
  const { effectiveKinds, nip50Extensions, chosenRelaySet, relaySetOverride, abortSignal, limit } = ctx;
  const dateFilter = ctx.dateFilter || {};

  const normalizedParts = topLevelOrParts
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<string[]>((acc, part) => {
      const expanded = expandParenthesizedOr(part);
      const treatAsGroup = expanded.length > 1;
      const seeds = treatAsGroup ? expanded : [part];
      seeds.forEach((seed) => {
        const trimmedSeed = seed.trim();
        if (trimmedSeed) acc.push(trimmedSeed);
      });
      return acc;
    }, []);

  // Try optimizing pure by: OR queries (only by: clauses, no other content)
  // Pure by-only OR queries are pre-optimized here and won't reach searchByAnyTerms
  const byOnlyResults = await maybeOptimizeByOnlyOrSeeds(
    normalizedParts,
    effectiveKinds,
    dateFilter,
    nip50Extensions,
    chosenRelaySet,
    abortSignal,
    limit
  );
  if (byOnlyResults !== null) {
    return byOnlyResults;
  }

  // If all OR parts are p:<term>, do profile full-text search across parts
  const isPClause = (s: string) => /^p:\S+/i.test(s);
  if (normalizedParts.length > 0 && normalizedParts.every(isPClause)) {
    const pTerms = normalizedParts.map((s) => s.replace(/^p:/i, '').trim()).filter(Boolean);
    return searchProfilesForTerms(pTerms, limit);
  }

  // Note: Pure by-only OR queries are pre-optimized above and won't reach this path
  let orResults = await searchByAnyTerms(
    normalizedParts,
    Math.max(limit, 500),
    chosenRelaySet,
    abortSignal,
    nip50Extensions,
    applyDateFilter({ kinds: effectiveKinds }, dateFilter),
    () => getBroadRelaySet()
  );

  // If we got no results and we're using NIP-50 relays, try with broader relay set
  if (orResults.length === 0 && !relaySetOverride) {
    const broadRelaySet = await getBroadRelaySet();
    orResults = await searchByAnyTerms(normalizedParts, Math.max(limit, 500), broadRelaySet, abortSignal, nip50Extensions, applyDateFilter({ kinds: effectiveKinds }, dateFilter));
  }

  const filteredResults = orResults.filter((evt) => effectiveKinds.length === 0 || effectiveKinds.includes(evt.kind));
  return sortEventsNewestFirst(filteredResults).slice(0, limit);
}
