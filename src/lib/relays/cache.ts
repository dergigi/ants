import { RELAY_INFO_CACHE_DURATION } from '../constants';
import { clearStorageKey, hasLocalStorage, loadMapFromStorage, saveMapToStorage } from '../storageCache';
import type { CachedRelayInfo, RelayInfo } from './types';

const CACHE_STORAGE_KEY = 'ants_relay_info_cache';

export const relayInfoCache = new Map<string, CachedRelayInfo>();
export const relayInfoCacheDurationMs = RELAY_INFO_CACHE_DURATION;

function loadRelayInfoCacheFromStorage(): void {
  try {
    const loaded = loadMapFromStorage<CachedRelayInfo>(CACHE_STORAGE_KEY);
    for (const [url, entry] of loaded.entries()) {
      relayInfoCache.set(url, entry);
    }
  } catch (error) {
    console.warn('Failed to load relay info cache from storage:', error);
  }
}

function saveRelayInfoCacheToStorage(): void {
  try {
    saveMapToStorage(CACHE_STORAGE_KEY, relayInfoCache);
  } catch (error) {
    console.warn('Failed to save relay info cache to storage:', error);
  }
}

if (hasLocalStorage()) {
  loadRelayInfoCacheFromStorage();
}

export function cacheRelayInfo(relayUrl: string, relayInfo: RelayInfo): void {
  relayInfoCache.set(relayUrl, { ...relayInfo, timestamp: Date.now() });
  saveRelayInfoCacheToStorage();
}

export function clearRelayInfoCache(): void {
  relayInfoCache.clear();
  try {
    clearStorageKey(CACHE_STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear relay info cache:', error);
  }
}
