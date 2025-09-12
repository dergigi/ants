import { ndk, safePublish, safeSubscribe } from './ndk';
import { NDKEvent, NDKUser, NDKKind, NDKSubscriptionCacheUsage, NDKFilter, type NDKUserProfile } from '@nostr-dev-kit/ndk';
import { Event, getEventHash, finalizeEvent, getPublicKey, generateSecretKey } from 'nostr-tools';
import { getStoredPubkey } from './nip07';
import { relaySets } from './relays';

export const VERTEX_REGEXP = /^p:([a-zA-Z0-9_]+)$/;

// Create a specific relay set for the Vertex DVM
const dvmRelaySet = relaySets.vertexDvm();

// Fallback profile search relay set (NIP-50 capable)
const profileSearchRelaySet = relaySets.profileSearch();

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
    throw error;
  }
}

export async function lookupVertexProfile(query: string): Promise<NDKEvent | null> {
  const match = query.match(VERTEX_REGEXP);
  if (!match) return null;
  
  const username = match[1].toLowerCase();
  
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

async function verifyNip05(pubkeyHex: string, nip05?: string): Promise<boolean> {
  if (!nip05) return false;
  const cacheKey = `${nip05}|${pubkeyHex}`;
  if (nip05VerificationCache.has(cacheKey)) return nip05VerificationCache.get(cacheKey) as boolean;
  try {
    const parts = nip05.includes('@') ? nip05.split('@') : ['_', nip05];
    const name = parts[0] || '_';
    const domain = (parts[1] || '').trim();
    if (!domain) {
      nip05VerificationCache.set(cacheKey, false);
      return false;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      nip05VerificationCache.set(cacheKey, false);
      return false;
    }
    const data = await res.json();
    const mapped = (data?.names?.[name] as string | undefined)?.toLowerCase();
    const result = mapped === pubkeyHex.toLowerCase();
    nip05VerificationCache.set(cacheKey, result);
    return result;
  } catch {
    const cacheKey = `${nip05}|${pubkeyHex}`;
    nip05VerificationCache.set(cacheKey, false);
    return false;
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

function computeMatchScore(termLower: string, name?: string, display?: string, about?: string): number {
  let score = 0;
  const n = (name || '').toLowerCase();
  const d = (display || '').toLowerCase();
  const a = (about || '').toLowerCase();
  if (!termLower) return 0;
  const exact = d === termLower || n === termLower;
  const starts = d.startsWith(termLower) || n.startsWith(termLower);
  const contains = d.includes(termLower) || n.includes(termLower);
  if (exact) score += 40;
  else if (starts) score += 30;
  else if (contains) score += 20;
  if (a.includes(termLower)) score += 10;
  return score;
}

export async function searchProfilesFullText(term: string, limit: number = 50): Promise<NDKEvent[]> {
  const query = term.trim();
  if (!query) return [];

  // Step 0: try Vertex DVM for top ranked results
  let vertexEvents: NDKEvent[] = [];
  try {
    vertexEvents = await queryVertexDVM(query, Math.min(10, limit));
  } catch (e) {
    if ((e as Error)?.message !== 'VERTEX_NO_CREDITS') {
      console.warn('Vertex aggregation failed, proceeding with fallback ranking:', e);
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

    const baseScore = computeMatchScore(termLower, name, display, about);
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