import { NDKEvent, NDKFilter, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { ndk } from '../../ndk';
import { profileEventFromPubkey, resolveAuthor } from '../../vertex';
import { RELAYS } from '../../relays';
import { applyDateFilter } from '../queryParsing';
import { buildSearchQueryWithExtensions } from '../searchUtils';
import { expandParenthesizedOr } from '../queryTransforms';
import { subscribeAndCollect } from '../subscriptions';
import { searchByAnyTerms } from '../termSearch';
import { getBroadRelaySet } from '../relayManagement';
import { sortEventsNewestFirst } from '../../utils/searchUtils';
import { SearchContext } from '../types';

function extractMuteListPubkeys(events: NDKEvent[]): string[] {
  const newestByAuthor = new Map<string, NDKEvent>();

  for (const event of sortEventsNewestFirst(events)) {
    const authorPubkey = event.pubkey || event.author?.pubkey;
    if (!authorPubkey || newestByAuthor.has(authorPubkey)) continue;
    newestByAuthor.set(authorPubkey, event);
  }

  const seen = new Set<string>();
  const pubkeys: string[] = [];

  for (const event of newestByAuthor.values()) {
    for (const tag of event.tags as string[][]) {
      const rawPubkey = Array.isArray(tag) && tag[0] === 'p' && typeof tag[1] === 'string' ? tag[1] : '';
      const pubkey = rawPubkey.trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/i.test(pubkey) || seen.has(pubkey)) continue;
      seen.add(pubkey);
      pubkeys.push(pubkey);
    }
  }

  return pubkeys;
}

async function expandMuteListResults(events: NDKEvent[]): Promise<NDKEvent[]> {
  const pubkeys = extractMuteListPubkeys(events);
  if (pubkeys.length === 0) return [];

  const profiles = await Promise.all(pubkeys.map(async (pubkey) => {
    try {
      return await profileEventFromPubkey(pubkey);
    } catch {
      return null;
    }
  }));

  return profiles.filter((event): event is NDKEvent => event !== null);
}

/**
 * Handle author filter queries (by:<author>)
 * Returns null if the query is not an author search
 */
export async function tryHandleAuthorSearch(
  cleanedQuery: string,
  context: SearchContext
): Promise<NDKEvent[] | null> {
  const { effectiveKinds, dateFilter, nip50Extensions, chosenRelaySet, abortSignal, limit, onPartialResults } = context;
  
  const authorMatch = cleanedQuery.match(/(?:^|\s)by:(\S+)(?:\s|$)/i);
  if (!authorMatch) {
    return null;
  }
  
  const [, author] = authorMatch;
  // Extract search terms by removing the author filter
  const terms = cleanedQuery.replace(/(?:^|\s)by:(\S+)(?:\s|$)/i, '').trim();

  let pubkey: string | null = null;
  try {
    // Unified resolver handles npub, nip05, and username with a single DVM attempt
    const resolved = await resolveAuthor(author);
    pubkey = resolved.pubkeyHex;
  } catch (error) {
    console.error('Error resolving author:', error);
  }

  if (!pubkey) {
    return [];
  }

  const filters: NDKFilter = applyDateFilter({
    kinds: effectiveKinds,
    authors: [pubkey],
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

  // Fetch by base terms if any, restricted to author
  let res: NDKEvent[] = [];
  if (terms) {
    const seedExpansions3 = expandParenthesizedOr(terms);
    if (seedExpansions3.length > 1) {
      const perSeed = await Promise.all(seedExpansions3.map(async (seed) => {
        try {
          const searchQuery = nip50Extensions 
            ? buildSearchQueryWithExtensions(seed, nip50Extensions)
            : seed;
          const f: NDKFilter = applyDateFilter({ kinds: effectiveKinds, authors: [pubkey], search: searchQuery, limit: Math.max(limit, 200) }, dateFilter) as NDKFilter;
          return await subscribeAndCollect(f, { timeoutMs: 8000, relaySet: chosenRelaySet, abortSignal, onPartial: onPartialResults });
        } catch { return []; }
      }));
      const seen = new Set<string>();
      for (const r of perSeed) {
        for (const e of r) { if (!seen.has(e.id)) { seen.add(e.id); res.push(e); } }
      }
    } else {
      res = await subscribeAndCollect(filters, { timeoutMs: 8000, relaySet: chosenRelaySet, abortSignal, onPartial: onPartialResults });
    }
  } else {
    res = await subscribeAndCollect(filters, { timeoutMs: 8000, relaySet: chosenRelaySet, abortSignal, onPartial: onPartialResults });
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
        chosenRelaySet,
        abortSignal,
        nip50Extensions,
        applyDateFilter({ authors: [pubkey], kinds: effectiveKinds }, dateFilter),
        () => getBroadRelaySet(),
        onPartialResults
      );
      res = [...res, ...seeded];
    } catch {}
  }
  // Fallback: if no results, try a broader relay set (default + search)
  const broadRelays = Array.from(new Set<string>([...RELAYS.DEFAULT, ...RELAYS.SEARCH]));
  const broadRelaySet = NDKRelaySet.fromRelayUrls(broadRelays, ndk);
  if (res.length === 0) {
    res = await subscribeAndCollect(filters, { timeoutMs: 10000, relaySet: broadRelaySet, abortSignal, onPartial: onPartialResults });
  }
  // Additional fallback for very short terms (e.g., "GM") or stubborn empties:
  // some relays require >=3 chars for NIP-50 search; fetch author-only and filter client-side
  const termStr = terms.trim();
  const hasShortToken = termStr.length > 0 && termStr.split(/\s+/).some((t) => t.length < 3);
  // No onPartial here: these fetch all author events and filter client-side,
  // so partials would surface unrelated notes
  if (res.length === 0 && termStr) {
    const authorOnly = await subscribeAndCollect(applyDateFilter({ kinds: effectiveKinds, authors: [pubkey], limit: Math.max(limit, 600) }, dateFilter) as NDKFilter, { timeoutMs: 10000, relaySet: broadRelaySet, abortSignal });
    const needle = termStr.toLowerCase();
    res = authorOnly.filter((e) => (e.content || '').toLowerCase().includes(needle));
  } else if (res.length === 0 && hasShortToken) {
    const authorOnly = await subscribeAndCollect(applyDateFilter({ kinds: effectiveKinds, authors: [pubkey], limit: Math.max(limit, 600) }, dateFilter) as NDKFilter, { timeoutMs: 10000, relaySet: broadRelaySet, abortSignal });
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

  if (effectiveKinds.length === 1 && effectiveKinds[0] === 10000 && !termStr) {
    const profiles = await expandMuteListResults(filtered);
    if (profiles.length > 0) return profiles;
  }
  
  return sortEventsNewestFirst(filtered).slice(0, limit);
}
