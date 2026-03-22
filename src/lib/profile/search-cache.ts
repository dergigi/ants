import { NDKEvent } from '@nostr-dev-kit/ndk';
import { hasLocalStorage, loadMapFromStorage, saveMapToStorage, clearStorageKey } from '../storageCache';
import { deserializeProfileEvent, serializeProfileEvent, StoredProfileEvent } from './eventStorage';

type ProfileSearchCacheEntry = { events: NDKEvent[]; timestamp: number };
type StoredSearchCacheEntry = { events: StoredProfileEvent[]; timestamp: number };

const PROFILE_SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (increased from 5 minutes)
const PROFILE_SEARCH_CACHE_MAX_SIZE = 500;
const PROFILE_SEARCH_CACHE_STORAGE_KEY = 'ants_profile_search_cache_v1';
const profileSearchCache = new Map<string, ProfileSearchCacheEntry>();

export function makeProfileSearchCacheKey(query: string, loggedIn: boolean): string {
  return `${loggedIn ? '1' : '0'}|${query.toLowerCase().trim()}`;
}

export function getCachedProfileSearch(key: string): NDKEvent[] | null {
  const entry = profileSearchCache.get(key);
  if (!entry) return null;
  if ((Date.now() - entry.timestamp) > PROFILE_SEARCH_CACHE_TTL_MS) {
    profileSearchCache.delete(key);
    saveProfileSearchCacheToStorage();
    return null;
  }
  return entry.events.slice();
}

export function setCachedProfileSearch(key: string, events: NDKEvent[]): void {
  if (profileSearchCache.size >= PROFILE_SEARCH_CACHE_MAX_SIZE) {
    const oldest = profileSearchCache.keys().next().value;
    if (oldest) profileSearchCache.delete(oldest);
  }
  profileSearchCache.set(key, { events: events.slice(), timestamp: Date.now() });
  saveProfileSearchCacheToStorage();
}

export function clearProfileSearchCache(): void {
  profileSearchCache.clear();
  clearStorageKey(PROFILE_SEARCH_CACHE_STORAGE_KEY);
}

function saveProfileSearchCacheToStorage(): void {
  try {
    if (!hasLocalStorage()) return;
    const out = new Map<string, StoredSearchCacheEntry>();
    for (const [key, entry] of profileSearchCache.entries()) {
      const serialized = entry.events
        .map((evt) => serializeProfileEvent(evt))
        .filter(Boolean) as StoredProfileEvent[];
      out.set(key, { events: serialized, timestamp: entry.timestamp });
    }
    saveMapToStorage(PROFILE_SEARCH_CACHE_STORAGE_KEY, out);
  } catch {
    // ignore storage errors
  }
}

function loadProfileSearchCacheFromStorage(): void {
  try {
    if (!hasLocalStorage()) return;
    const loaded = loadMapFromStorage<StoredSearchCacheEntry>(PROFILE_SEARCH_CACHE_STORAGE_KEY);
    for (const [key, stored] of loaded.entries()) {
      const events = (stored.events || [])
        .map((record) => deserializeProfileEvent(record))
        .filter(Boolean) as NDKEvent[];
      profileSearchCache.set(key, { events, timestamp: stored.timestamp || Date.now() });
    }
  } catch {
    // ignore load errors
  }
}

// Initialize persistent cache on module load (browser only)
loadProfileSearchCacheFromStorage();
