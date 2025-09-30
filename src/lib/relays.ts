import { NDKRelaySet } from '@nostr-dev-kit/ndk';
import { ndk, ensureCacheInitialized } from './ndk';
import { getStoredPubkey } from './nip07';
import { getUserRelayAdditions } from './storage';
import { getUserRelayUrls } from './search';
import { hasLocalStorage, loadMapFromStorage, saveMapToStorage, clearStorageKey } from './storageCache';

// Cache for NIP-50 support status
const nip50SupportCache = new Map<string, { supported: boolean; timestamp: number }>();
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_STORAGE_KEY = 'ants_nip50_cache';

// Load cache from localStorage on initialization (browser only)
function loadCacheFromStorage(): void {
  try {
    const loaded = loadMapFromStorage<{ supported: boolean; timestamp: number }>(CACHE_STORAGE_KEY);
    for (const [url, entry] of loaded.entries()) {
      nip50SupportCache.set(url, entry);
    }
    if (loaded.size > 0) {
      console.log(`Loaded ${loaded.size} NIP-50 cache entries from storage`);
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
const userRelayCache = new Map<string, { relays: string[]; timestamp: number }>();
const USER_RELAY_CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

async function extendWithUserAndPremium(relayUrls: readonly string[]): Promise<string[]> {
  const enriched = [...relayUrls];
  if (getStoredPubkey()) {
    // Add manually configured user relays
    const userRelays = getUserRelayAdditions();
    for (const relay of userRelays) {
      if (!enriched.includes(relay)) {
        enriched.push(relay);
      }
    }
    
    // Add automatically discovered user relays
    try {
      const pubkey = getStoredPubkey();
      if (pubkey) {
        const now = Date.now();
        const cached = userRelayCache.get(pubkey);
        
        let discoveredRelays: string[] = [];
        if (cached && (now - cached.timestamp) < USER_RELAY_CACHE_DURATION_MS) {
          // Use cached relays
          discoveredRelays = cached.relays;
        } else {
          // Discover user relays with timeout
          discoveredRelays = await getUserRelayUrls(3000); // 3 second timeout
          userRelayCache.set(pubkey, { relays: discoveredRelays, timestamp: now });
        }
        
        // Add discovered relays
        for (const relay of discoveredRelays) {
          if (!enriched.includes(relay)) {
            enriched.push(relay);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to discover user relays:', error);
      // Continue without discovered relays
    }
    
    // Add premium relays
    for (const premium of RELAYS.PREMIUM) {
      if (!enriched.includes(premium)) enriched.push(premium);
    }
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

// Check NIP-50 support via NIP-11 (HTTP) - more reliable than INFO request
async function checkNip50SupportViaNip11(relayUrl: string): Promise<boolean> {
  try {
    console.log(`[NIP-50 DEBUG] Checking NIP-11 for ${relayUrl}`);
    
    // Convert wss:// to https:// for NIP-11
    const httpUrl = relayUrl.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
    const nip11Url = `${httpUrl}/.well-known/nostr.json`;
    console.log(`[NIP-50 DEBUG] NIP-11 URL: ${nip11Url}`);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
    
    const response = await fetch(nip11Url, { 
      signal: controller.signal,
      headers: { 'Accept': 'application/nostr+json' }
    });
    
    clearTimeout(timeout);
    console.log(`[NIP-50 DEBUG] ${relayUrl} - NIP-11 response status:`, response.status);
    
    if (!response.ok) {
      console.log(`[NIP-50 DEBUG] ${relayUrl} - NIP-11 not available (${response.status})`);
      return false;
    }
    
    const data = await response.json();
    console.log(`[NIP-50 DEBUG] ${relayUrl} - NIP-11 data:`, data);
    
    const supportedNips = data?.supported_nips || [];
    const supportsNip50 = supportedNips.includes(50);
    console.log(`[NIP-50 DEBUG] ${relayUrl} - supported_nips:`, supportedNips, `NIP-50 support: ${supportsNip50}`);
    
    return supportsNip50;
  } catch (error) {
    console.log(`[NIP-50 DEBUG] ${relayUrl} - NIP-11 failed:`, error);
    return false;
  }
}


// Check if relay supports NIP-50 (with caching)
export async function checkNip50Support(relayUrl: string): Promise<boolean> {
  // Check cache first
  const cached = nip50SupportCache.get(relayUrl);
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION_MS) {
    return cached.supported;
  }
  
  // Use NIP-11 method for reliable detection
  const supported = await checkNip50SupportViaNip11(relayUrl);
  
  // Cache the result
  nip50SupportCache.set(relayUrl, { 
    supported, 
    timestamp: Date.now() 
  });
  
  // Save to localStorage
  saveCacheToStorage();
  
  return supported;
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
    .filter((result): result is PromiseFulfilledResult<{ url: string; supported: boolean }> => 
      result.status === 'fulfilled' && result.value.supported
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
  // Get all relays (including user relays) but filter for NIP-50 support
  const allRelays = await extendWithUserAndPremium([...RELAYS.SEARCH]);
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
export function getNip50CacheStats(): { size: number; entries: Array<{ url: string; supported: boolean; age: number }> } {
  const now = Date.now();
  const entries = Array.from(nip50SupportCache.entries()).map(([url, entry]) => ({
    url,
    supported: entry.supported,
    age: Math.round((now - entry.timestamp) / (1000 * 60 * 60)) // age in hours
  }));
  
  return {
    size: nip50SupportCache.size,
    entries
  };
}
