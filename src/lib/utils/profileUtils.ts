import { NDKRelaySet, NDKUser } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { shortenNpub } from '../utils';
import { ndk } from '../ndk';
import { RELAYS } from '../relays';

export function getDisplayName(user: NDKUser): string {
  if (!user) return '';

  // Try to get display name from profile
  const profile = user.profile;
  if (profile?.displayName) {
    return profile.displayName;
  }
  if (profile?.name) {
    return profile.name;
  }

  // Fallback to shortened npub
  const npub = user.npub;
  return shortenNpub(npub);
}

// --- Shared profile name resolution with caching ---

export type ProfileResult = { display: string; isNpubFallback: boolean };
type CachedProfile = ProfileResult & { ts: number };
const profileNameCache = new Map<string, CachedProfile>();
const profileInflight = new Map<string, Promise<ProfileResult | null>>();
const profileNegativeCache = new Map<string, number>(); // pubkey → timestamp
const CACHE_MAX = 500;
const NEGATIVE_TTL_MS = 60_000;
const POSITIVE_TTL_MS = 10 * 60_000;

/**
 * Resolve a hex pubkey to a display name, with caching and deduplication.
 * Returns { display, isNpubFallback } or null for malformed pubkeys.
 * Positive results cached for 10 minutes, negative results for 60 seconds.
 */
export function resolveProfileName(pubkey: string): Promise<ProfileResult | null> {
  // Check positive cache (with TTL)
  const cached = profileNameCache.get(pubkey);
  if (cached && Date.now() - cached.ts < POSITIVE_TTL_MS) return Promise.resolve(cached);

  // Check negative cache (TTL-based)
  const negTs = profileNegativeCache.get(pubkey);
  if (negTs && Date.now() - negTs < NEGATIVE_TTL_MS) {
    try {
      return Promise.resolve({ display: shortenNpub(nip19.npubEncode(pubkey)), isNpubFallback: true });
    } catch { return Promise.resolve(null); }
  }

  // Dedupe in-flight requests
  const inflight = profileInflight.get(pubkey);
  if (inflight) return inflight;

  const promise = (async (): Promise<ProfileResult | null> => {
    try {
      const user = new NDKUser({ pubkey });
      user.ndk = ndk;

      // Try default relays first
      try { await user.fetchProfile(); } catch {}
      let profile = user.profile as { display?: string; displayName?: string; name?: string } | undefined;
      let display = profile?.displayName || profile?.display || profile?.name || '';

      // If default relays didn't have the profile, try profile-specific relays
      if (!display) {
        try {
          const profileRelaySet = NDKRelaySet.fromRelayUrls(RELAYS.PROFILE_SEARCH, ndk);
          await user.fetchProfile({ relaySet: profileRelaySet });
          profile = user.profile as { display?: string; displayName?: string; name?: string } | undefined;
          display = profile?.displayName || profile?.display || profile?.name || '';
        } catch {}
      }

      if (display) {
        const result: ProfileResult = { display, isNpubFallback: false };
        if (profileNameCache.size >= CACHE_MAX) {
          const firstKey = profileNameCache.keys().next().value;
          if (firstKey) profileNameCache.delete(firstKey);
        }
        profileNameCache.set(pubkey, { ...result, ts: Date.now() });
        return result;
      }
      // No display name — negative cache + npub fallback
      if (profileNegativeCache.size >= CACHE_MAX) {
        const firstKey = profileNegativeCache.keys().next().value;
        if (firstKey) profileNegativeCache.delete(firstKey);
      }
      profileNegativeCache.set(pubkey, Date.now());
      try {
        return { display: shortenNpub(nip19.npubEncode(pubkey)), isNpubFallback: true };
      } catch { return null; }
    } catch {
      if (profileNegativeCache.size >= CACHE_MAX) {
        const firstKey = profileNegativeCache.keys().next().value;
        if (firstKey) profileNegativeCache.delete(firstKey);
      }
      profileNegativeCache.set(pubkey, Date.now());
      try {
        return { display: shortenNpub(nip19.npubEncode(pubkey)), isNpubFallback: true };
      } catch { return null; }
    } finally {
      profileInflight.delete(pubkey);
    }
  })();

  profileInflight.set(pubkey, promise);
  return promise;
}
