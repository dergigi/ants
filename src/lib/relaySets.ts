import { NDKRelaySet } from '@nostr-dev-kit/ndk';
import { ndk, ensureCacheInitialized } from './ndk';
import { getStoredPubkey } from './nip07';
import { getUserRelayAdditions, getSearchLocalRelays } from './storage';
import { RELAYS, normalizeRelayUrl, isPrivateRelay, addRelayToSet } from './relayConfig';
import { discoverUserRelays, getUserRelayCacheEntry } from './relayDiscovery';
import { relayInfoCache, checkNip50Support, RELAY_INFO_CACHE_DURATION } from './relayInfo';
import { filterDeadRelays, getRelayMonitorEntry, getMonitoredNip50Relays } from './nip66';

/** Build a relay URL list enriched with user, manual, and premium relays */
export async function extendWithUserAndPremium(
  relayUrls: readonly string[],
  options: { includeSearchRelays?: boolean } = {}
): Promise<string[]> {
  const { includeSearchRelays = false } = options;
  const relaySet = new Set<string>();
  const initialBlocked = new Set<string>();

  for (const url of relayUrls) {
    addRelayToSet(relaySet, url, initialBlocked);
  }

  const pubkey = getStoredPubkey();
  const manualRelays = getUserRelayAdditions();

  if (!pubkey) {
    manualRelays.forEach((r) => addRelayToSet(relaySet, r, initialBlocked));
    return Array.from(relaySet);
  }

  const { userRelays, blockedRelays, searchRelays } = await discoverUserRelays(pubkey);
  const blockedSet = new Set(blockedRelays.map(normalizeRelayUrl));
  const allowPrivate = getSearchLocalRelays();

  for (const blocked of blockedSet) relaySet.delete(blocked);

  // User's own relays respect the "search local relays" setting
  userRelays.forEach((r) => addRelayToSet(relaySet, r, blockedSet, allowPrivate));
  manualRelays.forEach((r) => addRelayToSet(relaySet, r, blockedSet, allowPrivate));
  RELAYS.PREMIUM.forEach((r) => addRelayToSet(relaySet, r, blockedSet));
  if (includeSearchRelays) {
    searchRelays.forEach((r) => addRelayToSet(relaySet, r, blockedSet, allowPrivate));
  }

  return Array.from(relaySet);
}

export async function createRelaySet(urls: string[]): Promise<NDKRelaySet> {
  await ensureCacheInitialized();
  return NDKRelaySet.fromRelayUrls(urls, ndk);
}

// Pre-configured relay sets
export const relaySets = {
  default: async () => {
    await ensureCacheInitialized();
    return NDKRelaySet.fromRelayUrls(await extendWithUserAndPremium(RELAYS.DEFAULT), ndk);
  },
  search: async () => {
    await ensureCacheInitialized();
    return NDKRelaySet.fromRelayUrls(
      await extendWithUserAndPremium(RELAYS.SEARCH, { includeSearchRelays: true }), ndk
    );
  },
  profileSearch: async () => {
    await ensureCacheInitialized();
    return NDKRelaySet.fromRelayUrls(
      await extendWithUserAndPremium(RELAYS.PROFILE_SEARCH, { includeSearchRelays: true }), ndk
    );
  },
  premium: async () => {
    await ensureCacheInitialized();
    return NDKRelaySet.fromRelayUrls(RELAYS.PREMIUM, ndk);
  },
  vertexDvm: async () => {
    await ensureCacheInitialized();
    return NDKRelaySet.fromRelayUrls(RELAYS.VERTEX_DVM, ndk);
  },
} as const;

// Filter relays to only those supporting NIP-50
export async function filterNip50Relays(relayUrls: string[]): Promise<string[]> {
  const liveRelayUrls = filterDeadRelays(relayUrls);

  const results = await Promise.allSettled(
    liveRelayUrls.map(async (url) => {
      const monitorEntry = getRelayMonitorEntry(url);
      if (monitorEntry?.isAlive && monitorEntry.supportedNips.includes(50)) {
        return { url, supportsNip50: true };
      }
      const info = await checkNip50Support(url);
      return { url, supportsNip50: info.supportsNip50 };
    })
  );

  const supported: string[] = [];
  const rejected: string[] = [];
  results.forEach((result, i) => {
    const url = liveRelayUrls[i];
    if (result.status === 'fulfilled' && result.value.supportsNip50) {
      supported.push(url);
    } else {
      rejected.push(url);
    }
  });

  // Fallback: if too few NIP-50 relays, try known candidates
  if (supported.length < 3) {
    const candidates = ['wss://relay.primal.net', 'wss://relay.snort.social', 'wss://relay.ditto.pub']
      .filter((url) => !supported.includes(url) && !rejected.includes(url));
    if (candidates.length > 0) {
      const fallback = await Promise.allSettled(
        candidates.map(async (url) => {
          const info = await checkNip50Support(url);
          return { url, supportsNip50: info.supportsNip50 };
        })
      );
      for (const r of fallback) {
        if (r.status === 'fulfilled' && r.value.supportsNip50) supported.push(r.value.url);
      }
    }
  }

  return supported;
}

export async function getNip50RelaySet(relayUrls: string[]): Promise<NDKRelaySet> {
  return createRelaySet(await filterNip50Relays(relayUrls));
}

export async function getNip50SearchRelaySet(): Promise<NDKRelaySet> {
  const pubkey = getStoredPubkey();
  const allSearchRelays: string[] = [...RELAYS.SEARCH, ...getMonitoredNip50Relays()];

  if (pubkey) {
    try {
      const { searchRelays } = await discoverUserRelays(pubkey);
      allSearchRelays.push(...searchRelays);
    } catch (error) {
      console.warn('[NIP-51] Failed to discover user search relays:', error);
    }
  }

  const allRelays = await extendWithUserAndPremium(allSearchRelays);
  return createRelaySet(await filterNip50Relays(allRelays));
}

function hasCachedNip50Support(url: string): boolean {
  const normalized = normalizeRelayUrl(url);
  const monitorEntry = getRelayMonitorEntry(normalized);
  if (monitorEntry?.isAlive && monitorEntry.supportedNips.includes(50)) return true;
  const info = relayInfoCache.get(normalized);
  if (info && (Date.now() - info.timestamp) < RELAY_INFO_CACHE_DURATION && info.supportedNips?.includes(50)) return true;
  return false;
}

/**
 * Instant (synchronous) NIP-50 relay set for fast search startup.
 * Uses hardcoded + NIP-66 cached relays, and synchronously reads the
 * userRelayCache for user/manual/premium/search relays.
 */
export function getQuickNip50SearchRelaySet(): NDKRelaySet {
  const relaySet = new Set<string>();
  const emptyBlocked = new Set<string>();

  for (const url of [...RELAYS.SEARCH, ...getMonitoredNip50Relays()]) {
    addRelayToSet(relaySet, url, emptyBlocked);
  }

  const pubkey = getStoredPubkey();
  const manualRelays = getUserRelayAdditions();

  const allowPrivate = getSearchLocalRelays();
  const addNip50 = (url: string, blocked: Set<string>, priv = false) => {
    const normalized = normalizeRelayUrl(url);
    if (!normalized || blocked.has(normalized)) return;
    if (!priv && isPrivateRelay(normalized)) return;
    if (hasCachedNip50Support(normalized)) relaySet.add(normalized);
  };

  if (pubkey) {
    const cached = getUserRelayCacheEntry(pubkey);
    if (cached) {
      const blockedSet = new Set(cached.blockedRelays.map(normalizeRelayUrl));
      for (const b of blockedSet) relaySet.delete(b);
      cached.searchRelays.forEach((r) => addNip50(r, blockedSet, allowPrivate));
      cached.userRelays.forEach((r) => addNip50(r, blockedSet, allowPrivate));
      manualRelays.forEach((r) => addNip50(r, blockedSet, allowPrivate));
      RELAYS.PREMIUM.forEach((r) => addNip50(r, blockedSet));
    } else {
      manualRelays.forEach((r) => addNip50(r, emptyBlocked, allowPrivate));
      RELAYS.PREMIUM.forEach((r) => addNip50(r, emptyBlocked));
    }
  } else {
    manualRelays.forEach((r) => addNip50(r, emptyBlocked, allowPrivate));
  }

  return NDKRelaySet.fromRelayUrls(filterDeadRelays(Array.from(relaySet)), ndk);
}
