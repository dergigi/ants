import { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { getStoredPubkey } from '../../nip07';
import { resolveAuthor } from '../../vertex';
import { sortEventsNewestFirst } from '../../utils/searchUtils';
import { applyDateFilter } from '../queryParsing';
import { getBroadRelaySet } from '../relayManagement';
import { buildSearchQueryWithExtensions } from '../searchUtils';
import { subscribeAndCollect } from '../subscriptions';
import { SearchContext } from '../types';

type TagPFilter = NDKFilter & { '#p'?: string[] };

function getLoggedInPubkey(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return getStoredPubkey();
  } catch {
    return null;
  }
}

async function resolveAuthorTokens(tokens: string[]): Promise<string[]> {
  const results = await Promise.all(tokens.map(async (token) => {
    try {
      if (/^@me$/i.test(token)) {
        const pubkey = getLoggedInPubkey();
        return pubkey ? [pubkey] : [];
      }
      if (/^[0-9a-f]{64}$/i.test(token)) {
        return [token.toLowerCase()];
      }
      if (/^npub1[0-9a-z]+$/i.test(token)) {
        return [nip19.decode(token).data as string];
      }
      const resolved = await resolveAuthor(token);
      return resolved.pubkeyHex ? [resolved.pubkeyHex] : [];
    } catch (error) {
      console.warn(`Failed to resolve author ${token}:`, error);
      return [];
    }
  }));

  return [...new Set(results.flat())];
}

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
