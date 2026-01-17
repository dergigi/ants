import { NDKEvent, NDKRelaySet, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import { ndk, safeSubscribe } from '../ndk';
import { relaySets as predefinedRelaySets, RELAYS, extendWithUserAndPremium, getRelayInfo } from '../relays';
import { getUserRelayAdditions } from '../storage';

// Use a search-capable relay set explicitly for NIP-50 queries (lazy, async)
let searchRelaySetPromise: Promise<NDKRelaySet> | null = null;

/**
 * Get the search-capable relay set for NIP-50 queries
 */
export async function getSearchRelaySet(): Promise<NDKRelaySet> {
  if (!searchRelaySetPromise) searchRelaySetPromise = predefinedRelaySets.search();
  return searchRelaySetPromise;
}

/**
 * Get a broad relay set including default, search, user, and premium relays
 */
export async function getBroadRelaySet(): Promise<NDKRelaySet> {
  const base = await extendWithUserAndPremium([...RELAYS.DEFAULT, ...RELAYS.SEARCH]);
  const manual = getUserRelayAdditions();
  const combined = new Set<string>([...base, ...manual]);
  return NDKRelaySet.fromRelayUrls(Array.from(combined), ndk);
}

/**
 * Get NIP-50 capable relays for a specific author's search
 * Fetches the author's relay list (kind 10002) and tests their "write" relays for NIP-50 support
 */
export async function getOutboxSearchCapableRelays(authorPubkey: string): Promise<string[]> {
  try {
    // Get user's relay list (kind:10002) - used for general relay connections
    const candidateRelays = await new Promise<string[]>((resolve) => {
      const sub = safeSubscribe([{ kinds: [10002], authors: [authorPubkey], limit: 1 }], {
        closeOnEose: true,
        cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY
      });

      if (!sub) {
        resolve([]);
        return;
      }

      const timer = setTimeout(() => {
        try { sub.stop(); } catch {}
        resolve([]);
      }, 5000);

      sub.on('event', (event: NDKEvent) => {
        const relays = new Set<string>();
        for (const tag of event.tags) {
          if (tag[0] === 'r' && tag[1] && (tag[2] === 'write' || !tag[2])) {
            const raw = tag[1];
            const normalized = /^wss?:\/\//i.test(raw) ? raw : `wss://${raw}`;
            relays.add(normalized);
          }
        }
        const arr = Array.from(relays);
        clearTimeout(timer);
        try { sub.stop(); } catch {}
        resolve(arr);
      });

      sub.on('eose', () => {
        clearTimeout(timer);
        try { sub.stop(); } catch {}
        resolve([]);
      });

      sub.start();
    });

    // Test each candidate relay for NIP-50 support using NIP-11
    const relayCheckPromises = candidateRelays.map(async (relayUrl: string) => {
      try {
        const relayInfo = await getRelayInfo(relayUrl);
        const supportsNip50 = relayInfo.supportedNips?.includes(50) || false;
        return { relayUrl, supportsNip50 };
      } catch (error) {
        console.warn(`Failed to test ${relayUrl} for NIP-50 support:`, error);
        return { relayUrl, supportsNip50: false };
      }
    });

    const results = await Promise.allSettled(relayCheckPromises);
    const nip50Relays: string[] = [];
    results.forEach((result: PromiseSettledResult<{relayUrl: string; supportsNip50: boolean}>) => {
      if (result.status === 'fulfilled' && result.value.supportsNip50) {
        nip50Relays.push(result.value.relayUrl);
      }
    });

    return nip50Relays
  } catch {
    return []
  }
}
