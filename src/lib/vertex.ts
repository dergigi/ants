import { ndk } from './ndk';
import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { Relay, Event } from 'nostr-tools';
import { Nip07Signer } from './signer';

export const VERTEX_REGEXP = /^p:([a-zA-Z0-9_]+)$/;

// Singleton relay instance
let vertexRelay: Relay | null = null;

async function getVertexRelay(): Promise<Relay> {
  if (!vertexRelay) {
    vertexRelay = new Relay('wss://relay.vertexlab.io');
    await vertexRelay.connect();
  }
  return vertexRelay;
}

async function queryVertexDVM(username: string): Promise<Event[]> {
  try {
    const relay = await getVertexRelay();
    return new Promise((resolve, reject) => {
      const events: Event[] = [];
      
      // Subscribe to DVM response events (kind 6315)
      const sub = relay.subscribe([{ kinds: [6315] }], {
        onevent(event) {
          console.log('Received DVM response:', event);
          events.push(event);
        },
        oneose() {
          console.log('Received EOSE, found events:', events.length);
          resolve(events);
          sub.close();
        },
        onclose() {
          console.log('Subscription closed');
          reject();
        }
      });

      // Create and send DVM request event (kind 5315)
      const requestEvent: Event = {
        kind: 5315,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['param', 'search', username]],
        content: '',
        pubkey: '', // Will be set by signer
        id: '', // Will be set after signing
        sig: '' // Will be set by signer
      };

      // Sign and publish the request
      const signer = new Nip07Signer(''); // We'll get the pubkey from the signer
      signer.sign(requestEvent).then(sig => {
        requestEvent.sig = sig;
        relay.publish(requestEvent);
      });
    });
  } catch (error) {
    console.error('Error querying vertex DVM:', error);
    return [];
  }
}

export async function lookupVertexProfile(query: string): Promise<NDKEvent | null> {
  const match = query.match(VERTEX_REGEXP);
  if (!match) return null;
  
  const username = match[1].toLowerCase();
  console.log('Looking up profile for username:', username);
  
  try {
    // Query the DVM
    const events = await queryVertexDVM(username);
    
    if (events.length === 0) {
      console.log('No DVM response received');
      return null;
    }

    // Parse the DVM response
    const response = events[0];
    const results = JSON.parse(response.content);
    
    if (!results || results.length === 0) {
      console.log('No matching profiles found');
      return null;
    }

    // Get the highest ranked result
    const bestMatch = results[0];
    console.log('Found profile:', bestMatch);

    // Create NDK event from the result
    const event = new NDKEvent(ndk);
    event.pubkey = bestMatch.pubkey;
    event.author = new NDKUser({ pubkey: bestMatch.pubkey });
    event.kind = 0; // Profile event
    event.content = JSON.stringify({ name: username }); // Basic profile info
    
    return event;
  } catch (error) {
    console.error('Error looking up vertex profile:', error);
    return null;
  }
} 