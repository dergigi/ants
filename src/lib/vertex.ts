import { ndk } from './ndk';
import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { nip19, Relay, Filter } from 'nostr-tools';

export const VERTEX_REGEXP = /^p:([a-zA-Z0-9_]+)$/;

// Known npubs for specific users
const KNOWN_NPUBS: Record<string, string> = {
  dergigi: 'npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc',
  fiatjaf: 'npub1jaf8rd6ckp42qvz8kuk0ajdp75yvzqumql0zdy27umfmhj5rsvqqz4c5ux'
};

function getPubkey(npub: string): string | null {
  try {
    const { data } = nip19.decode(npub);
    return data as string;
  } catch (error) {
    console.error('Error decoding npub:', error);
    return null;
  }
}

// Singleton relay instance
let vertexRelay: Relay | null = null;

async function getVertexRelay(): Promise<Relay> {
  if (!vertexRelay) {
    vertexRelay = new Relay('wss://relay.vertexlab.io');
    await vertexRelay.connect();
  }
  return vertexRelay;
}

async function queryVertexRelay(filter: Filter): Promise<NDKEvent[]> {
  try {
    const relay = await getVertexRelay();
    return new Promise((resolve, reject) => {
      const events: NDKEvent[] = [];
      const sub = relay.subscribe([filter], {
        onevent(event) {
          const ndkEvent = new NDKEvent(ndk);
          ndkEvent.pubkey = event.pubkey;
          ndkEvent.content = event.content;
          events.push(ndkEvent);
        },
        oneose() {
          resolve(events);
          sub.close();
        },
        onclose() {
          if (events.length === 0) {
            reject(new Error('No events received'));
          } else {
            resolve(events);
          }
        }
      });
    });
  } catch (error) {
    console.error('Error querying vertex relay:', error);
    return [];
  }
}

export async function lookupVertexProfile(query: string): Promise<NDKEvent | null> {
  const match = query.match(VERTEX_REGEXP);
  if (!match) return null;
  
  const username = match[1].toLowerCase();
  
  // Check known npubs first
  if (KNOWN_NPUBS[username]) {
    const npub = KNOWN_NPUBS[username];
    const pubkey = getPubkey(npub);
    if (!pubkey) return null;

    const event = new NDKEvent(ndk);
    event.pubkey = pubkey;
    event.author = new NDKUser({ pubkey });
    return event;
  }
  
  try {
    // Query the vertex relay for profile events
    const events = await queryVertexRelay({ 
      kinds: [0],
      limit: 100
    });
    
    // Find matching profile by username in content
    const profile = events.find(event => {
      try {
        const content = JSON.parse(event.content);
        return (
          content.name?.toLowerCase() === username ||
          content.display_name?.toLowerCase() === username ||
          content.username?.toLowerCase() === username
        );
      } catch {
        return false;
      }
    });

    if (!profile) return null;
    
    const event = new NDKEvent(ndk);
    event.pubkey = profile.pubkey;
    event.author = new NDKUser({ pubkey: profile.pubkey });
    return event;
  } catch (error) {
    console.error('Error looking up vertex profile:', error);
    return null;
  }
} 