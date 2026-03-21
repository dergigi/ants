import { NDKEvent } from '@nostr-dev-kit/ndk';

type ProfileSearchCacheEntry = { events: NDKEvent[]; timestamp: number };

const PROFILE_SEARCH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const profileSearchCache = new Map<string, ProfileSearchCacheEntry>();

export function makeProfileSearchCacheKey(query: string, loggedIn: boolean): string {
  return `${loggedIn ? '1' : '0'}|${query.toLowerCase()}`;
}

export function getCachedProfileSearch(key: string): NDKEvent[] | null {
  const entry = profileSearchCache.get(key);
  if (!entry) return null;
  if ((Date.now() - entry.timestamp) > PROFILE_SEARCH_CACHE_TTL_MS) {
    profileSearchCache.delete(key);
    return null;
  }
  return entry.events.slice();
}

export function setCachedProfileSearch(key: string, events: NDKEvent[]): void {
  profileSearchCache.set(key, { events: events.slice(), timestamp: Date.now() });
}
