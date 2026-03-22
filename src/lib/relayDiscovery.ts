import { NDKEvent, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import { safeSubscribe } from './ndk';
import { RELAY_USER_RELAY_CACHE_DURATION } from './constants';

// Cache for discovered user relays to avoid repeated lookups
const userRelayCache = new Map<string, {
  userRelays: string[];
  blockedRelays: string[];
  searchRelays: string[];
  timestamp: number;
}>();

export function getUserRelayCacheEntry(pubkey: string): typeof userRelayCache extends Map<string, infer V> ? V | undefined : never {
  const cached = userRelayCache.get(pubkey);
  if (cached && (Date.now() - cached.timestamp) < RELAY_USER_RELAY_CACHE_DURATION) {
    return cached;
  }
  return undefined;
}

export function clearUserRelayCache(): void {
  userRelayCache.clear();
}

/**
 * Fetch relay URLs from a replaceable event (kind:10002, 10006, 10007).
 * Accepts the tag names to look for (e.g. ['r'] or ['r', 'relay']).
 */
export async function fetchRelayList(
  pubkey: string,
  kind: number,
  tagNames: string[],
  writeOnly = false
): Promise<string[]> {
  return new Promise<string[]>((resolve) => {
    const sub = safeSubscribe([{ kinds: [kind], authors: [pubkey], limit: 1 }], {
      closeOnEose: true,
      cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
    });

    if (!sub) { resolve([]); return; }

    const timer = setTimeout(() => {
      try { sub.stop(); } catch {}
      resolve([]);
    }, 5000);

    sub.on('event', (event: NDKEvent) => {
      const relays = new Set<string>();
      for (const tag of event.tags) {
        if (!Array.isArray(tag) || !tag[1]) continue;
        if (!tagNames.includes(tag[0])) continue;
        // For kind:10002 write relays, skip read-only entries
        if (writeOnly && tag[2] === 'read') continue;
        const raw = tag[1];
        const normalized = /^wss?:\/\//i.test(raw) ? raw : `wss://${raw}`;
        relays.add(normalized);
      }
      clearTimeout(timer);
      try { sub.stop(); } catch {}
      resolve(Array.from(relays));
    });

    sub.on('eose', () => {
      clearTimeout(timer);
      try { sub.stop(); } catch {}
      resolve([]);
    });

    sub.start();
  });
}

/**
 * Discover user relays as per NIP-51.
 * Fetches kind:10002 (relay list), kind:10006 (blocked), kind:10007 (search).
 */
export async function discoverUserRelays(pubkey: string): Promise<{
  userRelays: string[];
  blockedRelays: string[];
  searchRelays: string[];
}> {
  const cached = getUserRelayCacheEntry(pubkey);
  if (cached) return cached;

  try {
    const [userRelays, blockedRelays, searchRelays] = await Promise.all([
      fetchRelayList(pubkey, 10002, ['r']),
      fetchRelayList(pubkey, 10006, ['r', 'relay']),
      fetchRelayList(pubkey, 10007, ['r', 'relay']),
    ]);

    const result = { userRelays, blockedRelays, searchRelays };
    userRelayCache.set(pubkey, { ...result, timestamp: Date.now() });
    return result;
  } catch (error) {
    console.warn(`[NIP-51] Failed to discover relays for user ${pubkey}:`, error);
    return { userRelays: [], blockedRelays: [], searchRelays: [] };
  }
}
