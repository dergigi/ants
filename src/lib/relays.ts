import { NDKRelaySet, NDKSubscriptionCacheUsage, NDKEvent } from '@nostr-dev-kit/ndk';
import { ndk, ensureCacheInitialized, safeSubscribe } from './ndk';
import { getStoredPubkey } from './nip07';
import { getUserRelayAdditions } from './storage';
import { hasLocalStorage, loadMapFromStorage, saveMapToStorage, clearStorageKey } from './storageCache';

// Cache for NIP-50 support status
const nip50SupportCache = new Map<string, { supported: boolean; supportedNips?: number[]; timestamp: number }>();
const CACHE_DURATION_MS = 60 * 1000; // 1 minute
const CACHE_STORAGE_KEY = 'ants_nip50_cache';

// Load cache from localStorage on initialization (browser only)
function loadCacheFromStorage(): void {
  try {
    const loaded = loadMapFromStorage<{ supported: boolean; supportedNips?: number[]; timestamp: number }>(CACHE_STORAGE_KEY);
    for (const [url, entry] of loaded.entries()) {
      nip50SupportCache.set(url, entry);
    }
    if (loaded.size > 0) {
      console.log(`[NIP-50 CACHE] Loaded ${loaded.size} cache entries from storage (TTL: 1min):`);
      for (const [url, entry] of loaded.entries()) {
        const age = Math.round((Date.now() - entry.timestamp) / (1000 * 60)); // minutes
        const nips = entry.supportedNips?.length ? entry.supportedNips.join(', ') : 'none';
        const status = entry.supported ? '✅' : '❌';
        console.log(`[NIP-50 CACHE]   ${status} ${url} - NIPs: [${nips}], Age: ${age}m`);
      }
    }
  } catch (error) {
    console.warn('Failed to load NIP-50 cache from storage:', error);
  }
}

// Save cache to localStorage (browser only)
function saveCacheToStorage(): void {
  try {
    saveMapToStorage(CACHE_STORAGE_KEY, nip50SupportCache);
  } catch (error) {
    console.warn('Failed to save NIP-50 cache to storage:', error);
  }
}

// Initialize cache from storage (browser only)
if (hasLocalStorage()) {
  loadCacheFromStorage();
}

// Centralized relay configuration
export const RELAYS = {
  // Default relays for general NDK connection
  DEFAULT: [
    'wss://relay.primal.net',
    'wss://relay.snort.social',
    'wss://relay.ditto.pub'
  ],

  // Search-capable relays (NIP-50 support)
  SEARCH: [
    'wss://search.nos.today',
    'wss://relay.nostr.band',
    'wss://relay.ditto.pub',
    'wss://relay.davidebtc.me',
    'wss://relay.gathr.gives',
    'wss://us.azzamo.net',
    'wss://nostr.polyserv.xyz',
    'wss://relay.azzamo.net'
  ],

  // Profile search relays (NIP-50 capable)
  PROFILE_SEARCH: [
    'wss://purplepag.es',
    'wss://search.nos.today',
    'wss://relay.nostr.band',
    'wss://relay.ditto.pub'
  ],

  // Premium relays to use only for logged-in users
  PREMIUM: [
    'wss://nostr.wine'
  ],

  // Vertex DVM relay
  VERTEX_DVM: [
    'wss://relay.vertexlab.io'
  ]
} as const;

// Cache for discovered user relays to avoid repeated lookups
const userRelayCache = new Map<string, {
  userRelays: string[];
  blockedRelays: string[];
  searchRelays: string[];
  timestamp: number
}>();
const USER_RELAY_CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

// Discover user relays as per NIP-51
async function discoverUserRelays(pubkey: string): Promise<{
  userRelays: string[];
  blockedRelays: string[];
  searchRelays: string[];
}> {
  // Check cache first
  const cached = userRelayCache.get(pubkey);
  if (cached && (Date.now() - cached.timestamp) < USER_RELAY_CACHE_DURATION_MS) {
    return cached;
  }

  console.log(`[NIP-51] Discovering relays for user ${pubkey}`);

  try {
    // Get user's relay list (kind:10002) - used for general relay connections
    const userRelayList = await new Promise<string[]>((resolve) => {
      const sub = safeSubscribe([{ kinds: [10002], authors: [pubkey], limit: 1 }], {
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
        console.log(`[NIP-51] Found ${arr.length} user relays:`, arr);
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

    // Get blocked relays (kind:10006)
    const blockedRelays = await new Promise<string[]>((resolve) => {
      const sub = safeSubscribe([{ kinds: [10006], authors: [pubkey], limit: 1 }], {
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
        const blocked = new Set<string>();
        for (const tag of event.tags) {
          if (Array.isArray(tag) && tag[0] === 'r' && tag[1]) {
            const raw = tag[1];
            const normalized = /^wss?:\/\//i.test(raw) ? raw : `wss://${raw}`;
            blocked.add(normalized);
          }
        }
        const arr = Array.from(blocked);
        console.log(`[NIP-51] Found ${arr.length} blocked relays:`, arr);
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

    // Get search relays (kind:10007)
    const searchRelays = await new Promise<string[]>((resolve) => {
      const sub = safeSubscribe([{ kinds: [10007], authors: [pubkey], limit: 1 }], {
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
        const search = new Set<string>();
        for (const tag of event.tags) {
          if (Array.isArray(tag) && tag[0] === 'r' && tag[1]) {
            const raw = tag[1];
            const normalized = /^wss?:\/\//i.test(raw) ? raw : `wss://${raw}`;
            search.add(normalized);
          }
        }
        const arr = Array.from(search);
        console.log(`[NIP-51] Found ${arr.length} search relays:`, arr);
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

    const result = {
      userRelays: userRelayList,
      blockedRelays,
      searchRelays
    };

    // Cache the result
    userRelayCache.set(pubkey, { ...result, timestamp: Date.now() });

    return result;
  } catch (error) {
    console.warn(`[NIP-51] Failed to discover relays for user ${pubkey}:`, error);
    return { userRelays: [], blockedRelays: [], searchRelays: [] };
  }
}

async function extendWithUserAndPremium(relayUrls: readonly string[]): Promise<string[]> {
  const enriched = [...relayUrls];
  const pubkey = getStoredPubkey();

  if (pubkey) {
    // Discover user relays as per NIP-51
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { userRelays, blockedRelays, searchRelays } = await discoverUserRelays(pubkey);

    // Remove blocked relays from all relay lists
    const blockedSet = new Set(blockedRelays);
    const filteredEnriched = enriched.filter(url => !blockedSet.has(url));

    // Add user's search relays to search relay lists (handled in search relay functions)
    // Note: userRelays and searchRelays are used in getNip50SearchRelaySet()
    // Add manually configured user relays (for backward compatibility)
    const manualUserRelays = getUserRelayAdditions();
    for (const relay of manualUserRelays) {
      if (!filteredEnriched.includes(relay)) {
        filteredEnriched.push(relay);
      }
    }
    
    // Add premium relays for logged-in users
    if (getStoredPubkey()) {
      for (const relay of RELAYS.PREMIUM) {
        if (!filteredEnriched.includes(relay)) {
          filteredEnriched.push(relay);
        }
      }
    }

    return filteredEnriched;
  }

  return enriched;
}

// Pre-configured relay sets
export const relaySets = {
  // Default relay set for general use
  default: async () => { await ensureCacheInitialized(); return NDKRelaySet.fromRelayUrls(RELAYS.DEFAULT, ndk); },
  
  // Search relay set (NIP-50 capable)
  search: async () => { await ensureCacheInitialized(); return NDKRelaySet.fromRelayUrls(await extendWithUserAndPremium(RELAYS.SEARCH), ndk); },
  
  // Profile search relay set
  profileSearch: async () => { await ensureCacheInitialized(); return NDKRelaySet.fromRelayUrls(await extendWithUserAndPremium(RELAYS.PROFILE_SEARCH), ndk); },

  // Premium relay set, used only when logged in
  premium: async () => { await ensureCacheInitialized(); return NDKRelaySet.fromRelayUrls(RELAYS.PREMIUM, ndk); },
  
  // Vertex DVM relay set
  vertexDvm: async () => { await ensureCacheInitialized(); return NDKRelaySet.fromRelayUrls(RELAYS.VERTEX_DVM, ndk); }
} as const;

// Helper function to create custom relay sets
export async function createRelaySet(urls: string[]): Promise<NDKRelaySet> {
  await ensureCacheInitialized();
  return NDKRelaySet.fromRelayUrls(urls, ndk);
}

// Check NIP-50 support via NDK's relay information
async function checkNip50SupportViaNDK(relayUrl: string): Promise<{ supportsNip50: boolean; supportedNips: number[] }> {
  try {
    const relay = ndk.pool?.relays?.get(relayUrl);
    if (!relay) {
      console.log(`[NIP-50 DEBUG] ${relayUrl} - relay not connected to NDK pool yet`);
      return { supportsNip50: false, supportedNips: [] };
    }

    console.log(`[NIP-50 DEBUG] Checking relay info for ${relayUrl}`);
    console.log(`[NIP-50 DEBUG] Relay status:`, relay.status);

    // Check if relay has info cached from NIP-11
    const relayInfo = (relay as { info?: { supported_nips?: number[] } }).info;
    if (relayInfo && relayInfo.supported_nips) {
      const supportsNip50 = relayInfo.supported_nips.includes(50);
      console.log(`[NIP-50 DEBUG] ${relayUrl} cached supported_nips:`, relayInfo.supported_nips, `NIP-50 support: ${supportsNip50}`);
      return { supportsNip50, supportedNips: relayInfo.supported_nips };
    }

    // If no cached info, try to trigger NIP-11 info retrieval
    console.log(`[NIP-50 DEBUG] ${relayUrl} - no cached info, trying to trigger NIP-11`);

    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 30; // 30 * 100ms = 3 seconds

      const timeout = setTimeout(() => {
        console.log(`[NIP-50 DEBUG] Timeout waiting for relay info from ${relayUrl} after ${attempts} attempts`);
        resolve({ supportsNip50: false, supportedNips: [] });
      }, 3000);

      const checkInterval = setInterval(() => {
        attempts++;
        const currentInfo = (relay as { info?: { supported_nips?: number[] } }).info;

        if (currentInfo && currentInfo.supported_nips) {
          const supportsNip50 = currentInfo.supported_nips.includes(50);
          console.log(`[NIP-50 DEBUG] ${relayUrl} got relay info after ${attempts} attempts - supported_nips:`, currentInfo.supported_nips, `NIP-50 support: ${supportsNip50}`);
          clearTimeout(timeout);
          clearInterval(checkInterval);
          resolve({ supportsNip50, supportedNips: currentInfo.supported_nips });
        } else if (attempts % 10 === 0) {
          console.log(`[NIP-50 DEBUG] ${relayUrl} - waiting for relay info, attempt ${attempts}/${maxAttempts}`);
        }
      }, 100);

      // Try to trigger info retrieval by sending a simple message
      try {
        const ws = (relay as { ws?: WebSocket }).ws;
        if (ws && ws.readyState === WebSocket.OPEN) {
          // Send a simple REQ that should trigger NIP-11 info
          ws.send(JSON.stringify(['REQ', 'info-check', { kinds: [0], limit: 1 }]));
          console.log(`[NIP-50 DEBUG] Sent info trigger to ${relayUrl}, waiting for response...`);
        } else {
          console.log(`[NIP-50 DEBUG] ${relayUrl} - WebSocket not ready (state: ${ws?.readyState}), cannot trigger info`);
          clearTimeout(timeout);
          clearInterval(checkInterval);
          resolve({ supportsNip50: false, supportedNips: [] });
        }
      } catch (error) {
        console.log(`[NIP-50 DEBUG] ${relayUrl} - failed to send info trigger:`, error);
        clearTimeout(timeout);
        clearInterval(checkInterval);
        resolve({ supportsNip50: false, supportedNips: [] });
      }
    });
  } catch (error) {
    console.warn(`Failed to check NDK relay info for ${relayUrl}:`, error);
    return { supportsNip50: false, supportedNips: [] };
  }
}


// Check if relay supports NIP-50 (with caching)
export async function checkNip50Support(relayUrl: string): Promise<{ supportsNip50: boolean; supportedNips: number[] }> {
  // Check cache first
  const cached = nip50SupportCache.get(relayUrl);
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION_MS) {
    return { supportsNip50: cached.supported, supportedNips: cached.supportedNips || [] };
  }

  // Use NDK's relay information for NIP-50 detection
  const result = await checkNip50SupportViaNDK(relayUrl);

  // Only cache results when we actually get valid responses from relays
  // Don't cache "unknown" or timeout results to avoid preventing future attempts
  if (result.supportedNips.length > 0 || result.supportsNip50) {
    console.log(`[NIP-50 CACHE] Caching result for ${relayUrl}:`, result);
    nip50SupportCache.set(relayUrl, {
      supported: result.supportsNip50,
      supportedNips: result.supportedNips,
      timestamp: Date.now()
    });

    // Save to localStorage
    saveCacheToStorage();
  } else {
    console.log(`[NIP-50 CACHE] Not caching uncertain result for ${relayUrl}:`, result);
  }

  return result;
}

// Clear NIP-50 support cache (useful for debugging)
export function clearNip50SupportCache(): void {
  nip50SupportCache.clear();
  try {
    clearStorageKey('ants_nip50_support_cache');
    console.log('NIP-50 support cache cleared');
  } catch (error) {
    console.warn('Failed to clear NIP-50 support cache:', error);
  }
}

// Filter relays to only those supporting NIP-50
export async function filterNip50Relays(relayUrls: string[]): Promise<string[]> {
  const results = await Promise.allSettled(
    relayUrls.map(async (url) => ({
      url,
      supported: await checkNip50Support(url)
    }))
  );

  return results
    .filter((result): result is PromiseFulfilledResult<{ url: string; supported: { supportsNip50: boolean; supportedNips: number[] } }> =>
      result.status === 'fulfilled' && result.value.supported.supportsNip50
    )
    .map(result => result.value.url);
}

// Get NIP-50 capable relay set from a list of URLs
export async function getNip50RelaySet(relayUrls: string[]): Promise<NDKRelaySet> {
  const nip50Relays = await filterNip50Relays(relayUrls);
  return createRelaySet(nip50Relays);
}

// Enhanced search relay set that filters for NIP-50 support
export async function getNip50SearchRelaySet(): Promise<NDKRelaySet> {
  const pubkey = getStoredPubkey();

  // Start with hardcoded search relays
  const allSearchRelays: string[] = [...RELAYS.SEARCH];

  // Add user's search relays if logged in
  if (pubkey) {
    try {
      const { searchRelays } = await discoverUserRelays(pubkey);
      allSearchRelays.push(...searchRelays);
      console.log(`[NIP-51] Added ${searchRelays.length} user search relays`);
    } catch (error) {
      console.warn('[NIP-51] Failed to discover user search relays:', error);
    }
  }

  // Get all relays (including user relays) but filter for NIP-50 support
  const allRelays = await extendWithUserAndPremium(allSearchRelays);
  const nip50Relays = await filterNip50Relays(allRelays);
  return createRelaySet(nip50Relays);
}

// Clear NIP-50 cache (useful for debugging or forcing re-detection)
export function clearNip50Cache(): void {
  nip50SupportCache.clear();
  try {
    clearStorageKey(CACHE_STORAGE_KEY);
    console.log('NIP-50 cache cleared');
  } catch (error) {
    console.warn('Failed to clear NIP-50 cache from storage:', error);
  }
}

// Get cache statistics
export function getNip50CacheStats(): { size: number; entries: Array<{ url: string; supported: boolean; supportedNips?: number[]; age: number }> } {
  const now = Date.now();
  const entries = Array.from(nip50SupportCache.entries()).map(([url, entry]) => ({
    url,
    supported: entry.supported,
    supportedNips: entry.supportedNips,
    age: Math.round((now - entry.timestamp) / (1000 * 60 * 60)) // age in hours
  }));

  return {
    size: nip50SupportCache.size,
    entries
  };
}
