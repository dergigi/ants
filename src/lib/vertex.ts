import { ndk, safePublish, safeSubscribe } from './ndk';
import { nip19 } from 'nostr-tools';
import { NDKEvent, NDKUser, NDKKind, NDKSubscriptionCacheUsage, NDKFilter, type NDKUserProfile } from '@nostr-dev-kit/ndk';
import { Event, getEventHash, finalizeEvent, getPublicKey, generateSecretKey } from 'nostr-tools';
import { getStoredPubkey } from './nip07';
import { relaySets } from './relays';
import { hasLocalStorage, loadMapFromStorage, saveMapToStorage } from './storageCache';

export const VERTEX_REGEXP = /^p:([a-zA-Z0-9_]+)$/;

// Create a specific relay set for the Vertex DVM
const dvmRelaySet = relaySets.vertexDvm();

// Fallback profile search relay set (NIP-50 capable)
const profileSearchRelaySet = relaySets.profileSearch();

// In-memory cache for DVM profile lookups: key=username(lower), value=array of profile events
type DvmCacheEntry = { events: NDKEvent[] | null; timestamp: number };
const DVM_CACHE = new Map<string, DvmCacheEntry>();
const DVM_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DVM_NEGATIVE_TTL_MS = 60 * 1000; // 1 minute for negative results
const DVM_CACHE_STORAGE_KEY = 'ants_dvm_cache_v1';

type DvmStoredRecord = {
  pubkey: string;
  profile?: { name?: string; displayName?: string; about?: string; nip05?: string; image?: string };
};

function serializeDvmEvents(events: NDKEvent[] | null): DvmStoredRecord[] {
  if (!events || events.length === 0) return [];
  const records: DvmStoredRecord[] = [];
  for (const evt of events) {
    const pubkey = (evt.pubkey || evt.author?.pubkey || '').trim();
    if (!pubkey) continue;
    const fields = extractProfileFields(evt);
    const profile: { name?: string; displayName?: string; about?: string; nip05?: string; image?: string } | undefined = (
      fields.name || fields.display || fields.about || fields.nip05 || fields.image
    ) ? {
      name: fields.name,
      displayName: fields.display,
      about: fields.about,
      nip05: fields.nip05,
      image: fields.image
    } : undefined;
    records.push({ pubkey, profile });
  }
  return records;
}

function deserializeDvmEvents(records: DvmStoredRecord[]): NDKEvent[] {
  const events: NDKEvent[] = [];
  for (const rec of records) {
    const user = new NDKUser({ pubkey: rec.pubkey });
    user.ndk = ndk;
    if (rec.profile) {
      (user as NDKUser & { profile: typeof rec.profile }).profile = { ...rec.profile } as unknown as typeof rec.profile;
    }
    const plain: Event = {
      kind: 0,
      created_at: Math.floor(Date.now() / 1000),
      content: JSON.stringify({
        name: rec.profile?.name,
        display_name: rec.profile?.displayName || rec.profile?.name,
        about: rec.profile?.about,
        nip05: rec.profile?.nip05,
        image: rec.profile?.image
      }),
      pubkey: rec.pubkey,
      tags: [],
      id: '',
      sig: ''
    };
    plain.id = getEventHash(plain);
    const evt = new NDKEvent(ndk, plain);
    evt.author = user;
    events.push(evt);
  }
  return events;
}

function saveDvmCacheToStorage(): void {
  try {
    if (!hasLocalStorage()) return;
    const out = new Map<string, { records: DvmStoredRecord[]; timestamp: number }>();
    for (const [key, entry] of DVM_CACHE.entries()) {
      const records = serializeDvmEvents(entry.events);
      out.set(key, { records, timestamp: entry.timestamp });
    }
    saveMapToStorage(DVM_CACHE_STORAGE_KEY, out);
  } catch {
    // ignore
  }
}

function loadDvmCacheFromStorage(): void {
  try {
    if (!hasLocalStorage()) return;
    const loaded = loadMapFromStorage<{ records: DvmStoredRecord[]; timestamp: number }>(DVM_CACHE_STORAGE_KEY);
    for (const [key, stored] of loaded.entries()) {
      const events = deserializeDvmEvents(stored.records || []);
      DVM_CACHE.set(key, { events, timestamp: stored.timestamp || Date.now() });
    }
  } catch {
    // ignore
  }
}

// Initialize persistent DVM cache on module load (browser only)
loadDvmCacheFromStorage();

function getCachedDvm(usernameLower: string): NDKEvent[] | null | undefined {
  const entry = DVM_CACHE.get(usernameLower);
  if (!entry) return undefined;
  const ttl = entry.events && entry.events.length > 0 ? DVM_CACHE_TTL_MS : DVM_NEGATIVE_TTL_MS;
  if (Date.now() - entry.timestamp > ttl) {
    DVM_CACHE.delete(usernameLower);
    return undefined;
  }
  return entry.events;
}

function setCachedDvm(usernameLower: string, events: NDKEvent[] | null): void {
  DVM_CACHE.set(usernameLower, { events, timestamp: Date.now() });
  saveDvmCacheToStorage();
}

function isLoggedIn(): boolean {
  return Boolean(getStoredPubkey());
}

async function subscribeAndCollectProfiles(filter: NDKFilter, timeoutMs: number = 8000): Promise<NDKEvent[]> {
  return new Promise<NDKEvent[]>((resolve) => {
    const collected: Map<string, NDKEvent> = new Map();

    const sub = safeSubscribe(
      [filter],
      { closeOnEose: true, cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY, relaySet: profileSearchRelaySet }
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
  });
}
export async function resolveNip05ToPubkey(nip05: string): Promise<string | null> {
  try {
    const input = nip05.trim();
    const cleaned = input.startsWith('@') ? input.slice(1) : input;
    const [nameRaw, domainRaw] = cleaned.includes('@') ? cleaned.split('@') : ['_', cleaned];
    const name = nameRaw || '_';
    const domain = (domainRaw || '').trim();
    if (!domain) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    const mapped = (data?.names?.[name] as string | undefined) || null;
    return mapped;
  } catch {
    return null;
  }
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


// (intentionally left without VertexProfile interface; we operate directly on events)

async function queryVertexDVM(username: string, limit: number = 10): Promise<NDKEvent[]> {
  try {
    // Check cache first
    const key = (username || '').toLowerCase();
    const cached = getCachedDvm(key);
    if (cached !== undefined) {
      return (cached || []).slice(0, Math.max(0, limit));
    }

    console.log('Starting DVM query for username:', username);
    const storedPubkey = getStoredPubkey();
    
    const requestId = Math.random().toString(36).substring(7);
    console.log('Generated requestId:', requestId);
    
    // Create a plain event first
    const plainEvent: Event = {
      kind: 5315,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['param', 'search', username],
        // Sort behavior: personalized when logged in, otherwise global
        ['param', 'sort', storedPubkey ? 'personalizedPagerank' : 'globalPagerank'],
        ['request_id', requestId]
      ],
      content: '',
      pubkey: storedPubkey || '',
      id: '',
      sig: ''
    };
    console.log('Created DVM request event:', plainEvent);

    // If personalized, include explicit source tag
    if (storedPubkey) {
      plainEvent.tags.push(['param', 'source', storedPubkey]);
    }

    // Sign the event
    if (storedPubkey && ndk.signer) {
      // Use the connected signer (NIP-07)
      plainEvent.id = getEventHash(plainEvent);
      const signature = await ndk.signer.sign(plainEvent);
      plainEvent.sig = signature;
      console.log('Signed DVM request event (user):', { id: plainEvent.id, sig: signature.slice(0, 10) + '...' });
    } else {
      // Either not logged in or signer is not available: sign with an ephemeral key
      const sk = generateSecretKey();
      const pk = getPublicKey(sk);
      plainEvent.pubkey = pk;
      const finalized = finalizeEvent(plainEvent, sk);
      plainEvent.id = finalized.id;
      plainEvent.sig = finalized.sig;
      console.log('Signed DVM request event (ephemeral):', { id: plainEvent.id, pubkey: plainEvent.pubkey });
    }

    // Create an NDKEvent from the signed event
    const requestEvent = new NDKEvent(ndk, plainEvent);
    console.log('Created NDK event for DVM request');

    return new Promise<NDKEvent[]>((resolve, reject) => {
      try {
        console.log('Setting up DVM subscription...');
        const dvmFilter = { 
          kinds: [6315, 7000] as NDKKind[],
          ...requestEvent.filter()
        };
        
        const sub = safeSubscribe(
          [dvmFilter],
          { 
            closeOnEose: false,
            cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
            relaySet: dvmRelaySet
          }
        );
        
        if (!sub) {
          console.warn('Failed to create DVM subscription');
          reject(new Error('Failed to create DVM subscription'));
          return;
        }

        let settled = false;

        // Add event handlers after creating subscription
        sub.on('event', async (event: NDKEvent) => {
          console.log('Received DVM event:', {
            kind: event.kind,
            id: event.id,
            tags: event.tags,
            content: event.content.slice(0, 100) + '...'
          });

          if (event.kind === 7000) {
            const statusTag = event.tags.find((tag: string[]) => tag[0] === 'status');
            const status = statusTag?.[2] ?? statusTag?.[1];
            if (status) {
              console.log('DVM status update:', status);
              if (!settled && /credit/i.test(status)) {
                settled = true;
                try { sub.stop(); } catch {}
                reject(new Error('VERTEX_NO_CREDITS'));
                return;
              }
            }
            return;
          }

          // Stop subscription immediately when we get a valid response
          console.log('Got valid DVM response, stopping subscription');
          sub.stop();

          try {
            console.log('Parsing DVM response content...');
            const records = JSON.parse(event.content);
            if (!Array.isArray(records) || records.length === 0) {
              console.log('No valid records found in DVM response');
              reject(new Error('No results found'));
              return;
            }

            // Create profile events for up to `limit` results, preserving DVM rank order
            const top = records.slice(0, Math.max(1, limit));
            type DVMRecord = { pubkey?: string };
            const users = top.map((rec: DVMRecord) => {
              const pk = rec?.pubkey as string | undefined;
              if (!pk) return null;
              const user = new NDKUser({ pubkey: pk });
              user.ndk = ndk;
              return user;
            }).filter(Boolean) as NDKUser[];

            await Promise.allSettled(users.map((u) => u.fetchProfile()));

            const events: NDKEvent[] = users.map((user) => {
              const plain: Event = {
                kind: 0,
                created_at: Math.floor(Date.now() / 1000),
                content: JSON.stringify(user.profile || {}),
                pubkey: user.pubkey,
                tags: [],
                id: '',
                sig: ''
              };
              // Deterministic id for React keys, not signed
              plain.id = getEventHash(plain);
              const profileEvent = new NDKEvent(ndk, plain);
              profileEvent.author = user;
              return profileEvent;
            });

            // Store in cache (positive)
            setCachedDvm(key, events);
            resolve(events);
          } catch (e) {
            console.error('Error processing DVM response:', e);
            reject(e);
          }
        });

        sub.on('eose', async () => {
          console.log('Got EOSE, publishing DVM request...');
          // Publish the request to the DVM relay set after we get EOSE
          const published = await safePublish(requestEvent, dvmRelaySet);
          if (published) {
            console.log('Published DVM request:', { 
              id: requestEvent.id,
              kind: requestEvent.kind,
              tags: requestEvent.tags 
            });
          } else {
            console.warn('DVM request publish failed, but continuing with subscription...');
          }
        });
        
        console.log('Starting DVM subscription...');
        sub.start();
      } catch (e) {
        console.error('Error in subscription:', e);
        reject(e);
      }
    });
  } catch (error) {
    console.error('Error in queryVertexDVM:', error);
    // Cache negative outcome briefly to avoid thrashing
    try {
      const key = (username || '').toLowerCase();
      setCachedDvm(key, null);
    } catch {}
    throw error;
  }
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

async function getDirectFollows(pubkey: string): Promise<Set<string>> {
  const events = await subscribeAndCollectProfiles({ kinds: [3], authors: [pubkey], limit: 1 });
  const follows = new Set<string>();
  if (events.length === 0) return follows;
  const event = events[0];
  for (const tag of event.tags as unknown as string[][]) {
    if (Array.isArray(tag) && tag[0] === 'p' && tag[1]) {
      follows.add(tag[1]);
    }
  }
  return follows;
}

type TagPFilter = NDKFilter & { '#p'?: string[] };

async function countFollowerMentions(pubkeys: string[]): Promise<Map<string, number>> {
  if (pubkeys.length === 0) return new Map();
  const counts = new Map<string, number>();
  const tagFilter: TagPFilter = { kinds: [3], '#p': pubkeys, limit: 4000 };
  const batch = await subscribeAndCollectProfiles(tagFilter, 6000);
  for (const evt of batch) {
    for (const tag of evt.tags as unknown as string[][]) {
      if (Array.isArray(tag) && tag[0] === 'p' && tag[1] && pubkeys.includes(tag[1])) {
        counts.set(tag[1], (counts.get(tag[1]) || 0) + 1);
      }
    }
  }
  return counts;
}

async function fallbackLookupProfile(username: string): Promise<NDKEvent | null> {
  // 1) Search kind 0 profiles by username term
  const profiles = await subscribeAndCollectProfiles({ kinds: [0], search: username, limit: 21 });
  if (profiles.length === 0) return null;

  // Prefer exact name/display_name match when available
  function extractNames(e: NDKEvent): { name?: string; display?: string } {
    try {
      const content = JSON.parse(e.content || '{}');
      return { name: content.name, display: content.display_name };
    } catch {
      return {};
    }
  }

  const lower = username.toLowerCase();

  // Helper: ensure the returned event has an author with pubkey set
  const ensureAuthor = (evt: NDKEvent): NDKEvent => {
    const pk = evt.pubkey || evt.author?.pubkey;
    if (pk && !evt.author) {
      const user = new NDKUser({ pubkey: pk });
      user.ndk = ndk;
      // Optionally attach minimal profile fields for better UI
      const fields = extractProfileFields(evt);
      (user as NDKUser & { profile?: NDKUserProfile | undefined }).profile = {
        name: fields.name,
        displayName: fields.display,
        about: fields.about,
        nip05: fields.nip05,
        image: fields.image
      } as NDKUserProfile;
      evt.author = user;
    }
    return evt;
  };
  const exact = profiles.find((e) => {
    const n = extractNames(e);
    return (n.display || n.name || '').toLowerCase() === lower;
  });
  if (exact) return ensureAuthor(exact);

  const storedPubkey = getStoredPubkey();
  if (storedPubkey) {
    const follows = await getDirectFollows(storedPubkey);
    const sorted = [...profiles].sort((a, b) => {
      const af = follows.has(a.pubkey || a.author?.pubkey || '');
      const bf = follows.has(b.pubkey || b.author?.pubkey || '');
      if (af !== bf) return af ? -1 : 1;
      // Tie-breaker: shorter Levenshtein-like by prefix match
      const an = (extractNames(a).display || extractNames(a).name || '').toLowerCase();
      const bn = (extractNames(b).display || extractNames(b).name || '').toLowerCase();
      const ap = an.startsWith(lower) ? 0 : 1;
      const bp = bn.startsWith(lower) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return an.localeCompare(bn);
    });
    return ensureAuthor(sorted[0]);
  }

  // Not logged in: sort by follower count across relays
  const candidatePubkeys = profiles.map((e) => e.pubkey || e.author?.pubkey).filter(Boolean) as string[];
  const counts = await countFollowerMentions(candidatePubkeys);
  const sortedByCount = [...profiles].sort((a, b) => {
    const ac = counts.get((a.pubkey || a.author?.pubkey) as string) || 0;
    const bc = counts.get((b.pubkey || b.author?.pubkey) as string) || 0;
    if (ac !== bc) return bc - ac;
    // Tie-breaker by prefix match then alphabetic
    const an = (extractNames(a).display || extractNames(a).name || '') as string;
    const bn = (extractNames(b).display || extractNames(b).name || '') as string;
    const ap = an.toLowerCase().startsWith(lower) ? 0 : 1;
    const bp = bn.toLowerCase().startsWith(lower) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return an.localeCompare(bn);
  });
  return ensureAuthor(sortedByCount[0]);
}

// Simple in-memory cache for NIP-05 verification results
const nip05VerificationCache = new Map<string, boolean>();

function normalizeNip05String(input: string): string {
  const raw = (input || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  // If value starts with '@domain', treat as top-level => '_@domain'
  if (lower.startsWith('@')) {
    const domain = lower.slice(1).trim();
    return domain ? `_${'@'}${domain}` : '';
  }
  // If there is no '@', treat as domain-only => '_@domain'
  if (!lower.includes('@')) {
    return `_${'@'}${lower}`;
  }
  // If local part is empty, normalize to '_'
  const [local, domain] = lower.split('@');
  if (!domain) return '';
  const normalizedLocal = local && local.length > 0 ? local : '_';
  return `${normalizedLocal}${'@'}${domain}`;
}

async function verifyNip05(pubkeyHex: string, nip05?: string): Promise<boolean> {
  if (!nip05) return false;
  const normalized = normalizeNip05String(nip05);
  if (!normalized) return false;
  const cacheKey = `${normalized}|${pubkeyHex}`;
  if (nip05VerificationCache.has(cacheKey)) return nip05VerificationCache.get(cacheKey) as boolean;
  try {
    // Use NDK's built-in verification for DRYness and consistency
    const user = new NDKUser({ pubkey: pubkeyHex });
    user.ndk = ndk;
    const maybeVerify = (user as unknown as { verifyNip05?: (nip05: string) => Promise<boolean> }).verifyNip05;
    if (typeof maybeVerify === 'function') {
      const ok = await maybeVerify.call(user, normalized);
      nip05VerificationCache.set(cacheKey, ok);
      return ok;
    }
    // If verifyNip05 is not available, treat as unverifiable rather than duplicating logic
    nip05VerificationCache.set(cacheKey, false);
    return false;
  } catch {
    const cacheKey = `${normalized}|${pubkeyHex}`;
    nip05VerificationCache.set(cacheKey, false);
    return false;
  }
}

// Invalidate one cached NIP-05 verification entry
export function invalidateNip05Cache(pubkeyHex: string, nip05: string): void {
  try { nip05VerificationCache.delete(`${nip05}|${pubkeyHex}`); } catch {}
}

// Force re-validation bypassing cache
export async function reverifyNip05(pubkeyHex: string, nip05: string): Promise<boolean> {
  const normalized = normalizeNip05String(nip05);
  invalidateNip05Cache(pubkeyHex, normalized || nip05);
  return verifyNip05(pubkeyHex, normalized || nip05);
}

// Re-validate with debug steps for UI
export async function reverifyNip05WithDebug(pubkeyHex: string, nip05: string): Promise<{ ok: boolean; steps: string[] }> {
  const steps: string[] = [];
  try {
    const raw = (nip05 || '').trim();
    if (!raw) return { ok: false, steps: [...steps, 'No nip05 provided'] };
    steps.push(`Input: ${raw}`);
    const normalized = normalizeNip05String(raw);
    if (normalized !== raw) steps.push(`Normalized: ${normalized}`);
    // Delegate to NDK for verification
    const user = new NDKUser({ pubkey: pubkeyHex });
    user.ndk = ndk;
    const maybeVerify = (user as unknown as { verifyNip05?: (nip05: string) => Promise<boolean> }).verifyNip05;
    if (typeof maybeVerify !== 'function') {
      steps.push('NDK verifyNip05 not available');
      return { ok: false, steps };
    }
    steps.push('NDK: calling user.verifyNip05');
    const ok = await maybeVerify.call(user, normalized || raw);
    steps.push(`NDK result: ${ok ? 'MATCH' : 'NO MATCH'}`);
    return { ok, steps };
  } catch (e) {
    steps.push(`Exception: ${(e as Error)?.message || 'unknown'}`);
    return { ok: false, steps };
  }
}

function extractProfileFields(event: NDKEvent): { name?: string; display?: string; about?: string; nip05?: string; image?: string } {
  try {
    const content = JSON.parse(event.content || '{}');
    return {
      name: content.name,
      display: content.display_name || content.displayName,
      about: content.about,
      nip05: content.nip05,
      image: content.image || content.picture
    };
  } catch {
    return {};
  }
}

function computeMatchScore(termLower: string, name?: string, display?: string, about?: string, nip05?: string): number {
  let score = 0;
  const n = (name || '').toLowerCase();
  const d = (display || '').toLowerCase();
  const a = (about || '').toLowerCase();
  const n5 = (nip05 || '').toLowerCase();
  if (!termLower) return 0;
  const exact = d === termLower || n === termLower;
  const starts = d.startsWith(termLower) || n.startsWith(termLower);
  const contains = d.includes(termLower) || n.includes(termLower);
  if (exact) score += 40;
  else if (starts) score += 30;
  else if (contains) score += 20;
  if (a.includes(termLower)) score += 10;
  // Consider NIP-05 string with strong weighting; top-level (no local part) scores highest
  if (n5) {
    const [localRaw, domainRaw] = n5.includes('@') ? n5.split('@') : ['_', n5];
    const local = (localRaw || '').trim();
    const domain = (domainRaw || '').trim();
    const isTop = local === '' || local === '_';
    if (isTop) {
      if (domain === termLower) score += 120; // top-level exact
      else if (domain.startsWith(termLower)) score += 90; // top-level starts
      else if (domain.includes(termLower)) score += 70; // top-level contains
    } else {
      const full = `${local}@${domain}`;
      if (full === termLower || local === termLower || domain === termLower) score += 90; // exact on any part
      else if (full.startsWith(termLower) || local.startsWith(termLower) || domain.startsWith(termLower)) score += 70;
      else if (full.includes(termLower) || local.includes(termLower) || domain.includes(termLower)) score += 50;
    }
  }
  return score;
}

export async function searchProfilesFullText(term: string, limit: number = 50): Promise<NDKEvent[]> {
  const query = term.trim();
  if (!query) return [];

  // Step 0: try Vertex DVM for top ranked results (only when logged in)
  let vertexEvents: NDKEvent[] = [];
  if (isLoggedIn()) {
    try {
      vertexEvents = await queryVertexDVM(query, Math.min(10, limit));
      for (const v of vertexEvents) {
        (v as unknown as { debugScore?: string }).debugScore = 'DVM-ranked result';
      }
    } catch (e) {
      if ((e as Error)?.message !== 'VERTEX_NO_CREDITS') {
        console.warn('Vertex aggregation failed, proceeding with fallback ranking:', e);
      }
    }
  }

  // Step 1: fetch candidate profiles from NIP-50 capable relay(s)
  const candidates = await subscribeAndCollectProfiles({ kinds: [0], search: query, limit: Math.max(limit, 200) });
  // If the NIP-50 relay returns nothing but DVM returned results, use DVM results directly
  if (candidates.length === 0) {
    return vertexEvents.slice(0, limit);
  }

  const termLower = query.toLowerCase();
  const storedPubkey = getStoredPubkey();
  const follows: Set<string> = storedPubkey ? await getDirectFollows(storedPubkey) : new Set<string>();

  // Step 2: build enriched rows with preliminary score and schedule NIP-05 verifications (limited)
  const verificationLimit = Math.min(candidates.length, 50);
  const verifications: Array<Promise<boolean>> = [];

  type EnrichedRow = {
    event: NDKEvent;
    pubkey: string;
    name: string;
    baseScore: number;
    isFriend: boolean;
    nip05?: string;
    verifyPromise: Promise<boolean> | null;
    finalScore?: number;
    verified?: boolean;
  };

  type UserProfile = {
    name?: string;
    displayName?: string;
    about?: string;
    nip05?: string;
    image?: string;
  };

  const enriched: EnrichedRow[] = candidates.map((evt, idx) => {
    const pubkey = evt.pubkey || evt.author?.pubkey || '';
    const { name, display, about, nip05, image } = extractProfileFields(evt);
    const nameForAuthor = display || name || '';

    // Ensure author is set for UI
    if (!evt.author && pubkey) {
      const user = new NDKUser({ pubkey });
      user.ndk = ndk;
      (user as NDKUser & { profile: UserProfile }).profile = {
        name: name,
        displayName: display,
        about,
        nip05,
        image
      };
      evt.author = user;
    } else if (evt.author) {
      // Populate minimal profile if missing
      if (!evt.author.profile) {
        (evt.author as NDKUser & { profile: UserProfile }).profile = {
          name: name,
          displayName: display,
          about,
          nip05,
          image
        };
      }
    }

    const baseScore = computeMatchScore(termLower, name, display, about, nip05);
    const isFriend = storedPubkey ? follows.has(pubkey) : false;

    let verifyPromise: Promise<boolean> | null = null;
    if (idx < verificationLimit) {
      verifyPromise = verifyNip05(pubkey, nip05);
      verifications.push(verifyPromise);
    }

    return {
      event: evt,
      pubkey,
      name: nameForAuthor,
      baseScore,
      isFriend,
      nip05,
      verifyPromise
    };
  });

  // Step 3: await the scheduled verifications concurrently
  await Promise.allSettled(verifications);

  // Step 4: assign final score and sort
  for (const row of enriched) {
    const verified = row.verifyPromise ? await row.verifyPromise.catch(() => false) : false;
    let score = row.baseScore;
    if (verified) score += 100;
    if (row.isFriend) score += 50;
    row.finalScore = score;
    row.verified = verified;
    try {
      const termLower2 = query.toLowerCase();
      const nameLower = (row.name || '').toLowerCase();
      const displayLower = ((row.event.author?.profile as { displayName?: string; name?: string } | undefined)?.displayName || (row.event.author?.profile as { name?: string } | undefined)?.name || '').toLowerCase();
      const aboutLower = ((row.event.author?.profile as { about?: string } | undefined)?.about || '').toLowerCase();
      const nip05Lower = ((row.event.author?.profile as { nip05?: string } | undefined)?.nip05 || '').toLowerCase();
      const [n5LocalRaw, n5DomainRaw] = nip05Lower.includes('@') ? nip05Lower.split('@') : ['_', nip05Lower];
      const n5Local = (n5LocalRaw || '').trim();
      const n5Domain = (n5DomainRaw || '').trim();
      const n5Top = n5Local === '' || n5Local === '_';
      const n5Exact = n5Top ? (n5Domain === termLower2) : ([`${n5Local}@${n5Domain}`, n5Local, n5Domain].includes(termLower2));
      const n5Starts = n5Top ? (n5Domain.startsWith(termLower2)) : ([`${n5Local}@${n5Domain}`, n5Local, n5Domain].some((v) => v.startsWith(termLower2)));
      const n5Contains = n5Top ? (n5Domain.includes(termLower2)) : ([`${n5Local}@${n5Domain}`, n5Local, n5Domain].some((v) => v.includes(termLower2)));
      const exact = [nameLower, displayLower].includes(termLower2) || n5Exact;
      const starts = [nameLower, displayLower].some((v) => v.startsWith(termLower2)) || n5Starts;
      const contains = [nameLower, displayLower].some((v) => v.includes(termLower2)) || n5Contains;
      const about = aboutLower.includes(termLower2);
      const parts: string[] = [`base=${row.baseScore}`];
      if (verified) parts.push('verified=+100');
      if (row.isFriend) parts.push('friend=+50');
      const matchParts: string[] = [];
      if (exact) matchParts.push('exact');
      else if (starts) matchParts.push('starts');
      else if (contains) matchParts.push('contains');
      if (about) matchParts.push('about');
      if (nip05Lower) matchParts.push(n5Top ? 'nip05(top)' : 'nip05');
      const dbg = `score: ${parts.join(' + ')} = ${row.finalScore}; match: ${matchParts.join(', ') || 'none'}`;
      (row.event as unknown as { debugScore?: string }).debugScore = dbg;
    } catch {}
  }

  enriched.sort((a, b) => {
    const as = a.finalScore || 0;
    const bs = b.finalScore || 0;
    if (as !== bs) return bs - as;
    // Tie-breakers: friend first, then name lexicographically
    if (a.isFriend !== b.isFriend) return a.isFriend ? -1 : 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  // Step 5: prepend Vertex results, then append ranked fallback, dedup by pubkey
  const seen = new Set<string>();
  const ordered: NDKEvent[] = [];

  const pushIfNew = (evt: NDKEvent) => {
    const pk = evt.pubkey || evt.author?.pubkey || '';
    if (!pk || seen.has(pk)) return;
    seen.add(pk);
    // Ensure kind is 0 and author is set
    if (!evt.kind) evt.kind = 0;
    if (!evt.author && pk) {
      const user = new NDKUser({ pubkey: pk });
      user.ndk = ndk;
      evt.author = user;
    }
    ordered.push(evt);
  };

  for (const v of vertexEvents) pushIfNew(v);
  for (const r of enriched.map((e) => e.event)) pushIfNew(r);

  return ordered.slice(0, limit);
}