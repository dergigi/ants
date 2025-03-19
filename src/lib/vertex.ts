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
    const response = await fetch(`https://api.vertex.me/v1/search/profiles?q=${username}`);
    const data = await response.json();
    
    if (!data.profiles || data.profiles.length === 0) {
      return null;
    }
    
    // Log all found profiles for debugging
    console.log('Found profiles:', data.profiles.map((p: any) => ({
      npub: p.npub,
      displayName: p.display_name,
      name: p.name,
      username: p.username
    })));
    
    // First try exact username match
    const exactMatch = data.profiles.find((p: any) => 
      p.username?.toLowerCase() === username || 
      p.name?.toLowerCase() === username ||
      p.display_name?.toLowerCase() === username
    );
    
    // If no exact match, try partial match with display name
    const partialMatch = data.profiles.find((p: any) => 
      p.display_name?.toLowerCase().includes(username) ||
      p.name?.toLowerCase().includes(username)
    );
    
    const profile = exactMatch || partialMatch;
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