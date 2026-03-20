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

// Warm the username cache from an array of kind-0 profile events.
// Extracts name/display_name and populates the cache so future
// resolveAuthor calls for these usernames are instant.
export function warmUsernameCache(events: NDKEvent[]): void {
  let changed = false;
  for (const evt of events) {
    try {
      const content = JSON.parse(evt.content || '{}');
      const names: string[] = [];
      if (typeof content.name === 'string' && content.name.trim()) {
        names.push(content.name.trim().toLowerCase());
      }
      if (typeof content.display_name === 'string' && content.display_name.trim()) {
        names.push(content.display_name.trim().toLowerCase());
      }
      if (typeof content.displayName === 'string' && content.displayName.trim()) {
        names.push(content.displayName.trim().toLowerCase());
      }
      for (const nameLower of names) {
        // Only populate if not already cached (don't overwrite better results)
        if (!USERNAME_CACHE.has(nameLower)) {
          USERNAME_CACHE.set(nameLower, { profileEvent: evt, timestamp: Date.now() });
          changed = true;
        }
      }
    } catch {
      // skip malformed events
    }
  }
  if (changed) saveUsernameCacheToStorage();
}

export function clearUsernameCache(): void {
  USERNAME_CACHE.clear();
  saveUsernameCacheToStorage();
}
