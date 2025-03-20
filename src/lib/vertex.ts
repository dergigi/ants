import { ndk } from './ndk';
import { NDKEvent, NDKUser, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import { storeProfile } from './profiles';

export const VERTEX_REGEXP = /^p:([a-zA-Z0-9_]+)$/;

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
    // Create request event
    const req = new NDKEvent(ndk, {
      kind: 5315,
      tags: [["param", "search", username]]
    });
    await req.sign();

    // Set up subscription with filter based on our request
    const sub = ndk.subscribe(
      [{ kinds: [6315, 7000], ...req.filter() }],
      { cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY }
    );

    // Create response promise
    const responsePromise = new Promise<NDKEvent[]>((resolve, reject) => {
      sub.on('event', (event: NDKEvent) => {
        // Check for error response
        if (event.kind === 7000) {
          const statusTag = event.getMatchingTags('status')?.[0];
          const status = statusTag?.[2] ?? statusTag?.[1];
          if (status) {
            sub.stop();
            reject(new Error(status));
            return;
          }
        }

        // Got a valid response, stop subscription and resolve
        sub.stop();
        resolve([event]);
      });

      // Start subscription and publish request
      sub.start();
      req.publish();
    });

    // Wait for response
    const response = await responsePromise;
    return response;
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
    
    if (events.length === 0) {
      return null;
    }

    const response = events[0];
    let results: VertexProfile[];
    
    try {
      results = JSON.parse(response.content);
    } catch (error) {
      console.error('Error parsing DVM response:', error);
      return null;
    }
    
    if (!Array.isArray(results) || results.length === 0) {
      return null;
    }

    const bestMatch = results[0];
    
    // Create a complete profile event
    const event = new NDKEvent(ndk);
    event.pubkey = bestMatch.pubkey;
    event.author = new NDKUser({ pubkey: bestMatch.pubkey });
    event.kind = 0;
    event.created_at = Math.floor(Date.now() / 1000);
    
    // Include all profile fields from the DVM response
    const profileContent: Record<string, string> = {};
    if (bestMatch.name) profileContent.name = bestMatch.name;
    if (bestMatch.display_name) profileContent.display_name = bestMatch.display_name;
    if (bestMatch.picture) profileContent.picture = bestMatch.picture;
    if (bestMatch.about) profileContent.about = bestMatch.about;
    if (bestMatch.nip05) profileContent.nip05 = bestMatch.nip05;
    if (bestMatch.lud16) profileContent.lud16 = bestMatch.lud16;
    if (bestMatch.lud06) profileContent.lud06 = bestMatch.lud06;
    if (bestMatch.website) profileContent.website = bestMatch.website;
    if (bestMatch.banner) profileContent.banner = bestMatch.banner;
    
    event.content = JSON.stringify(profileContent);
    
    // Store the profile in localStorage
    storeProfile(event);
    
    return event;
  } catch (error) {
    console.error('Error looking up vertex profile:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
} 