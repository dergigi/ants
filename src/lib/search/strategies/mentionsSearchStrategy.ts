import { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import { applyDateFilter } from '../queryParsing';
import { buildSearchQueryWithExtensions } from '../searchUtils';
import { subscribeAndCollect } from '../subscriptions';
import { resolveAuthorTokens } from '../authorResolve';
import { getBroadRelaySet } from '../relayManagement';
import { sortEventsNewestFirst } from '../../utils/searchUtils';
import { SearchContext } from '../types';

type TagPFilter = NDKFilter & { '#p'?: string[] };

/**
 * Handle mentions filter queries (mentions:<user>)
 * Finds events that mention a specific user via NIP-27 p-tags.
 * Supports multiple mentions: tokens (e.g., "bitcoin mentions:alice mentions:bob")
 * Returns null if the query does not contain mentions: tokens.
 */
export async function tryHandleMentionsSearch(
  cleanedQuery: string,
  context: SearchContext
): Promise<NDKEvent[] | null> {
  const { effectiveKinds, dateFilter, nip50Extensions, chosenRelaySet, abortSignal, limit } = context;

  const mentionsMatches = Array.from(cleanedQuery.matchAll(/\bmentions:(\S+)/gi));
  if (mentionsMatches.length === 0) {
    return null;
  }

  const mentionTokens = Array.from(new Set(mentionsMatches.map(m => m[1]).filter(Boolean)));
  const terms = cleanedQuery.replace(/\bmentions:\S+/gi, '').replace(/\s+/g, ' ').trim();

  const pubkeys = await resolveAuthorTokens(mentionTokens);

  if (pubkeys.length === 0) {
    return [];
  }

  // Build filter using #p tag to find events mentioning these pubkeys
  const filters: TagPFilter = applyDateFilter({
    kinds: effectiveKinds,
    '#p': pubkeys,
    limit: Math.max(limit, 500)
  }, dateFilter) as TagPFilter;

  // Add search term if present
  if (terms) {
    (filters as NDKFilter).search = nip50Extensions
      ? buildSearchQueryWithExtensions(terms, nip50Extensions)
      : terms;
  }

  // Also check for by: tokens in the residual terms to combine with author filter
  const byMatches = Array.from(terms.matchAll(/\bby:(\S+)/gi));
  if (byMatches.length > 0) {
    const authorTokens = Array.from(new Set(byMatches.map(m => m[1]).filter(Boolean)));
    const authorPubkeys = await resolveAuthorTokens(authorTokens);
    if (authorPubkeys.length > 0) {
      (filters as NDKFilter).authors = authorPubkeys;
    }
    // Strip by: from the search field
    const searchTerms = terms.replace(/\bby:\S+/gi, '').replace(/\s+/g, ' ').trim();
    if (searchTerms) {
      (filters as NDKFilter).search = nip50Extensions
        ? buildSearchQueryWithExtensions(searchTerms, nip50Extensions)
        : searchTerms;
    } else {
      delete (filters as NDKFilter).search;
    }
  }

  // When a search term is present, use NIP-50 relays (chosenRelaySet) so the
  // `search` field is actually evaluated. Non-NIP-50 relays silently ignore it
  // and return all #p matches, polluting results.
  const hasSearchTerm = Boolean((filters as NDKFilter).search);
  const primaryRelaySet = hasSearchTerm ? chosenRelaySet : await getBroadRelaySet();

  let res: NDKEvent[];
  try {
    res = await subscribeAndCollect(filters, 10000, primaryRelaySet, abortSignal);
  } catch (error) {
    // Fallback to chosen relay set (already NIP-50 capable)
    res = await subscribeAndCollect(filters, 10000, chosenRelaySet, abortSignal);
  }

  // Dedupe
  const dedupe = new Map<string, NDKEvent>();
  for (const e of res) { if (!dedupe.has(e.id)) dedupe.set(e.id, e); }

  return sortEventsNewestFirst(Array.from(dedupe.values())).slice(0, limit);
}
