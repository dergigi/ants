import { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import { sortEventsNewestFirst } from '../../utils/searchUtils';
import { applyDateFilter } from '../queryParsing';
import { getBroadRelaySet } from '../relayManagement';
import { resolveAuthorTokens } from '../authorResolve';
import { buildSearchQueryWithExtensions } from '../searchUtils';
import { subscribeAndCollect } from '../subscriptions';
import { SearchContext } from '../types';

type TagPFilter = NDKFilter & { '#p'?: string[] };

export async function tryHandleMentionsSearch(
  cleanedQuery: string,
  context: SearchContext
): Promise<NDKEvent[] | null> {
  const { effectiveKinds, dateFilter, nip50Extensions, chosenRelaySet, abortSignal, limit, onPartialResults } = context;
  const matches = Array.from(cleanedQuery.matchAll(/\bmentions:(\S+)/gi));
  if (matches.length === 0) return null;

  const mentionTokens = Array.from(new Set(matches.map((match) => match[1]).filter(Boolean)));
  const terms = cleanedQuery.replace(/\bmentions:\S+/gi, '').replace(/\s+/g, ' ').trim();
  const pubkeys = await resolveAuthorTokens(mentionTokens);
  if (pubkeys.length === 0) return [];

  const filter = applyDateFilter({
    kinds: effectiveKinds,
    '#p': pubkeys,
    limit: Math.max(limit, 500)
  }, dateFilter) as TagPFilter;

  if (terms) {
    filter.search = nip50Extensions
      ? buildSearchQueryWithExtensions(terms, nip50Extensions)
      : terms;
  }

  const byMatches = Array.from(terms.matchAll(/\bby:(\S+)/gi));
  if (byMatches.length > 0) {
    const authorTokens = Array.from(new Set(byMatches.map((match) => match[1]).filter(Boolean)));
    const authorPubkeys = await resolveAuthorTokens(authorTokens);
    if (authorPubkeys.length === 0) {
      return [];
    }
    filter.authors = authorPubkeys;

    const searchTerms = terms.replace(/\bby:\S+/gi, '').replace(/\s+/g, ' ').trim();
    if (searchTerms) {
      filter.search = nip50Extensions
        ? buildSearchQueryWithExtensions(searchTerms, nip50Extensions)
        : searchTerms;
    } else {
      delete filter.search;
    }
  }

  const relaySet = filter.search ? chosenRelaySet : await getBroadRelaySet();

  let results: NDKEvent[];
  try {
    results = await subscribeAndCollect(filter, { timeoutMs: 10000, relaySet, abortSignal, onPartial: onPartialResults });
  } catch {
    results = await subscribeAndCollect(filter, { timeoutMs: 10000, relaySet: chosenRelaySet, abortSignal, onPartial: onPartialResults });
  }

  const deduped = new Map<string, NDKEvent>();
  for (const event of results) {
    if (!deduped.has(event.id)) deduped.set(event.id, event);
  }

  return sortEventsNewestFirst(Array.from(deduped.values())).slice(0, limit);
}
