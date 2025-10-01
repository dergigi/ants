import { NDKEvent } from '@nostr-dev-kit/ndk';
import { hasLocalStorage, loadMapFromStorage, saveMapToStorage } from '../storageCache';
import { deserializeProfileEvent, serializeProfileEvent, StoredProfileEvent } from './eventStorage';
import { normalizePubkey } from './key-utils';

type ProfileEventCacheEntry = { event: NDKEvent; timestamp: number };
type ProfileEventStoredEntry = { event: StoredProfileEvent; timestamp: number };

const PROFILE_EVENT_CACHE = new Map<string, ProfileEventCacheEntry>();
const PROFILE_EVENT_CACHE_STORAGE_KEY = 'ants_profile_event_cache_v1';
let profileEventCacheTtlMs = 6 * 60 * 60 * 1000; // 6 hours
let enableProfileEventPersistence = true;

function makeCacheKey(pubkeyHex: string, context?: { username?: string | null }): string {
  const usernamePart = context?.username ? `|u:${context.username.toLowerCase()}` : '';
  return `${pubkeyHex}${usernamePart}`;
}

export function configureProfileEventCache(options: { ttlMs?: number; persist?: boolean }): void {
  if (typeof options.ttlMs === 'number' && options.ttlMs >= 0) {
    profileEventCacheTtlMs = options.ttlMs;
  }
  if (typeof options.persist === 'boolean') {
    enableProfileEventPersistence = options.persist;
    if (!enableProfileEventPersistence) {
      PROFILE_EVENT_CACHE.clear();
    }
  }
}

function isExpired(timestamp: number): boolean {
  return Date.now() - timestamp > profileEventCacheTtlMs;
}

function saveProfileEventCacheToStorage(): void {
  if (!enableProfileEventPersistence || !hasLocalStorage()) return;
  try {
    const out = new Map<string, ProfileEventStoredEntry>();
    for (const [key, entry] of PROFILE_EVENT_CACHE.entries()) {
      if (!entry?.event) continue;
      const serialized = serializeProfileEvent(entry.event);
      if (!serialized) continue;
      out.set(key, { event: serialized, timestamp: entry.timestamp });
    }
    saveMapToStorage(PROFILE_EVENT_CACHE_STORAGE_KEY, out);
  } catch {
    // ignore
  }
}

function loadProfileEventCacheFromStorage(): void {
  if (!enableProfileEventPersistence || !hasLocalStorage()) return;
  try {
    const persisted = loadMapFromStorage<ProfileEventStoredEntry>(PROFILE_EVENT_CACHE_STORAGE_KEY);
    for (const [key, stored] of persisted.entries()) {
      if (!stored?.event) continue;
      if (isExpired(stored.timestamp || 0)) continue;
      const event = deserializeProfileEvent(stored.event);
      if (!event) continue;
      PROFILE_EVENT_CACHE.set(key, { event, timestamp: stored.timestamp || Date.now() });
    }
  } catch {
    // ignore
  }
}

loadProfileEventCacheFromStorage();

export function getCachedProfileEvent(pubkeyHex: string, context?: { username?: string | null }): NDKEvent | null {
  const key = makeCacheKey(pubkeyHex, context);
  if (!key) return null;
  const entry = PROFILE_EVENT_CACHE.get(key);
  if (!entry) return null;
  if (isExpired(entry.timestamp)) {
    PROFILE_EVENT_CACHE.delete(key);
    saveProfileEventCacheToStorage();
    return null;
  }
  return entry.event;
}

export function setCachedProfileEvent(pubkeyHex: string, event: NDKEvent, context?: { username?: string | null }): void {
  const key = makeCacheKey(pubkeyHex, context);
  if (!key) return;
  PROFILE_EVENT_CACHE.set(key, { event, timestamp: Date.now() });
  saveProfileEventCacheToStorage();
}

export function primeProfileEventCache(pubkeyHex: string, event: NDKEvent, timestamp: number, context?: { username?: string | null }): void {
  const key = makeCacheKey(pubkeyHex, context);
  if (!key) return;
  PROFILE_EVENT_CACHE.set(key, { event, timestamp });
}

export function clearProfileEventCache(pubkeyHex?: string, context?: { username?: string | null }): void {
  if (typeof pubkeyHex === 'string') {
    const base = normalizePubkey(pubkeyHex);
    if (!base) return;
    if (context?.username) {
      PROFILE_EVENT_CACHE.delete(makeCacheKey(base, context));
    }
    PROFILE_EVENT_CACHE.delete(base);
  } else {
    PROFILE_EVENT_CACHE.clear();
  }
  saveProfileEventCacheToStorage();
}


