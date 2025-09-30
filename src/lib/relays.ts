import { NDKRelaySet, NDKSubscriptionCacheUsage, NDKEvent } from '@nostr-dev-kit/ndk';
import { ndk, ensureCacheInitialized, safeSubscribe } from './ndk';
import { getStoredPubkey } from './nip07';
import { getUserRelayAdditions } from './storage';
import { hasLocalStorage, loadMapFromStorage, saveMapToStorage, clearStorageKey } from './storageCache';
import { 
  RELAY_INFO_CACHE_DURATION, 
  RELAY_USER_RELAY_CACHE_DURATION, 
  RELAY_INFO_CHECK_TIMEOUT, 
  RELAY_HTTP_REQUEST_TIMEOUT 
} from './constants';

// Cache for relay information (complete NIP-11 data)
export const relayInfoCache = new Map<string, {
  supportedNips?: number[];
  name?: string;
  description?: string;
  contact?: string;
  software?: string;
  version?: string;
  timestamp: number;
}>();
const CACHE_DURATION_MS = RELAY_INFO_CACHE_DURATION;
const CACHE_STORAGE_KEY = 'ants_relay_info_cache';

// Load cache from localStorage on initialization (browser only)
function loadCacheFromStorage(): void {
  try {
    const loaded = loadMapFromStorage<{
      supported?: boolean;
      supportedNips?: number[];
      name?: string;
      description?: string;
      contact?: string;
      software?: string;
      version?: string;
      timestamp: number;
    }>(CACHE_STORAGE_KEY);

    for (const [url, entry] of loaded.entries()) {
      relayInfoCache.set(url, entry);
    }

    if (loaded.size > 0) {
      console.log(`[RELAY CACHE] Loaded ${loaded.size} relay info entries from storage (TTL: 1min):`);
      for (const [url, entry] of loaded.entries()) {
        const age = Math.round((Date.now() - entry.timestamp) / (1000 * 60)); // minutes
        const nips = entry.supportedNips?.length ? entry.supportedNips.join(', ') : 'none';
        const name = entry.name ? `"${entry.name}"` : 'unnamed';
        console.log(`[RELAY CACHE]   ${name} (${url}) - NIPs: [${nips}], Age: ${age}m`);
      }
    }
  } catch (error) {
    console.warn('Failed to load relay info cache from storage:', error);
  }
}

// Save cache to localStorage (browser only)
function saveCacheToStorage(): void {
  try {
    saveMapToStorage(CACHE_STORAGE_KEY, relayInfoCache);
  } catch (error) {
    console.warn('Failed to save relay info cache to storage:', error);
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
const USER_RELAY_CACHE_DURATION_MS = RELAY_USER_RELAY_CACHE_DURATION;

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

// Get complete relay information using multiple detection methods
export async function getRelayInfo(relayUrl: string): Promise<{
  supportedNips?: number[];
  name?: string;
  description?: string;
  contact?: string;
  software?: string;
  version?: string;
}> {
  try {
    // Check cache first
    const cached = relayInfoCache.get(relayUrl);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION_MS) {
      console.log(`[RELAY CACHE] Using cached info for ${relayUrl}`);
      return cached;
    }

    console.log(`[RELAY] Getting fresh info for ${relayUrl}`);

    // Add a global timeout for the entire relay info checking process
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Relay info check timeout')), RELAY_INFO_CHECK_TIMEOUT);
    });

    const relayInfoPromise = (async () => {
      // Method 1: Check if relay is in our known relays list and assume standard NIPs
      const knownSearchRelays = new Set<string>([
        ...RELAYS.SEARCH,
        ...RELAYS.PROFILE_SEARCH
      ]);

      if (knownSearchRelays.has(relayUrl)) {
        console.log(`[RELAY] ${relayUrl} is in known search relays list - will try HTTP detection`);
        // Don't hard-code supported NIPs - let HTTP detection determine actual capabilities
      }

      // Method 2: Check NDK's cached relay info
      const relay = ndk.pool?.relays?.get(relayUrl);
      if (relay) {
        console.log(`[RELAY DEBUG] Checking NDK relay info for ${relayUrl}`);
        console.log(`[RELAY DEBUG] Relay status:`, relay.status);

        // Check if relay has info cached from NIP-11
        const relayInfo = (relay as { info?: { supported_nips?: number[] } }).info;
        if (relayInfo && relayInfo.supported_nips) {
          console.log(`[RELAY DEBUG] ${relayUrl} cached supported_nips:`, relayInfo.supported_nips);
          const result = { supportedNips: relayInfo.supported_nips };
          // Cache this result
          relayInfoCache.set(relayUrl, { ...result, timestamp: Date.now() });
          saveCacheToStorage();
          return result;
        }
      }

      // Method 3: Try HTTP NIP-11 detection as fallback
      console.log(`[RELAY] ${relayUrl} - trying HTTP detection`);
      const httpResult = await checkRelayInfoViaHttp(relayUrl);

      if (httpResult && (httpResult.supportedNips?.length || httpResult.name || httpResult.description)) {
        // Cache this result
        relayInfoCache.set(relayUrl, { ...httpResult, timestamp: Date.now() });
        saveCacheToStorage();
        return httpResult;
      }

      console.log(`[RELAY] ${relayUrl} - no relay info found`);
      return {};
    })();

    // Race between the relay info promise and the timeout
    return await Promise.race([relayInfoPromise, timeoutPromise]);
  } catch (error) {
    console.warn(`Failed to get relay info for ${relayUrl}:`, error);
    return {};
  }
}

// Check relay information via HTTP (NIP-11 compatible)
async function checkRelayInfoViaHttp(relayUrl: string): Promise<{
  supportedNips?: number[];
  name?: string;
  description?: string;
  contact?: string;
  software?: string;
  version?: string;
}> {
  try {
    console.log(`[RELAY HTTP] Checking relay info for ${relayUrl}`);

    // Convert wss:// to https:// for HTTP requests (NIP-11 compatible)
    const httpUrl = relayUrl.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');

    // Try multiple possible endpoints (root path is spec-compliant, .well-known is common convention)
    const possibleUrls = [
      `${httpUrl}`, // Root path (NIP-11 spec)
      `${httpUrl}/.well-known/nostr.json`, // Common convention
      `${httpUrl}/nostr.json` // Alternative convention
    ];

    for (const testUrl of possibleUrls) {
      try {
        console.log(`[RELAY HTTP] Trying ${testUrl}`);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), RELAY_HTTP_REQUEST_TIMEOUT);

        const response = await fetch(testUrl, {
          signal: controller.signal,
          headers: { 'Accept': 'application/nostr+json' }
        });

        clearTimeout(timeout);

        if (response.ok) {
          const data = await response.json();
          console.log(`[RELAY HTTP] ${relayUrl} - found data at ${testUrl}:`, data);

          // Return complete relay information
          return {
            supportedNips: data?.supported_nips || [],
            name: data?.name,
            description: data?.description,
            contact: data?.contact,
            software: data?.software,
            version: data?.version
          };
        } else {
          console.log(`[RELAY HTTP] ${testUrl} - not available (${response.status})`);
        }
      } catch (error) {
        console.log(`[RELAY HTTP] ${testUrl} - failed:`, error);
      }
    }

    console.log(`[RELAY HTTP] ${relayUrl} - no relay info found at any endpoint`);
    return {};
  } catch (error) {
    console.log(`[RELAY HTTP] ${relayUrl} - HTTP detection failed:`, error);
    return {};
  }
}





// Clear relay info cache (useful for debugging)
export function clearRelayInfoCache(): void {
  relayInfoCache.clear();
  try {
    clearStorageKey(CACHE_STORAGE_KEY);
    console.log('Relay info cache cleared');
  } catch (error) {
    console.warn('Failed to clear relay info cache:', error);
  }
}

// Backward compatibility - keep old function names
export const clearNip50SupportCache = clearRelayInfoCache;
export const clearNip50Cache = clearRelayInfoCache;

// Backward compatibility function for NIP-50 support checking
export async function checkNip50Support(relayUrl: string): Promise<{ supportsNip50: boolean; supportedNips: number[] }> {
  const relayInfo = await getRelayInfo(relayUrl);

  if (relayInfo.supportedNips) {
    return {
      supportsNip50: relayInfo.supportedNips.includes(50),
      supportedNips: relayInfo.supportedNips
    };
  }

  return { supportsNip50: false, supportedNips: [] };
}

// Filter relays to only those supporting NIP-50
export async function filterNip50Relays(relayUrls: string[]): Promise<string[]> {
  const results = await Promise.allSettled(
    relayUrls.map(async (url) => {
      const nip50Info = await checkNip50Support(url);
      return { url, nip50Info };
    })
  );

  return results
    .filter((result): result is PromiseFulfilledResult<{ url: string; nip50Info: { supportsNip50: boolean; supportedNips: number[] } }> =>
      result.status === 'fulfilled' && result.value.nip50Info.supportsNip50
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

