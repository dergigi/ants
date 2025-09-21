import { NDKEvent, NDKUser, NDKFilter, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { ndk, safeSubscribe } from '../ndk';
import { getStoredPubkey } from '../nip07';
import { relaySets } from '../relays';
import { resolveNip05ToPubkey } from './nip05';
export { resolveNip05ToPubkey };
import { queryVertexDVM } from '../dvm/query';
import { fallbackLookupProfile } from './fallback';
import { searchProfilesFullText } from './search';
import { checkNip05, invalidateNip05Cache } from './verification';

export { searchProfilesFullText, checkNip05, invalidateNip05Cache };

export const VERTEX_REGEXP = /^p:([a-zA-Z0-9_]+)$/;

// Lazily create relay sets when needed (avoid cache access during module import)
async function getProfileSearchRelaySet() {
  return relaySets.profileSearch();
}

function isLoggedIn(): boolean {
  return Boolean(getStoredPubkey());
}

async function subscribeAndCollectProfiles(filter: NDKFilter, timeoutMs: number = 8000): Promise<NDKEvent[]> {
  return new Promise<NDKEvent[]>((resolve) => {
    const collected: Map<string, NDKEvent> = new Map();

    (async () => {
      const relaySet = await getProfileSearchRelaySet();
      const sub = safeSubscribe(
        [filter],
        { closeOnEose: true, cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY, relaySet }
      );
    
      if (!sub) {
        console.warn('Failed to create profile search subscription');
        resolve([]);
        return;
      }
      const timer = setTimeout(() => {
        try { sub.stop(); } catch {}
        resolve(Array.from(collected.values()));
      }, timeoutMs);

      sub.on('event', (event: NDKEvent) => {
        if (!collected.has(event.id)) {
          collected.set(event.id, event);
        }
      });

      sub.on('eose', () => {
        clearTimeout(timer);
        resolve(Array.from(collected.values()));
      });

      sub.start();
    })();
  });
}

export async function profileEventFromPubkey(pubkey: string): Promise<NDKEvent> {
  const user = new NDKUser({ pubkey });
  user.ndk = ndk;
  try {
    await user.fetchProfile();
  } catch {}
  const evt = new NDKEvent(ndk, {
    kind: 0,
    created_at: Math.floor(Date.now() / 1000),
    content: JSON.stringify(user.profile || {}),
    pubkey,
    tags: [],
    id: '',
    sig: ''
  });
  evt.author = user;
  return evt;
}

export async function lookupVertexProfile(query: string): Promise<NDKEvent | null> {
  const match = query.match(VERTEX_REGEXP);
  if (!match) return null;
  
  const username = match[1].toLowerCase();

  // If not logged in, skip DVM entirely
  if (!isLoggedIn()) {
    try { return await fallbackLookupProfile(username); } catch { return null; }
  }

  // Run DVM query and fallback in parallel; return the first non-null result
  const dvmPromise: Promise<NDKEvent | null> = (async () => {
    try {
      const events = await queryVertexDVM(username);
      return events[0] ?? null;
    } catch (error) {
      if ((error as Error)?.message === 'VERTEX_NO_CREDITS') {
        return null;
      }
      console.warn('Vertex DVM query failed, will rely on fallback if available:', error);
      return null;
    }
  })();

  const fallbackPromise: Promise<NDKEvent | null> = fallbackLookupProfile(username).catch((e) => {
    console.error('Fallback profile lookup failed:', e);
    return null;
  });

  // Helper to suppress null resolutions so Promise.race yields the first non-null
  const firstNonNull = <T,>(p: Promise<T | null>) => p.then((v) => (v !== null ? v : new Promise<never>(() => {})));

  try {
    const first = await Promise.race([
      firstNonNull(dvmPromise),
      firstNonNull(fallbackPromise)
    ]);
    if (first) return first;
  } catch {}

  // If neither produced a non-null quickly, await both and return whichever is available
  const [dvmRes, fbRes] = await Promise.all([dvmPromise, fallbackPromise]);
  return dvmRes || fbRes;
} 

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

    // 3) Otherwise treat as username and try Vertex DVM with fallback (single DVM attempt)
    let profileEvt: NDKEvent | null = null;
    try {
      profileEvt = await lookupVertexProfile(`p:${input}`);
    } catch {}
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

export async function getOldestProfileMetadata(pubkey: string): Promise<{ id: string; created_at: number } | null> {
  try {
    const events = await subscribeAndCollectProfiles({ kinds: [0], authors: [pubkey], limit: 8000 }, 8000);
    if (!events || events.length === 0) return null;
    let oldest: NDKEvent | null = null;
    for (const e of events) {
      if (!oldest || ((e.created_at || Number.MAX_SAFE_INTEGER) < (oldest.created_at || Number.MAX_SAFE_INTEGER))) {
        oldest = e;
      }
    }
    if (!oldest) return null;
    return { id: oldest.id, created_at: oldest.created_at as number };
  } catch {
    return null;
  }
}

export async function getNewestProfileMetadata(pubkey: string): Promise<{ id: string; created_at: number } | null> {
  try {
    const events = await subscribeAndCollectProfiles({ kinds: [0], authors: [pubkey], limit: 8000 }, 8000);
    if (!events || events.length === 0) return null;
    let newest: NDKEvent | null = null;
    for (const e of events) {
      if (!newest || ((e.created_at || 0) > (newest.created_at || 0))) {
        newest = e;
      }
    }
    if (!newest) return null;
    return { id: newest.id, created_at: newest.created_at as number };
  } catch {
    return null;
  }
}

// Return the full newest profile metadata NDKEvent for a pubkey
export async function getNewestProfileEvent(pubkey: string): Promise<NDKEvent | null> {
  try {
    const events = await subscribeAndCollectProfiles({ kinds: [0], authors: [pubkey], limit: 8000 }, 8000);
    if (!events || events.length === 0) return null;
    let newest: NDKEvent | null = null;
    for (const e of events) {
      if (!newest || ((e.created_at || 0) > (newest.created_at || 0))) {
        newest = e;
      }
    }
    return newest;
  } catch {
    return null;
  }
}
