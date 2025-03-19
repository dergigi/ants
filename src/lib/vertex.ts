import { ndk } from './ndk';
import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { Relay, Filter, Event } from 'nostr-tools';

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

async function queryVertexRelay(filter: Filter): Promise<Event[]> {
  try {
    const relay = await getVertexRelay();
    return new Promise((resolve, reject) => {
      const events: Event[] = [];
      console.log('Subscribing to vertex relay with filter:', filter);
      const sub = relay.subscribe([filter], {
        onevent(event) {
          console.log('Received event:', event);
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
  console.log('Looking up profile for username:', username);
  
  try {
    // Query the vertex relay for profile events
    const events = await queryVertexRelay({ 
      kinds: [0],
      limit: 100
    });
    
    console.log('Found events:', events.length);
    
    // Find matching profile by username in content
    const profile = events.find(event => {
      try {
        const content = JSON.parse(event.content);
        console.log('Checking content:', content);
        return (
          content.name?.toLowerCase() === username ||
          content.display_name?.toLowerCase() === username ||
          content.username?.toLowerCase() === username
        );
      } catch (error) {
        console.error('Error parsing content:', error);
        return false;
      }
    });

    if (!profile) {
      console.log('No matching profile found');
      return null;
    }
    
    console.log('Found matching profile:', profile);
    const event = new NDKEvent(ndk);
    event.pubkey = profile.pubkey;
    event.author = new NDKUser({ pubkey: profile.pubkey });
    return event;
  } catch (error) {
    console.error('Error looking up vertex profile:', error);
    return null;
  }
} 