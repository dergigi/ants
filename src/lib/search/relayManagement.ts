import { NDKRelaySet } from '@nostr-dev-kit/ndk';
import { ndk } from '../ndk';
import { RELAYS, isPrivateRelay } from '../relayConfig';
import { fetchRelayList } from '../relayDiscovery';
import { getRelayInfo } from '../relayInfo';
import { relaySets as predefinedRelaySets, extendWithUserAndPremium } from '../relaySets';
import { getUserRelayAdditions } from '../storage';
import { filterDeadRelays } from '../nip66';

let searchRelaySetPromise: Promise<NDKRelaySet> | null = null;

export async function getSearchRelaySet(): Promise<NDKRelaySet> {
  if (!searchRelaySetPromise) searchRelaySetPromise = predefinedRelaySets.search();
  return searchRelaySetPromise;
}

export async function getBroadRelaySet(): Promise<NDKRelaySet> {
  const base = await extendWithUserAndPremium([...RELAYS.DEFAULT, ...RELAYS.SEARCH]);
  const manual = getUserRelayAdditions();
  const combined = Array.from(new Set<string>([...base, ...manual]));
  const live = filterDeadRelays(combined);
  return NDKRelaySet.fromRelayUrls(live, ndk);
}

/**
 * Get NIP-50 capable relays from an author's kind:10002 write relay list.
 * Filters out dead and private/LAN relays before probing.
 */
export async function getOutboxSearchCapableRelays(authorPubkey: string): Promise<string[]> {
  try {
    const candidateRelays = await fetchRelayList(authorPubkey, 10002, ['r'], true);

    // Filter dead and private relays before expensive NIP-11 probing.
    // Private relays are unreachable from a public origin and trigger
    // Chrome's Local Network Access prompt (#216).
    const liveCandidates = filterDeadRelays(candidateRelays).filter((url) => !isPrivateRelay(url));

    const results = await Promise.allSettled(
      liveCandidates.map(async (relayUrl) => {
        try {
          const info = await getRelayInfo(relayUrl);
          return { relayUrl, supportsNip50: info.supportedNips?.includes(50) || false };
        } catch (error) {
          console.warn(`Failed to test ${relayUrl} for NIP-50 support:`, error);
          return { relayUrl, supportsNip50: false };
        }
      })
    );

    return results
      .filter((r): r is PromiseFulfilledResult<{ relayUrl: string; supportsNip50: boolean }> =>
        r.status === 'fulfilled' && r.value.supportsNip50)
      .map((r) => r.value.relayUrl);
  } catch {
    return [];
  }
}
