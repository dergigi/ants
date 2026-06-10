import { ndk } from '../ndk';
import { hasLocalStorage, loadMapFromStorage, saveMapToStorage, clearStorageKey } from '../storageCache';
import {
  RELAY_INFO_CACHE_DURATION,
  RELAY_INFO_NEGATIVE_CACHE_DURATION,
  RELAY_INFO_CHECK_TIMEOUT,
  RELAY_HTTP_REQUEST_TIMEOUT
} from '../constants';

export type RelayInfo = {
  supportedNips?: number[];
  name?: string;
  description?: string;
  contact?: string;
  software?: string;
  version?: string;
};

type CachedRelayInfo = RelayInfo & { timestamp: number; failed?: boolean };

// Cache for relay information (complete NIP-11 data)
export const relayInfoCache = new Map<string, CachedRelayInfo>();
const CACHE_DURATION_MS = RELAY_INFO_CACHE_DURATION;
const NEGATIVE_CACHE_DURATION_MS = RELAY_INFO_NEGATIVE_CACHE_DURATION;
const CACHE_STORAGE_KEY = 'ants_relay_info_cache';

// Dedupe concurrent lookups per relay
const inFlightLookups = new Map<string, Promise<RelayInfo>>();

// Load cache from localStorage on initialization (browser only)
function loadCacheFromStorage(): void {
  try {
    const loaded = loadMapFromStorage<RelayInfo & { supported?: boolean; timestamp: number }>(CACHE_STORAGE_KEY);

    for (const [url, entry] of loaded.entries()) {
      relayInfoCache.set(url, entry);
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

// Get complete relay information using multiple detection methods.
// Stale-while-revalidate: a cached entry (even expired) is returned
// immediately and refreshed in the background; only relays never seen
// before block on the HTTP check. Failed lookups are negative-cached
// so dead relays don't delay every search.
export async function getRelayInfo(relayUrl: string): Promise<RelayInfo> {
  const cached = relayInfoCache.get(relayUrl);
  if (cached) {
    const ttl = cached.failed ? NEGATIVE_CACHE_DURATION_MS : CACHE_DURATION_MS;
    if ((Date.now() - cached.timestamp) >= ttl) {
      void refreshRelayInfo(relayUrl);
    }
    return cached;
  }
  return refreshRelayInfo(relayUrl);
}

function refreshRelayInfo(relayUrl: string): Promise<RelayInfo> {
  const existing = inFlightLookups.get(relayUrl);
  if (existing) return existing;

  const lookup = (async (): Promise<RelayInfo> => {
    try {
      // Add a global timeout for the entire relay info checking process
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Relay info check timeout')), RELAY_INFO_CHECK_TIMEOUT);
      });

      const relayInfoPromise = (async () => {
        // Method 1: Check NDK's cached relay info
        const relay = ndk.pool?.relays?.get(relayUrl);
        if (relay) {
          // Check if relay has info cached from NIP-11
          const relayInfo = (relay as { info?: { supported_nips?: number[] } }).info;
          if (relayInfo && relayInfo.supported_nips) {
            const result = { supportedNips: relayInfo.supported_nips };
            cacheRelayInfo(relayUrl, result, false);
            return result;
          }
        }

        // Method 2: Try HTTP NIP-11 detection as fallback
        const httpResult = await checkRelayInfoViaHttp(relayUrl);

        const hasAnyInfo = Boolean(
          httpResult && (
            httpResult.supportedNips?.length ||
            httpResult.name ||
            httpResult.description ||
            httpResult.contact ||
            httpResult.software ||
            httpResult.version
          )
        );
        if (hasAnyInfo) {
          cacheRelayInfo(relayUrl, httpResult, false);
          return httpResult;
        }

        // No relay info found: negative-cache so we don't re-check on every search
        cacheRelayInfo(relayUrl, {}, true);
        return {};
      })();

      // Race between the relay info promise and the timeout
      return await Promise.race([relayInfoPromise, timeoutPromise]);
    } catch (error) {
      console.warn(`Failed to get relay info for ${relayUrl}:`, error);
      cacheRelayInfo(relayUrl, {}, true);
      return {};
    } finally {
      inFlightLookups.delete(relayUrl);
    }
  })();

  inFlightLookups.set(relayUrl, lookup);
  return lookup;
}

function cacheRelayInfo(relayUrl: string, info: RelayInfo, failed: boolean): void {
  relayInfoCache.set(relayUrl, { ...info, timestamp: Date.now(), ...(failed && { failed }) });
  saveCacheToStorage();
}

// Check relay information via HTTP (NIP-11 compatible)
async function checkRelayInfoViaHttp(relayUrl: string): Promise<RelayInfo> {
  try {
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
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), RELAY_HTTP_REQUEST_TIMEOUT);

        const response = await fetch(testUrl, {
          signal: controller.signal,
          headers: { 'Accept': 'application/nostr+json' }
        });

        clearTimeout(timeout);

        if (response.ok) {
          const data = await response.json();

          // Return complete relay information
          return {
            supportedNips: data?.supported_nips || [],
            name: data?.name,
            description: data?.description,
            contact: data?.contact,
            software: data?.software,
            version: data?.version
          };
        }
      } catch {
        // ignore
      }
    }

    // no relay info found at any endpoint
    return {};
  } catch {
    // HTTP detection failed
    return {};
  }
}

// Clear relay info cache (useful for debugging)
export function clearRelayInfoCache(): void {
  relayInfoCache.clear();
  try {
    clearStorageKey(CACHE_STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear relay info cache:', error);
  }
}
