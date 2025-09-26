'use client';

import { NDKEvent } from '@nostr-dev-kit/ndk';

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


