'use client';

import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { ndk } from '@/lib/ndk';
import { hasLocalStorage, loadMapFromStorage, saveMapToStorage } from '@/lib/storageCache';

// Simple in-memory prefetch store for profile events keyed by hex pubkey
// Not persisted; short TTL to avoid stale UI

type PrefetchEntry = { event: NDKEvent; timestamp: number };
type StoredProfileEvent = {
  kind: 0;
  content: string;
  pubkey: string;
  created_at?: number;
  id?: string;
  // Minimal author for reconstruction
  author?: { pubkey: string; profile?: unknown } | null;
};

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
  const persisted = loadMapFromStorage<StoredProfileEvent & { timestamp: number }>(STORAGE_KEY);
  for (const [pk, value] of persisted.entries()) {
    if (!value) continue;
    if (Date.now() - value.timestamp > PROFILE_PREFETCH_TTL_MS) continue;
    const evt = new NDKEvent(ndk, value as unknown as StoredProfileEvent);
    if (value.author) {
      const user = new NDKUser({ pubkey: value.author.pubkey });
      user.ndk = ndk;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (user as any).profile = value.author.profile;
      evt.author = user;
    }
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
    const current = loadMapFromStorage<StoredProfileEvent & { timestamp: number }>(STORAGE_KEY);
    const stored: StoredProfileEvent & { timestamp: number } = {
      kind: 0,
      content: event.content || '{}',
      pubkey: pubkeyHex,
      created_at: event.created_at,
      id: event.id,
      author: event.author ? { pubkey: event.author.pubkey, /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ profile: (event.author as any).profile } : { pubkey: pubkeyHex },
      timestamp: ts
    };
    current.set(pubkeyHex, stored);
    saveMapToStorage(STORAGE_KEY, current);
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
    const current = loadMapFromStorage<StoredProfileEvent & { timestamp: number }>(STORAGE_KEY);
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (author as any).profile = parsed || {};
      } catch {}
    }
    event.author = author;
    return event;
  } catch {
    return event;
  }
}


