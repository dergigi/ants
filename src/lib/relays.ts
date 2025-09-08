import { NDKRelaySet } from '@nostr-dev-kit/ndk';
import { ndk } from './ndk';

// Cache for NIP-50 support status
const nip50SupportCache = new Map<string, { supported: boolean; timestamp: number }>();
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

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
    'wss://relay.ditto.pub',
    'wss://search.nos.today',
    'wss://index.hzrd149.com/'
  ],

  // Profile search relays (NIP-50 capable)
  PROFILE_SEARCH: [
    'wss://purplepag.es'
  ],

  // Vertex DVM relay
  VERTEX_DVM: [
    'wss://relay.vertexlab.io'
  ]
} as const;

// Pre-configured relay sets
export const relaySets = {
  // Default relay set for general use
  default: () => NDKRelaySet.fromRelayUrls(RELAYS.DEFAULT, ndk),
  
  // Search relay set (NIP-50 capable)
  search: () => NDKRelaySet.fromRelayUrls(RELAYS.SEARCH, ndk),
  
  // Profile search relay set
  profileSearch: () => NDKRelaySet.fromRelayUrls(RELAYS.PROFILE_SEARCH, ndk),
  
  // Vertex DVM relay set
  vertexDvm: () => NDKRelaySet.fromRelayUrls(RELAYS.VERTEX_DVM, ndk)
} as const;

// Helper function to create custom relay sets
export function createRelaySet(urls: string[]): NDKRelaySet {
  return NDKRelaySet.fromRelayUrls(urls, ndk);
}

// Check if a relay supports NIP-50 using NIP-11 (Relay Information Document)
async function checkNip50SupportViaNip11(relayUrl: string): Promise<boolean> {
  try {
    // Convert wss:// to https:// for NIP-11
    const httpUrl = relayUrl.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
    const nip11Url = `https://${httpUrl.split('/')[0]}/.well-known/nostr.json`;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
    
    const response = await fetch(nip11Url, { 
      signal: controller.signal,
      headers: { 'Accept': 'application/nostr+json' }
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) return false;
    
    const data = await response.json();
    const supportedNips = data?.supported_nips || [];
    
    return supportedNips.includes(50);
  } catch (error) {
    console.warn(`Failed to check NIP-11 for ${relayUrl}:`, error);
    return false;
  }
}

// Test NIP-50 support with a minimal search query
async function checkNip50SupportViaTest(relayUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const testRelaySet = NDKRelaySet.fromRelayUrls([relayUrl], ndk);
    let hasResponse = false;
    
    const sub = ndk.subscribe([{ 
      kinds: [1], 
      search: 'test', 
      limit: 1 
    }], { 
      closeOnEose: true, 
      cacheUsage: 'ONLY_RELAY' as any, 
      relaySet: testRelaySet 
    });
    
    const timer = setTimeout(() => {
      try { sub.stop(); } catch {}
      resolve(hasResponse);
    }, 3000); // 3s timeout
    
    sub.on('event', () => {
      hasResponse = true;
      clearTimeout(timer);
      try { sub.stop(); } catch {}
      resolve(true);
    });
    
    sub.on('eose', () => {
      clearTimeout(timer);
      try { sub.stop(); } catch {}
      resolve(hasResponse);
    });
    
    sub.start();
  });
}

// Check if relay supports NIP-50 (with caching)
export async function checkNip50Support(relayUrl: string): Promise<boolean> {
  // Check cache first
  const cached = nip50SupportCache.get(relayUrl);
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION_MS) {
    return cached.supported;
  }
  
  // Try NIP-11 first (most efficient)
  let supported = await checkNip50SupportViaNip11(relayUrl);
  
  // If NIP-11 fails, try test query
  if (!supported) {
    supported = await checkNip50SupportViaTest(relayUrl);
  }
  
  // Cache the result
  nip50SupportCache.set(relayUrl, { 
    supported, 
    timestamp: Date.now() 
  });
  
  return supported;
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
  // Start with known NIP-50 relays
  const knownNip50Relays = [...RELAYS.SEARCH];
  
  // Add default relays and check them
  const allRelays = [...new Set([...knownNip50Relays, ...RELAYS.DEFAULT])];
  const nip50Relays = await filterNip50Relays(allRelays);
  
  console.log('NIP-50 capable relays:', nip50Relays);
  return createRelaySet(nip50Relays);
}
