import { NDKEvent, NDKUser, NDKKind, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import { Event, getEventHash, finalizeEvent, getPublicKey, generateSecretKey } from 'nostr-tools';
import { ndk, safePublish, safeSubscribe } from '../ndk';
import { relaySets } from '../relays';
import { getStoredPubkey } from '../nip07';
import { getCachedDvm, setCachedDvm } from './cache';

export const VERTEX_REGEXP = /^p:([a-zA-Z0-9_]+)$/;

// Query Vertex DVM for username resolution
export async function queryVertexDVM(username: string, limit: number = 10): Promise<NDKEvent[]> {
  try {
    // Check cache first
    const key = (username || '').toLowerCase();
    const cached = getCachedDvm(key);
    if (cached !== undefined) {
      return (cached || []).slice(0, Math.max(0, limit));
    }

    // debug removed
    const storedPubkey = getStoredPubkey();
    
    const requestId = Math.random().toString(36).substring(7);
    
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
    // created DVM request event

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
      // signed DVM request event (user)
    } else {
      // Either not logged in or signer is not available: sign with an ephemeral key
      const sk = generateSecretKey();
      const pk = getPublicKey(sk);
      plainEvent.pubkey = pk;
      const finalized = finalizeEvent(plainEvent, sk);
      plainEvent.id = finalized.id;
      plainEvent.sig = finalized.sig;
      // signed DVM request event (ephemeral)
    }

    // Create an NDKEvent from the signed event
    const requestEvent = new NDKEvent(ndk, plainEvent);

    return new Promise<NDKEvent[]>((resolve, reject) => {
      try {
        // setting up DVM subscription
        const dvmFilter = { 
          kinds: [6315, 7000] as NDKKind[],
          '#e': [requestEvent.id!]
        };
        
        (async () => {
          const relaySet = await relaySets.vertexDvm();
          const sub = safeSubscribe(
            [dvmFilter],
            { 
              closeOnEose: false,
              cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
              relaySet
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

            if (event.kind === 7000) {
              const statusTag = event.tags.find((tag: string[]) => tag[0] === 'status');
              const status = statusTag?.[2] ?? statusTag?.[1];
              if (status) {
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
            sub.stop();

            try {
              const records = JSON.parse(event.content);
              if (!Array.isArray(records) || records.length === 0) {
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
            // Publish the request to the DVM relay set after we get EOSE
            const rs = await relaySets.vertexDvm();
            const published = await safePublish(requestEvent, rs);
            if (published) {
              // published DVM request
            } else {
              console.warn('DVM request publish failed, but continuing with subscription...');
            }
          });
          
          sub.start();
        })();
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
