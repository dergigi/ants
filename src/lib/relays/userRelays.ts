import { NDKEvent, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import { RELAY_USER_RELAY_CACHE_DURATION } from '../constants';
import { safeSubscribe } from '../ndk';
import { getUserRelayAdditions } from '../storage';
import { getStoredPubkey } from '../authStorage';
import { RELAYS } from './config';
import { normalizeRelayUrlInternal } from './relayInfo';
import type { UserRelayDiscovery } from './types';

const userRelayCache = new Map<string, UserRelayDiscovery & { timestamp: number }>();
const USER_RELAY_CACHE_DURATION_MS = RELAY_USER_RELAY_CACHE_DURATION;

async function fetchRelayList(kind: number, pubkey: string): Promise<string[]> {
  return await new Promise<string[]>((resolve) => {
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

export async function discoverUserRelays(pubkey: string): Promise<UserRelayDiscovery> {
  const cached = userRelayCache.get(pubkey);
  if (cached && Date.now() - cached.timestamp < USER_RELAY_CACHE_DURATION_MS) {
    return cached;
  }

  try {
    const [userRelays, blockedRelays, searchRelays] = await Promise.all([
      fetchRelayList(10002, pubkey),
      fetchRelayList(10006, pubkey),
      fetchRelayList(10007, pubkey)
    ]);

    const result = { userRelays, blockedRelays, searchRelays };
    userRelayCache.set(pubkey, { ...result, timestamp: Date.now() });
    return result;
  } catch (error) {
    console.warn(`[NIP-51] Failed to discover relays for user ${pubkey}:`, error);
    return { userRelays: [], blockedRelays: [], searchRelays: [] };
  }
}

export function clearUserRelayCache(): void {
  userRelayCache.clear();
}

export async function extendWithUserAndPremium(
  relayUrls: readonly string[],
  options: { includeSearchRelays?: boolean } = {}
): Promise<string[]> {
  const { includeSearchRelays = false } = options;
  const relaySet = new Set<string>();
  const addRelay = (url: string, blocked: Set<string>) => {
    const normalized = normalizeRelayUrlInternal(url);
    if (!normalized || blocked.has(normalized)) return;
    relaySet.add(normalized);
  };

  const initialBlocked = new Set<string>();
  relayUrls.forEach((url) => addRelay(url, initialBlocked));

  const pubkey = getStoredPubkey();
  const manualRelays = getUserRelayAdditions();

  if (!pubkey) {
    manualRelays.forEach((relay) => addRelay(relay, initialBlocked));
    return Array.from(relaySet);
  }

  const { userRelays, blockedRelays, searchRelays } = await discoverUserRelays(pubkey);
  const blockedSet = new Set(blockedRelays.map(normalizeRelayUrlInternal));

  blockedSet.forEach((blocked) => relaySet.delete(blocked));
  userRelays.forEach((relay) => addRelay(relay, blockedSet));
  manualRelays.forEach((relay) => addRelay(relay, blockedSet));
  RELAYS.PREMIUM.forEach((relay) => addRelay(relay, blockedSet));

  if (includeSearchRelays) {
    searchRelays.forEach((relay) => addRelay(relay, blockedSet));
  }

  return Array.from(relaySet);
}
