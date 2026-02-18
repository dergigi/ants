import { NDKEvent, NDKFilter, NDKRelaySet, NDKRelay } from '@nostr-dev-kit/ndk';
import { ndk } from '../../ndk';
import { RELAYS } from '../../relays';
import { applyDateFilter } from '../queryParsing';
import { buildSearchQueryWithExtensions } from '../searchUtils';
import { expandParenthesizedOr } from '../queryTransforms';
import { subscribeAndCollect } from '../subscriptions';
import { searchByAnyTerms } from '../termSearch';
import { resolveAuthorTokens } from '../authorResolve';
import { getBroadRelaySet, getOutboxSearchCapableRelays } from '../relayManagement';
import { sortEventsNewestFirst } from '../../utils/searchUtils';
import { SearchContext } from '../types';

/**
 * Handle author filter queries (by:<author>)
 * Supports multiple by: tokens (e.g., "bitcoin by:alice by:bob")
 * Returns null if the query is not an author search
 */
export async function tryHandleAuthorSearch(
  cleanedQuery: string,
  context: SearchContext
): Promise<NDKEvent[] | null> {
  const { effectiveKinds, dateFilter, nip50Extensions, chosenRelaySet, abortSignal, limit } = context;

  // Extract ALL by: tokens with a global regex
  const byMatches = Array.from(cleanedQuery.matchAll(/\bby:(\S+)/gi));
  if (byMatches.length === 0) {
    return null;
  }

  const authorTokens = Array.from(new Set(byMatches.map(m => m[1]).filter(Boolean)));
  // Strip all by: tokens cleanly to get the residual search text
  const terms = cleanedQuery.replace(/\bby:\S+/gi, '').replace(/\s+/g, ' ').trim();

  // Resolve deduplicated author tokens to hex pubkeys in parallel
  const pubkeys = await resolveAuthorTokens(authorTokens);

  if (pubkeys.length === 0) {
    return [];
  }

  const filters: NDKFilter = applyDateFilter({
    kinds: effectiveKinds,
    authors: pubkeys,
    limit: Math.max(limit, 200)
  }, dateFilter) as NDKFilter;

  // Add search term to the filter if present
  if (terms) {
    const seedExpansions2 = expandParenthesizedOr(terms);
    if (seedExpansions2.length === 1) {
      filters.search = nip50Extensions
        ? buildSearchQueryWithExtensions(terms, nip50Extensions)
        : terms;
      filters.limit = Math.max(limit, 200);
    }
  }

  // Get author-specific relays that support NIP-50 in parallel for all authors
  const authorRelaySet = chosenRelaySet;
  try {
    const outboxResults = await Promise.allSettled(
      pubkeys.map(pk => getOutboxSearchCapableRelays(pk))
    );
    for (const result of outboxResults) {
      if (result.status === 'fulfilled') {
        for (const relay of result.value) {
          authorRelaySet.addRelay(new NDKRelay(relay, undefined, ndk));
        }
      }
    }
  } catch (error) {
    console.warn('Failed to get author-specific relays, using chosen relay set:', error);
  }

  // Fetch by base terms if any, restricted to resolved authors
  let res: NDKEvent[] = [];
  if (terms) {
    const seedExpansions3 = expandParenthesizedOr(terms);
    if (seedExpansions3.length > 1) {
      const seen = new Set<string>();
      for (const seed of seedExpansions3) {
        try {
          const searchQuery = nip50Extensions
            ? buildSearchQueryWithExtensions(seed, nip50Extensions)
            : seed;
          const f: NDKFilter = applyDateFilter({ kinds: effectiveKinds, authors: pubkeys, search: searchQuery, limit: Math.max(limit, 200) }, dateFilter) as NDKFilter;
          const r = await subscribeAndCollect(f, 8000, authorRelaySet, abortSignal);
          for (const e of r) { if (!seen.has(e.id)) { seen.add(e.id); res.push(e); } }
        } catch {}
      }
    } else {
      res = await subscribeAndCollect(filters, 8000, authorRelaySet, abortSignal);
    }
  } else {
    res = await subscribeAndCollect(filters, 8000, authorRelaySet, abortSignal);
  }

  // If the remaining terms contain parenthesized OR seeds like (a OR b), run a seeded OR search too
  const seedMatches = Array.from(terms.matchAll(/\(([^)]+\s+OR\s+[^)]+)\)/gi));
  const seedTerms: string[] = [];
  for (const m of seedMatches) {
    const inner = (m[1] || '').trim();
    if (!inner) continue;
    inner.split(/\s+OR\s+/i).forEach((t) => {
      const token = t.trim();
      if (token) seedTerms.push(token);
    });
  }
  if (seedTerms.length > 0) {
    try {
       const seeded = await searchByAnyTerms(
         seedTerms,
         limit,
         authorRelaySet,
         abortSignal,
         nip50Extensions,
         applyDateFilter({ authors: pubkeys, kinds: effectiveKinds }, dateFilter),
         () => getBroadRelaySet()
       );
      res = [...res, ...seeded];
    } catch {}
  }
  // Fallback: if no results, try a broader relay set (default + search)
  const broadRelays = Array.from(new Set<string>([...RELAYS.DEFAULT, ...RELAYS.SEARCH]));
  const broadRelaySet = NDKRelaySet.fromRelayUrls(broadRelays, ndk);
  if (res.length === 0) {
    try {
      res = await subscribeAndCollect(filters, 10000, authorRelaySet, abortSignal);
    } catch (error) {
      console.warn('Author relay set fallback failed, using broad relay set:', error);
    }
    if (res.length === 0) {
      res = await subscribeAndCollect(filters, 10000, broadRelaySet, abortSignal);
    }
  }
  // Additional fallback for very short terms (e.g., "GM") or stubborn empties:
  // some relays require >=3 chars for NIP-50 search; fetch author-only and filter client-side
  const termStr = terms.trim();
  const hasShortToken = termStr.length > 0 && termStr.split(/\s+/).some((t) => t.length < 3);
  if (res.length === 0 && termStr) {
    const authorOnly = await subscribeAndCollect(applyDateFilter({ kinds: effectiveKinds, authors: pubkeys, limit: Math.max(limit, 600) }, dateFilter) as NDKFilter, 10000, broadRelaySet, abortSignal);
    const needle = termStr.toLowerCase();
    res = authorOnly.filter((e) => (e.content || '').toLowerCase().includes(needle));
  } else if (res.length === 0 && hasShortToken) {
    const authorOnly = await subscribeAndCollect(applyDateFilter({ kinds: effectiveKinds, authors: pubkeys, limit: Math.max(limit, 600) }, dateFilter) as NDKFilter, 10000, broadRelaySet, abortSignal);
    const needle = termStr.toLowerCase();
    res = authorOnly.filter((e) => (e.content || '').toLowerCase().includes(needle));
  }
  let mergedResults: NDKEvent[] = res;
  // Dedupe
  const dedupe = new Map<string, NDKEvent>();
  for (const e of mergedResults) { if (!dedupe.has(e.id)) dedupe.set(e.id, e); }
  mergedResults = Array.from(dedupe.values());
  // Do not enforce additional client-side text match; rely on relay-side search
  const filtered = mergedResults;

  return sortEventsNewestFirst(filtered).slice(0, limit);
}
