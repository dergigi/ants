import { NDKEvent } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { resolveNip05ToPubkey } from './nip05';
import { profileEventFromPubkey } from './utils';
import { fallbackLookupProfile } from './fallback';
import { getCachedUsername, setCachedUsername } from './username-cache';
import { queryVertexDVM, VERTEX_REGEXP } from './dvm-core';
import { getStoredPubkey } from '../nip07';

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
    
    // If not in cache, perform lookup with proper sorting
    let profileEvt: NDKEvent | null = null;
    try {
      profileEvt = await lookupVertexProfileWithSorting(`p:${input}`, fallbackLookupProfile);
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
    const { pubkeyHex } = await resolveAuthor(input);
    if (!pubkeyHex) return null;
    try { return nip19.npubEncode(pubkeyHex); } catch { return null; }
  } catch {
    return null;
  }
}

// Improved lookup that prioritizes cached results and ensures proper sorting
async function lookupVertexProfileWithSorting(query: string, fallbackLookup: (username: string) => Promise<NDKEvent | null>): Promise<NDKEvent | null> {
  const match = query.match(VERTEX_REGEXP);
  if (!match) return null;
  
  const username = match[1].toLowerCase();

  // If not logged in, use fallback with proper sorting
  if (!getStoredPubkey()) {
    try { 
      return await fallbackLookup(username); 
    } catch { 
      return null; 
    }
  }

  // For logged-in users, try DVM first (which has its own cache)
  let dvmResult: NDKEvent | null = null;
  try {
    const dvmEvents = await queryVertexDVM(username, 1);
    dvmResult = dvmEvents[0] ?? null;
  } catch (error) {
    if ((error as Error)?.message !== 'VERTEX_NO_CREDITS') {
      console.warn('Vertex DVM query failed, will rely on fallback if available:', error);
    }
  }

  // If DVM returned a result, use it (it's already properly sorted by DVM)
  if (dvmResult) {
    return dvmResult;
  }

  // Fallback to NIP-50 search with proper sorting
  try {
    return await fallbackLookup(username);
  } catch (error) {
    console.error('Fallback profile lookup failed:', error);
    return null;
  }
}
