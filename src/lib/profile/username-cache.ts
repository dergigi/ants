import { NDKEvent } from '@nostr-dev-kit/ndk';
import { hasLocalStorage, loadMapFromStorage, saveMapToStorage } from '../storageCache';
import { deserializeProfileEvent, serializeProfileEvent, StoredProfileEvent } from './eventStorage';

// Unified username lookup cache: key=username(lower), value=best profile event
type UsernameCacheEntry = { profileEvent: NDKEvent | null; timestamp: number };
type UsernameCacheValue = {
  profileEvent: StoredProfileEvent | null;
  timestamp: number;
};

const USERNAME_CACHE = new Map<string, UsernameCacheEntry>();
const USERNAME_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const USERNAME_NEGATIVE_TTL_MS = 60 * 1000; // 1 minute for negative results
const USERNAME_CACHE_STORAGE_KEY = 'ants_username_cache_v1';

// Username Cache functions
export function getCachedUsername(usernameLower: string): NDKEvent | null | undefined {
  const entry = USERNAME_CACHE.get(usernameLower);
  if (!entry) return undefined;
  const ttl = entry.profileEvent ? USERNAME_CACHE_TTL_MS : USERNAME_NEGATIVE_TTL_MS;
  if (Date.now() - entry.timestamp > ttl) {
    USERNAME_CACHE.delete(usernameLower);
    return undefined;
  }
  return entry.profileEvent;
}

export function setCachedUsername(usernameLower: string, profileEvent: NDKEvent | null): void {
  USERNAME_CACHE.set(usernameLower, { profileEvent, timestamp: Date.now() });
  saveUsernameCacheToStorage();
}

function saveUsernameCacheToStorage(): void {
  try {
    if (!hasLocalStorage()) return;
    const out = new Map<string, UsernameCacheValue>();
    for (const [key, entry] of USERNAME_CACHE.entries()) {
      out.set(key, {
        profileEvent: serializeProfileEvent(entry.profileEvent),
        timestamp: entry.timestamp
      });
    }
    saveMapToStorage(USERNAME_CACHE_STORAGE_KEY, out);
  } catch {
    // ignore
  }
}

function loadUsernameCacheFromStorage(): void {
  try {
    if (!hasLocalStorage()) return;
    const loaded = loadMapFromStorage<UsernameCacheValue>(USERNAME_CACHE_STORAGE_KEY);
    for (const [key, stored] of loaded.entries()) {
      const profileEvent = deserializeProfileEvent(stored.profileEvent);
      USERNAME_CACHE.set(key, { profileEvent, timestamp: stored.timestamp || Date.now() });
    }
  } catch {
    // ignore
  }
}

// Initialize persistent username cache on module load (browser only)
loadUsernameCacheFromStorage();
