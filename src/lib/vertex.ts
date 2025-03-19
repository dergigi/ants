import { ndk } from './ndk';
import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';

export const VERTEX_REGEXP = /^p:([a-zA-Z0-9_]+)$/;

// Known npubs for specific users
const KNOWN_NPUBS: Record<string, string> = {
  dergigi: 'npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc'
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

async function queryVertexRelay(filter: { kinds: number[] }): Promise<NDKEvent[]> {
  try {
    // Use the existing NDK instance which already has the vertex relay configured
    const events = await ndk.fetchEvents(filter);
    return Array.from(events);
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
    const events = await queryVertexRelay({ kinds: [0] });
    
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