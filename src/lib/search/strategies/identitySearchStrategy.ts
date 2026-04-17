import { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import { resolveNip05ToPubkey, profileEventFromPubkey } from '../../vertex';
import { applyDateFilter } from '../queryParsing';
import { subscribeAndCollect } from '../subscriptions';
import { sortEventsNewestFirst } from '../../utils/searchUtils';
import { isNpub, getPubkey } from '../idLookup';
import { SearchContext } from '../types';

/**
 * Handle identity-based searches (npub and NIP-05)
 * Returns null if the query is not an identity search
 */
export async function tryHandleIdentitySearch(
  cleanedQuery: string,
  context: SearchContext
): Promise<NDKEvent[] | null> {
  const { effectiveKinds, dateFilter, chosenRelaySet, abortSignal, limit } = context;

  // Check if the query is a direct npub
  if (isNpub(cleanedQuery)) {
    try {
      const pubkey = getPubkey(cleanedQuery);
      if (!pubkey) return [];

      const res = await subscribeAndCollect(applyDateFilter({
        kinds: effectiveKinds,
        authors: [pubkey],
        limit: Math.max(limit, 200)
      }, dateFilter) as NDKFilter, 8000, chosenRelaySet, abortSignal);
      return sortEventsNewestFirst(res).slice(0, limit);
    } catch (error) {
      console.error('Error processing npub query:', error);
      return [];
    }
  }

  // NIP-05 resolution: '@name@domain' or 'domain.tld' or '@domain.tld'
  const nip05Like = cleanedQuery.match(/^@?([^\s@]+@[^\s@]+|[^\s@]+\.[^\s@]+)$/);
  if (nip05Like) {
    try {
      const pubkey = await resolveNip05ToPubkey(cleanedQuery);
      if (pubkey) {
        const profileEvt = await profileEventFromPubkey(pubkey);
        return [profileEvt];
      }
    } catch {}
  }

  return null;
}

