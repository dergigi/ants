'use client';

import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { ndk } from '@/lib/ndk';

type CacheEntry = { event: NDKEvent; ts: number };

const byNpub = new Map<string, CacheEntry>();
const byPubkey = new Map<string, CacheEntry>();

const TTL_MS = 60 * 1000; // 1 minute is plenty for navigation hand-off

function prune(): void {
  const now = Date.now();
  for (const [k, v] of byNpub.entries()) {
    if (now - v.ts > TTL_MS) byNpub.delete(k);
  }
  for (const [k, v] of byPubkey.entries()) {
    if (now - v.ts > TTL_MS) byPubkey.delete(k);
  }
}

export function setBootProfileEvent(npub: string, event: NDKEvent): void {
  prune();
  try {
    const pubkey = (event.pubkey || event.author?.pubkey || '').trim();
    // Ensure author is set so downstream UI has a user attached
    if (!event.author && pubkey) {
      const user = new NDKUser({ pubkey });
      user.ndk = ndk;
      event.author = user;
    }
    const entry: CacheEntry = { event, ts: Date.now() };
    if (npub) byNpub.set(npub, entry);
    if (pubkey) byPubkey.set(pubkey, entry);
  } catch {}
}

export function getBootProfileEventByNpub(npub: string | null | undefined): NDKEvent | null {
  prune();
  if (!npub) return null;
  const entry = byNpub.get(npub);
  return entry ? entry.event : null;
}

export function getBootProfileEventByPubkey(pubkey: string | null | undefined): NDKEvent | null {
  prune();
  if (!pubkey) return null;
  const entry = byPubkey.get(pubkey);
  return entry ? entry.event : null;
}

export function clearBootProfileEvent(npub?: string | null, pubkey?: string | null): void {
  if (npub) byNpub.delete(npub);
  if (pubkey) byPubkey.delete(pubkey);
}


