import { ndk } from './ndk';
import { NDKEvent, NDKUser, NDKKind, NDKRelaySet, NDKSubscriptionCacheUsage, NDKFilter } from '@nostr-dev-kit/ndk';
import { Event, getEventHash, finalizeEvent, getPublicKey, generateSecretKey } from 'nostr-tools';
import { getStoredPubkey } from './nip07';

export const VERTEX_REGEXP = /^p:([a-zA-Z0-9_]+)$/;

// Create a specific relay set for the Vertex DVM
const dvmRelaySet = NDKRelaySet.fromRelayUrls(['wss://relay.vertexlab.io'], ndk);

// Fallback profile search relay set (NIP-50 capable)
const profileSearchRelaySet = NDKRelaySet.fromRelayUrls(['wss://relay.nostr.band'], ndk);

async function subscribeAndCollectProfiles(filter: NDKFilter, timeoutMs: number = 8000): Promise<NDKEvent[]> {
  return new Promise<NDKEvent[]>((resolve) => {
    const collected: Map<string, NDKEvent> = new Map();

    const sub = ndk.subscribe([filter], { closeOnEose: true, cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY }, profileSearchRelaySet);
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

interface VertexProfile {
  pubkey: string;
  name: string;
  display_name?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  lud16?: string;
  lud06?: string;
  website?: string;
  banner?: string;
}

async function queryVertexDVM(username: string): Promise<NDKEvent[]> {
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
        const sub = ndk.subscribe(
          [{ 
            kinds: [6315, 7000] as NDKKind[],
            ...requestEvent.filter()
          }],
          { 
            closeOnEose: false,
            cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY
          },
          dvmRelaySet
        );

        let settled = false;

        // Add event handlers after creating subscription
        sub.on('event', (event: NDKEvent) => {
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

            const bestMatch = records[0];
            if (bestMatch.pubkey) {
              console.log('Found valid profile record:', { 
                pubkey: bestMatch.pubkey,
                rank: bestMatch.rank
              });

              // Create an NDKUser object right away
              const user = new NDKUser({
                pubkey: bestMatch.pubkey
              });
              user.ndk = ndk;

              // Fetch the user's profile metadata
              user.fetchProfile()
                .then(() => {
                  console.log('Fetched profile:', user.profile);

                  // Create a profile event
                  const profileEvent = new NDKEvent(ndk, {
                    kind: 0,
                    created_at: Math.floor(Date.now() / 1000),
                    content: JSON.stringify(user.profile || {}),
                    pubkey: bestMatch.pubkey,
                    tags: [],
                    id: '',
                    sig: ''
                  });

                  // Set the author
                  profileEvent.author = user;
                  console.log('Created profile event:', { 
                    id: profileEvent.id,
                    pubkey: profileEvent.pubkey,
                    author: profileEvent.author.pubkey,
                    profile: user.profile
                  });

                  resolve([profileEvent]);
                })
                .catch((e) => {
                  console.warn('Could not fetch profile:', e);
                  // Still create a profile event even if we couldn't fetch the profile
                  const profileEvent = new NDKEvent(ndk, {
                    kind: 0,
                    created_at: Math.floor(Date.now() / 1000),
                    content: JSON.stringify({}),
                    pubkey: bestMatch.pubkey,
                    tags: [],
                    id: '',
                    sig: ''
                  });

                  // Set the author
                  profileEvent.author = user;
                  resolve([profileEvent]);
                });
            } else {
              console.log('No pubkey found in best match:', bestMatch);
              reject(new Error('No pubkey in response'));
            }
          } catch (e) {
            console.error('Error processing DVM response:', e);
            reject(e);
          }
        });

        sub.on('eose', () => {
          console.log('Got EOSE, publishing DVM request...');
          // Publish the request to the DVM relay set after we get EOSE
          requestEvent.publish(dvmRelaySet);
          console.log('Published DVM request:', { 
            id: requestEvent.id,
            kind: requestEvent.kind,
            tags: requestEvent.tags 
          });
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
  
  try {
    const events = await queryVertexDVM(username);
    return events[0] ?? null;
  } catch (error) {
    // Fallback when Vertex credits are not available
    if ((error as Error)?.message === 'VERTEX_NO_CREDITS') {
      try {
        const fallback = await fallbackLookupProfile(username);
        return fallback;
      } catch (e) {
        console.error('Fallback profile lookup failed:', e);
        return null;
      }
    }
    console.error('Error in lookupVertexProfile:', error);
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

async function countFollowerMentions(pubkeys: string[]): Promise<Map<string, number>> {
  if (pubkeys.length === 0) return new Map();
  const counts = new Map<string, number>();
  const batch = await subscribeAndCollectProfiles({ kinds: [3], ['#p' as any]: pubkeys, limit: 4000 } as unknown as NDKFilter, 6000);
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
  const exact = profiles.find((e) => {
    const n = extractNames(e);
    return (n.display || n.name || '').toLowerCase() === lower;
  });
  if (exact) return exact;

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
    return sorted[0];
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
  return sortedByCount[0];
}