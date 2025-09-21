import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { hasLocalStorage, loadMapFromStorage, saveMapToStorage } from '../storageCache';
import { ndk } from '../ndk';

// Unified username lookup cache: key=username(lower), value=best profile event
type UsernameCacheEntry = { profileEvent: NDKEvent | null; timestamp: number };
type StoredProfileEvent = {
  id: string;
  pubkey: string;
  content: string;
  created_at: number | undefined;
  kind: number;
  tags: unknown;
  author?: {
    pubkey: string;
    profile?: unknown;
  } | null;
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
    const out = new Map<string, { profileEvent: StoredProfileEvent | null; timestamp: number }>();
    for (const [key, entry] of USERNAME_CACHE.entries()) {
      // Serialize the profile event for storage
      const serialized: StoredProfileEvent | null = entry.profileEvent ? {
        id: entry.profileEvent.id,
        pubkey: entry.profileEvent.pubkey,
        content: entry.profileEvent.content,
        created_at: entry.profileEvent.created_at,
        kind: entry.profileEvent.kind,
        tags: entry.profileEvent.tags,
        author: entry.profileEvent.author ? {
          pubkey: entry.profileEvent.author.pubkey,
          profile: entry.profileEvent.author.profile
        } : null
      } : null;
      out.set(key, { profileEvent: serialized, timestamp: entry.timestamp });
    }
    saveMapToStorage(USERNAME_CACHE_STORAGE_KEY, out);
  } catch {
    // ignore
  }
}

function loadUsernameCacheFromStorage(): void {
  try {
    if (!hasLocalStorage()) return;
    const loaded = loadMapFromStorage<{ profileEvent: StoredProfileEvent | null; timestamp: number }>(USERNAME_CACHE_STORAGE_KEY);
    for (const [key, stored] of loaded.entries()) {
      let profileEvent: NDKEvent | null = null;
      if (stored.profileEvent) {
        // Reconstruct the NDKEvent from stored data
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        profileEvent = new NDKEvent(ndk, stored.profileEvent as any);
        if (stored.profileEvent.author && profileEvent) {
          const user = new NDKUser({ pubkey: stored.profileEvent.author.pubkey });
          user.ndk = ndk;
          if (stored.profileEvent.author.profile) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (user as any).profile = stored.profileEvent.author.profile;
          }
          profileEvent.author = user;
        }
      }
      USERNAME_CACHE.set(key, { profileEvent, timestamp: stored.timestamp || Date.now() });
    }
  } catch {
    // ignore
  }
}

// Initialize persistent username cache on module load (browser only)
loadUsernameCacheFromStorage();
