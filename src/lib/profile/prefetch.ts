'use client';

import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { ndk } from '@/lib/ndk';

// Simple in-memory prefetch store for profile events keyed by hex pubkey
// Not persisted; short TTL to avoid stale UI

type PrefetchEntry = { event: NDKEvent; timestamp: number };

const PROFILE_PREFETCH_TTL_MS = 60 * 1000; // 60s is enough for navigation
const profilePrefetch = new Map<string, PrefetchEntry>();

export function setPrefetchedProfile(pubkeyHex: string, event: NDKEvent): void {
  if (!pubkeyHex || !event) return;
  profilePrefetch.set(pubkeyHex, { event, timestamp: Date.now() });
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


