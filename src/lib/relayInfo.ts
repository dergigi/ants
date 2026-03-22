import { ndk } from './ndk';
import { RELAYS } from './relayConfig';
import { hasLocalStorage, loadMapFromStorage, saveMapToStorage, clearStorageKey } from './storageCache';
import {
  RELAY_INFO_CACHE_DURATION,
  RELAY_INFO_CHECK_TIMEOUT,
  RELAY_HTTP_REQUEST_TIMEOUT,
} from './constants';

export interface RelayInfoEntry {
  supportedNips?: number[];
  name?: string;
  description?: string;
  contact?: string;
  software?: string;
  version?: string;
  timestamp: number;
}

export type RelayInfo = Omit<RelayInfoEntry, 'timestamp'>;

// Cache for relay information (complete NIP-11 data)
export const relayInfoCache = new Map<string, RelayInfoEntry>();
export { RELAY_INFO_CACHE_DURATION };
const CACHE_DURATION_MS = RELAY_INFO_CACHE_DURATION;
const CACHE_STORAGE_KEY = 'ants_relay_info_cache';

function loadCacheFromStorage(): void {
  try {
    const loaded = loadMapFromStorage<RelayInfoEntry>(CACHE_STORAGE_KEY);
    for (const [url, entry] of loaded.entries()) {
      relayInfoCache.set(url, entry);
    }
  } catch (error) {
    console.warn('Failed to load relay info cache from storage:', error);
  }
}

function saveCacheToStorage(): void {
  try {
    saveMapToStorage(CACHE_STORAGE_KEY, relayInfoCache);
  } catch (error) {
    console.warn('Failed to save relay info cache to storage:', error);
  }
}

if (hasLocalStorage()) {
  loadCacheFromStorage();
}

/** Check relay info via HTTP NIP-11 endpoint */
async function checkRelayInfoViaHttp(relayUrl: string): Promise<RelayInfo> {
  try {
    const httpUrl = relayUrl
      .replace(/^wss:\/\//, 'https://')
      .replace(/^ws:\/\//, 'http://');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RELAY_HTTP_REQUEST_TIMEOUT);

    const response = await fetch(httpUrl, {
      signal: controller.signal,
      headers: { 'Accept': 'application/nostr+json' },
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      return {
        supportedNips: data?.supported_nips || [],
        name: data?.name,
        description: data?.description,
        contact: data?.contact,
        software: data?.software,
        version: data?.version,
      };
    }
  } catch {
    // ignore
  }
  return {};
}

/** Get complete relay information using NDK cache + NIP-11 HTTP fallback */
export async function getRelayInfo(relayUrl: string): Promise<RelayInfo> {
  try {
    const cached = relayInfoCache.get(relayUrl);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION_MS) {
      return cached;
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Relay info check timeout')), RELAY_INFO_CHECK_TIMEOUT);
    });

    const relayInfoPromise = (async (): Promise<RelayInfo> => {
      // Check NDK's cached relay info first
      const relay = ndk.pool?.relays?.get(relayUrl);
      if (relay) {
        const info = (relay as { info?: { supported_nips?: number[] } }).info;
        if (info?.supported_nips) {
          const result = { supportedNips: info.supported_nips };
          relayInfoCache.set(relayUrl, { ...result, timestamp: Date.now() });
          saveCacheToStorage();
          return result;
        }
      }

      // Fall back to HTTP NIP-11 detection
      const httpResult = await checkRelayInfoViaHttp(relayUrl);
      // Cache any successful NIP-11 response, even with empty supported_nips.
      // This avoids re-probing relays that explicitly report no NIP-50 support.
      const hasData = httpResult.supportedNips !== undefined
        || httpResult.name || httpResult.description
        || httpResult.contact || httpResult.software || httpResult.version;
      if (hasData) {
        relayInfoCache.set(relayUrl, { ...httpResult, timestamp: Date.now() });
        saveCacheToStorage();
        return httpResult;
      }

      return {};
    })();

    return await Promise.race([relayInfoPromise, timeoutPromise]);
  } catch (error) {
    console.warn(`Failed to get relay info for ${relayUrl}:`, error);
    return {};
  }
}

export async function checkNip50Support(relayUrl: string): Promise<{
  supportsNip50: boolean;
  supportedNips: number[];
}> {
  const info = await getRelayInfo(relayUrl);
  if (info.supportedNips) {
    return {
      supportsNip50: info.supportedNips.includes(50),
      supportedNips: info.supportedNips,
    };
  }
  return { supportsNip50: false, supportedNips: [] };
}

export function clearRelayInfoCache(): void {
  relayInfoCache.clear();
  try {
    clearStorageKey(CACHE_STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear relay info cache:', error);
  }
}

// Backward compatibility
export const clearNip50SupportCache = clearRelayInfoCache;
export const clearNip50Cache = clearRelayInfoCache;
