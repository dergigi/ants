import { NDKEvent } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { resolveNip05ToPubkey } from './nip05';
import { profileEventFromPubkey } from './utils';
import { getCachedUsername, setCachedUsername } from './username-cache';
import { getCachedProfileEvent, setCachedProfileEvent } from './profile-event-cache';
import { searchProfilesFullText } from './search';

// Unified author resolver: npub | nip05 | username -> pubkey (hex) and an optional profile event
export async function resolveAuthor(authorInput: string): Promise<{ pubkeyHex: string | null; profileEvent: NDKEvent | null }> {
  try {
    const input = (authorInput || '').trim();
    if (!input) return { pubkeyHex: null, profileEvent: null };

    // 1) If input is npub, decode directly
    if (/^npub1[0-9a-z]+$/i.test(input)) {
      try {
        const { type, data } = nip19.decode(input);
        if (type === 'npub' && typeof data === 'string') {
          const cachedEvent = getCachedProfileEvent(data);
          const profileEvent = cachedEvent ?? await profileEventFromPubkey(data);
          if (!cachedEvent && profileEvent) setCachedProfileEvent(data, profileEvent);
          return { pubkeyHex: data, profileEvent };
        }
      } catch {}
      return { pubkeyHex: null, profileEvent: null };
    }

    // 1b) If input is a 64-char hex pubkey, accept directly
    if (/^[0-9a-fA-F]{64}$/.test(input)) {
      const hex = input.toLowerCase();
      const cachedEvent = getCachedProfileEvent(hex);
      const profileEvent = cachedEvent ?? await profileEventFromPubkey(hex);
      if (!cachedEvent && profileEvent) setCachedProfileEvent(hex, profileEvent);
      return { pubkeyHex: hex, profileEvent };
    }

    // 2) If input looks like NIP-05 ('@name@domain' | 'domain.tld' | '@domain.tld'), resolve to pubkey
    const nip05Like = input.match(/^@?([^\s@]+@[^\s@]+|[^\s@]+\.[^\s@]+)$/);
    if (nip05Like) {
      const pk = await resolveNip05ToPubkey(input);
      if (!pk) return { pubkeyHex: null, profileEvent: null };
      const cachedEvent = getCachedProfileEvent(pk);
      const profileEvent = cachedEvent ?? await profileEventFromPubkey(pk);
      if (!cachedEvent && profileEvent) setCachedProfileEvent(pk, profileEvent);
      return { pubkeyHex: pk, profileEvent };
    }

    // 3) Otherwise treat as username and check cache first, then try lookup with proper sorting
    const usernameLower = input.toLowerCase();
    const cachedProfile = getCachedUsername(usernameLower);
    if (cachedProfile !== undefined) {
      const pubkeyHex = cachedProfile?.author?.pubkey || cachedProfile?.pubkey || null;
      if (pubkeyHex && cachedProfile) {
        setCachedProfileEvent(pubkeyHex, cachedProfile, { username: usernameLower });
      }
      return { pubkeyHex, profileEvent: cachedProfile };
    }

    let profileEvt: NDKEvent | null = null;
    try {
      const profiles = await searchProfilesFullText(input, 1);
      profileEvt = profiles[0] || null;
    } catch {}

    setCachedUsername(usernameLower, profileEvt);
    if (profileEvt?.pubkey) setCachedProfileEvent(profileEvt.pubkey, profileEvt, { username: usernameLower });

    if (!profileEvt) {
      return { pubkeyHex: null, profileEvent: null };
    }
    const pubkeyHex = profileEvt.author?.pubkey || profileEvt.pubkey || null;
    return { pubkeyHex, profileEvent: profileEvt };
  } catch {
    return { pubkeyHex: null, profileEvent: null };
  }
}

// Resolve a by:<author> token value (username, nip05, or npub) to an npub.
// Returns the original input if it's already an npub, otherwise attempts Vertex DVM
// and falls back to a NIP-50 profile search. Hard timebox externally when needed.
export async function resolveAuthorToNpub(author: string): Promise<string | null> {
  try {
    const input = (author || '').trim();
    if (!input) return null;
    if (/^npub1[0-9a-z]+$/i.test(input)) return input;
    if (/^[0-9a-fA-F]{64}$/.test(input)) {
      try { return nip19.npubEncode(input.toLowerCase()); } catch { return null; }
    }
    const { pubkeyHex } = await resolveAuthor(input);
    if (!pubkeyHex) return null;
    try { return nip19.npubEncode(pubkeyHex); } catch { return null; }
  } catch {
    return null;
  }
}

