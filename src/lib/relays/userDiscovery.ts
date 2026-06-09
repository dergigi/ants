import { NDKSubscriptionCacheUsage, NDKEvent } from '@nostr-dev-kit/ndk';
import { safeSubscribe } from '../ndk';
import { getStoredPubkey } from '../nip07';
import { getUserRelayAdditions } from '../storage';
import { RELAY_USER_RELAY_CACHE_DURATION } from '../constants';
import { RELAYS, normalizeRelayUrl } from './config';

// Cache for discovered user relays to avoid repeated lookups
const userRelayCache = new Map<string, {
  userRelays: string[];
  blockedRelays: string[];
  searchRelays: string[];
  timestamp: number
}>();
const USER_RELAY_CACHE_DURATION_MS = RELAY_USER_RELAY_CACHE_DURATION;

export function clearUserRelayCache(): void {
  userRelayCache.clear();
}

/** Fetch the relay URLs from the user's most recent list event of the given kind */
function fetchKindList(kind: number, pubkey: string): Promise<string[]> {
  return new Promise<string[]>((resolve) => {
    const sub = safeSubscribe([{ kinds: [kind], authors: [pubkey], limit: 1 }], {
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
        if (Array.isArray(tag) && tag[0] === 'r' && tag[1]) {
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
}

// Discover user relays as per NIP-51
export async function discoverUserRelays(pubkey: string): Promise<{
  userRelays: string[];
  blockedRelays: string[];
  searchRelays: string[];
}> {
  // Check cache first
  const cached = userRelayCache.get(pubkey);
  if (cached && (Date.now() - cached.timestamp) < USER_RELAY_CACHE_DURATION_MS) {
    return cached;
  }

  try {
    // kind:10002 relay list, kind:10006 blocked relays, kind:10007 search relays
    const userRelays = await fetchKindList(10002, pubkey);
    const blockedRelays = await fetchKindList(10006, pubkey);
    const searchRelays = await fetchKindList(10007, pubkey);

    const result = { userRelays, blockedRelays, searchRelays };

    // Cache the result
    userRelayCache.set(pubkey, { ...result, timestamp: Date.now() });

    return result;
  } catch (error) {
    console.warn(`[NIP-51] Failed to discover relays for user ${pubkey}:`, error);
    return { userRelays: [], blockedRelays: [], searchRelays: [] };
  }
}

export async function extendWithUserAndPremium(
  relayUrls: readonly string[],
  options: { includeSearchRelays?: boolean } = {}
): Promise<string[]> {
  const { includeSearchRelays = false } = options;
  const relaySet = new Set<string>();
  const addRelay = (url: string, blocked: Set<string>) => {
    const normalized = normalizeRelayUrl(url);
    if (!normalized || blocked.has(normalized)) return;
    relaySet.add(normalized);
  };

  const initialBlocked = new Set<string>();
  for (const url of relayUrls) {
    addRelay(url, initialBlocked);
  }

  const pubkey = getStoredPubkey();
  const manualRelays = getUserRelayAdditions();

  if (!pubkey) {
    manualRelays.forEach((relay) => addRelay(relay, initialBlocked));
    return Array.from(relaySet);
  }

  const { userRelays, blockedRelays, searchRelays } = await discoverUserRelays(pubkey);
  const blockedSet = new Set(blockedRelays.map(normalizeRelayUrl));

  for (const blocked of blockedSet) {
    relaySet.delete(blocked);
  }

  userRelays.forEach((relay) => addRelay(relay, blockedSet));
  manualRelays.forEach((relay) => addRelay(relay, blockedSet));
  RELAYS.PREMIUM.forEach((relay) => addRelay(relay, blockedSet));
  if (includeSearchRelays) {
    searchRelays.forEach((relay) => addRelay(relay, blockedSet));
  }

  return Array.from(relaySet);
}
