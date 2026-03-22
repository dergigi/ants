import { NDKEvent, NDKFilter, NDKRelaySet, NDKRelay } from '@nostr-dev-kit/ndk';
import { ndk } from '../../ndk';
import { RELAYS } from '../../relays';
import { applyDateFilter } from '../queryParsing';
import { buildSearchQueryWithExtensions } from '../searchUtils';
import { expandParenthesizedOr } from '../queryTransforms';
import { subscribeAndCollect } from '../subscriptions';
import { searchByAnyTerms } from '../termSearch';
import { resolveAuthorTokens } from '../authorResolve';
import { getOutboxSearchCapableRelays } from '../relayManagement';
import { sortEventsNewestFirst } from '../../utils/searchUtils';
import { applyContentFilter } from '../contentFilter';
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
  const { effectiveKinds, dateFilter, nip50Extensions, nip50RelaySet, broadRelaySet, abortSignal, limit } = context;

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

  // Extract hashtags from terms as #t tag filters (direct query, no NIP-50 needed)
  const tagMatches = Array.from(terms.match(/#[A-Za-z0-9_]+/gi) || [])
    .map((t) => t.slice(1).toLowerCase());
  // Residual text after stripping hashtags — this is what actually needs NIP-50
  const searchText = terms.replace(/#[A-Za-z0-9_]+/g, ' ').replace(/\s+/g, ' ').trim();

  const filters: NDKFilter = applyDateFilter({
    kinds: effectiveKinds,
    authors: pubkeys,
    limit: Math.max(limit, 200),
    ...(tagMatches.length > 0 && { '#t': Array.from(new Set(tagMatches)) })
  }, dateFilter) as NDKFilter;

  // Add search term to the filter only if there's residual text (requires NIP-50)
  if (searchText) {
    const seedExpansions2 = expandParenthesizedOr(searchText);
    if (seedExpansions2.length === 1) {
      filters.search = nip50Extensions
        ? buildSearchQueryWithExtensions(searchText, nip50Extensions)
        : searchText;
      filters.limit = Math.max(limit, 200);
    }
  }

  // Determine whether this query needs NIP-50 search support
  const needsNip50 = searchText.length > 0;

  // Pick the right base relay set: NIP-50 for text search, broad for structured queries.
  // Clone so author-specific outbox relays don't pollute the shared set (#227).
  const baseRelaySet = needsNip50 ? nip50RelaySet : broadRelaySet;
  const authorRelaySet = new NDKRelaySet(new Set(baseRelaySet.relays), ndk);
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

  // Fetch events, restricted to resolved authors.
  // Search queries (has searchText) → NIP-50 relays only.
  // Direct queries (no searchText, just authors/kinds/tags) → all relays.
  let res: NDKEvent[] = [];

  if (needsNip50) {
    // Text + author query: only use NIP-50 search relays (they honor the search field)
    const seedExpansions3 = expandParenthesizedOr(searchText);
    if (seedExpansions3.length > 1) {
      const seen = new Set<string>();
      for (const seed of seedExpansions3) {
        try {
          const searchQuery = nip50Extensions
            ? buildSearchQueryWithExtensions(seed, nip50Extensions)
            : seed;
          const f: NDKFilter = applyDateFilter({
            kinds: effectiveKinds, authors: pubkeys, search: searchQuery,
            limit: Math.max(limit, 200),
            ...(tagMatches.length > 0 && { '#t': Array.from(new Set(tagMatches)) })
          }, dateFilter) as NDKFilter;
          const r = await subscribeAndCollect(f, 8000, authorRelaySet, abortSignal);
          for (const e of r) { if (!seen.has(e.id)) { seen.add(e.id); res.push(e); } }
        } catch (err) {
          console.warn('Author search seed fetch failed for:', seed, err);
        }
      }
    } else {
      res = await subscribeAndCollect(filters, 8000, authorRelaySet, abortSignal);
    }

    // Parenthesized OR seeds within the search text
    const seedMatches = Array.from(searchText.matchAll(/\(([^)]+\s+OR\s+[^)]+)\)/gi));
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
          seedTerms, limit, authorRelaySet, abortSignal, nip50Extensions,
          applyDateFilter({ authors: pubkeys, kinds: effectiveKinds }, dateFilter)
        );
        res = [...res, ...seeded];
      } catch (err) {
        console.warn('Author search OR seed fetch failed:', err);
      }
    }
  } else {
    // Direct query (authors + kinds + tags, no search text): all relays are fine.
    res = await subscribeAndCollect(filters, 8000, authorRelaySet, abortSignal);
    if (res.length === 0) {
      const broadRelays = Array.from(new Set<string>([...RELAYS.DEFAULT, ...RELAYS.SEARCH]));
      const broadRelaySet = NDKRelaySet.fromRelayUrls(broadRelays, ndk);
      res = await subscribeAndCollect(filters, 10000, broadRelaySet, abortSignal);
    }
  }

  // Dedupe
  const dedupe = new Map<string, NDKEvent>();
  for (const e of res) { if (!dedupe.has(e.id)) dedupe.set(e.id, e); }
  let results = Array.from(dedupe.values());

  // Apply client-side content filter when there's search text.
  // Catches any relay that doesn't properly honor the search field.
  if (needsNip50) {
    results = applyContentFilter(results, searchText);
  }

  return sortEventsNewestFirst(results).slice(0, limit);
}
