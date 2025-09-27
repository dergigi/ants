'use client';

import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { ndk } from '@/lib/ndk';
import { hasLocalStorage, loadMapFromStorage, saveMapToStorage } from '@/lib/storageCache';
import { deserializeProfileEvent, serializeProfileEvent, StoredProfileEvent } from './eventStorage';
import { primeProfileEventCache } from './profile-event-cache';

// Simple in-memory prefetch store for profile events keyed by hex pubkey
// Not persisted; short TTL to avoid stale UI

type PrefetchEntry = { event: NDKEvent; timestamp: number };

const PROFILE_PREFETCH_TTL_MS = 60 * 1000; // 60s is enough for navigation
const STORAGE_KEY = 'ants_profile_prefetch_v1';

// Use a window-backed singleton so it survives module reloads/chunk boundaries in dev
function getGlobalMap(): Map<string, PrefetchEntry> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = typeof window !== 'undefined' ? (window as any) : undefined;
  if (w) {
    if (!w.__ANTS_PROFILE_PREFETCH__) {
      w.__ANTS_PROFILE_PREFETCH__ = new Map<string, PrefetchEntry>();
    }
    return w.__ANTS_PROFILE_PREFETCH__ as Map<string, PrefetchEntry>;
  }
  return new Map<string, PrefetchEntry>();
}

const profilePrefetch = getGlobalMap();

// Load persisted prefetch entries (best effort, respects TTL)
try {
  const persisted = loadMapFromStorage<{ timestamp: number; stored: StoredProfileEvent | null }>(STORAGE_KEY);
  for (const [pk, value] of persisted.entries()) {
    if (!value) continue;
    if (Date.now() - value.timestamp > PROFILE_PREFETCH_TTL_MS) continue;
    const evt = deserializeProfileEvent(value.stored);
    if (!evt) continue;
    profilePrefetch.set(pk, { event: evt, timestamp: value.timestamp });
  }
} catch {
  // ignore
}

export function setPrefetchedProfile(pubkeyHex: string, event: NDKEvent): void {
  if (!pubkeyHex || !event) return;
  const ts = Date.now();
  profilePrefetch.set(pubkeyHex, { event, timestamp: ts });
  // Persist minimal data so handoff works across reloads/dev refreshes
  try {
    if (!hasLocalStorage()) return;
    const current = loadMapFromStorage<{ timestamp: number; stored: StoredProfileEvent | null }>(STORAGE_KEY);
    const serialized = serializeProfileEvent(event);
    current.set(pubkeyHex, {
      timestamp: ts,
      stored: serialized
    });
    saveMapToStorage(STORAGE_KEY, current);
    if (serialized) primeProfileEventCache(pubkeyHex, event, ts);
  } catch {
    // ignore
  }
}

export function getPrefetchedProfile(pubkeyHex: string): NDKEvent | null {
  const entry = profilePrefetch.get(pubkeyHex);
  if (!entry) return null;
  const isExpired = Date.now() - entry.timestamp > PROFILE_PREFETCH_TTL_MS;
  if (isExpired) {
    profilePrefetch.delete(pubkeyHex);
    return null;
  }
  return entry.event;
}

export function clearPrefetchedProfile(pubkeyHex: string): void {
  if (!pubkeyHex) return;
  profilePrefetch.delete(pubkeyHex);
  try {
    if (!hasLocalStorage()) return;
    const current = loadMapFromStorage<{ timestamp: number; stored: StoredProfileEvent | null }>(STORAGE_KEY);
    current.delete(pubkeyHex);
    saveMapToStorage(STORAGE_KEY, current);
  } catch {
    // ignore
  }
}

// Ensure the event has an author with profile attached from content (kind:0)
export function prepareProfileEventForPrefetch(event: NDKEvent): NDKEvent {
  try {
    if (!event) return event;
    const author = event.author || new NDKUser({ pubkey: event.pubkey });
    author.ndk = ndk;
    // If no profile on author but content looks like a profile JSON, attach it
    if (!author.profile && event.kind === 0) {
      try {
        const parsed = JSON.parse(event.content || '{}');
        const normalized: Record<string, unknown> = { ...parsed };
        // Normalize common fields our UI expects
        // picture -> image
        if (typeof parsed?.picture === 'string') normalized.image = parsed.picture;
        // display_name -> displayName
        if (typeof parsed?.display_name === 'string') normalized.displayName = parsed.display_name;
        // username often maps to name if name is missing
        if (!parsed?.name && typeof parsed?.username === 'string') normalized.name = parsed.username;
        // website also available as url
        if (typeof parsed?.website === 'string' && !parsed?.url) normalized.url = parsed.website;
        // Keep banner/cover/header as-is; UI already checks these keys
        // Ensure nip05 is preserved
        if (typeof parsed?.nip05 === 'string') normalized.nip05 = parsed.nip05;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (author as any).profile = normalized;
      } catch {}
    }
    event.author = author;
    return event;
  } catch {
    return event;
  }
}


