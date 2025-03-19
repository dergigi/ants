import { ndk } from './ndk';
import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { Relay, Filter } from 'nostr-tools';

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
  
  try {
    // Query the vertex relay for profile events with a search filter
    const events = await queryVertexRelay({ 
      kinds: [0],
      search: username,
      limit: 10
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