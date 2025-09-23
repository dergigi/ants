import { NDKEvent } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { resolveNip05ToPubkey } from './nip05';
import { profileEventFromPubkey } from './utils';
import { getCachedUsername, setCachedUsername } from './username-cache';
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
          return { pubkeyHex: data, profileEvent: await profileEventFromPubkey(data) };
        }
      } catch {}
      return { pubkeyHex: null, profileEvent: null };
    }

    // 1b) If input is a 64-char hex pubkey, accept directly
    if (/^[0-9a-fA-F]{64}$/.test(input)) {
      const hex = input.toLowerCase();
      return { pubkeyHex: hex, profileEvent: await profileEventFromPubkey(hex) };
    }

    // 2) If input looks like NIP-05 ('@name@domain' | 'domain.tld' | '@domain.tld'), resolve to pubkey
    const nip05Like = input.match(/^@?([^\s@]+@[^\s@]+|[^\s@]+\.[^\s@]+)$/);
    if (nip05Like) {
      const pk = await resolveNip05ToPubkey(input);
      if (!pk) return { pubkeyHex: null, profileEvent: null };
      return { pubkeyHex: pk, profileEvent: await profileEventFromPubkey(pk) };
    }

    // 3) Otherwise treat as username and check cache first, then try lookup with proper sorting
    const usernameLower = input.toLowerCase();
    
    // Check unified username cache first
    const cachedProfile = getCachedUsername(usernameLower);
    if (cachedProfile !== undefined) {
      const pubkeyHex = cachedProfile?.author?.pubkey || cachedProfile?.pubkey || null;
      return { pubkeyHex, profileEvent: cachedProfile };
    }
    
    // If not in cache, perform lookup using the same logic as p: search
    let profileEvt: NDKEvent | null = null;
    try {
      // Use the same searchProfilesFullText function that p: search uses
      const profiles = await searchProfilesFullText(input, 1);
      profileEvt = profiles[0] || null;
    } catch {}
    
    // Cache the result (positive or negative)
    setCachedUsername(usernameLower, profileEvt);
    
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

