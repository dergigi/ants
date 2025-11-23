import { NDKEvent, NDKRelaySet, NDKSubscriptionCacheUsage, NDKUser } from '@nostr-dev-kit/ndk';
import { ndk, safeSubscribe } from '../ndk';
import { getStoredPubkey } from '../nip07';
import { relaySets as predefinedRelaySets, RELAYS, extendWithUserAndPremium } from '../relays';
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
 * Fetch user relay URLs from well-known nostr.json
 */
async function getUserRelayUrlsFromWellKnown(pubkey: string, nip05?: string): Promise<string[]> {
  if (!nip05) return [];
  
  try {
    const [, domain] = nip05.includes('@') ? nip05.split('@') : ['_', nip05];
    if (!domain) return [];
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`https://${domain}/.well-known/nostr.json`, { signal: controller.signal });
    clearTimeout(timeout);
    
    if (!res.ok) return [];
    const data = await res.json();
    
    // Check if this pubkey has relays listed in well-known
    const relays = data?.relays?.[pubkey.toLowerCase()];
    if (Array.isArray(relays) && relays.length > 0) {
      return relays
        .filter((r: unknown): r is string => typeof r === 'string')
        .map((r: string) => /^wss?:\/\//i.test(r) ? r : `wss://${r}`);
    }
  } catch (error) {
    console.warn('Failed to fetch relays from well-known:', error);
  }
  
  return [];
}

/**
 * Get user relay URLs from well-known or NIP-65 (kind 10002)
 */
export async function getUserRelayUrls(timeoutMs: number = 6000): Promise<string[]> {
  try {
    const pubkey = getStoredPubkey();
    if (!pubkey) return [];

    // First try to get relays from well-known (faster, more reliable)
    const user = new NDKUser({ pubkey });
    user.ndk = ndk;
    try {
      await user.fetchProfile();
      const wellKnownRelays = await getUserRelayUrlsFromWellKnown(pubkey, user.profile?.nip05);
      if (wellKnownRelays.length > 0) {
        return wellKnownRelays;
      }
    } catch (error) {
      console.warn('Failed to fetch profile for well-known relay lookup:', error);
    }

    // Fallback to NIP-65 (kind 10002) if well-known doesn't have relays
    return await new Promise<string[]>((resolve) => {
      let latest: NDKEvent | null = null;
      const sub = safeSubscribe([{ kinds: [10002], authors: [pubkey], limit: 3 }], { closeOnEose: true, cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY });
      if (!sub) {
        resolve([]);
        return;
      }
      const timer = setTimeout(() => { try { sub.stop(); } catch {}; resolve([]); }, timeoutMs);
      sub.on('event', (e: NDKEvent) => {
        if (!latest || ((e.created_at || 0) > (latest.created_at || 0))) {
          latest = e;
        }
      });
      sub.on('eose', () => {
        clearTimeout(timer);
        if (!latest) return resolve([]);
        const urls = new Set<string>();
        for (const tag of latest.tags as unknown as string[][]) {
          if (Array.isArray(tag) && tag[0] === 'r' && tag[1]) {
            const raw = tag[1];
            const normalized = /^wss?:\/\//i.test(raw) ? raw : `wss://${raw}`;
            urls.add(normalized);
          }
        }
        resolve(Array.from(urls));
      });
      sub.start();
    });
  } catch {
    return [];
  }
}

