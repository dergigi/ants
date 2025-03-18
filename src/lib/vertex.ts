import { ndk } from './ndk';
import { NDKEvent } from '@nostr-dev-kit/ndk';

export const VERTEX_REGEXP = /^p:([a-zA-Z0-9_]+)$/;

export const lookupVertexProfile = async (query: string): Promise<NDKEvent | null> => {
  const match = query.match(VERTEX_REGEXP);
  if (!match) return null;

  const username = match[1];
  try {
    // First try to find the profile by name
    const events = await ndk.fetchEvents({
      kinds: [0], // profile metadata
      search: username,
      limit: 10 // Get more results to find exact match
    });

    // Look for exact name match
    const event = Array.from(events).find(event => {
      try {
        const content = JSON.parse(event.content);
        const displayName = content.display_name || content.displayName || content.name;
        return displayName?.toLowerCase() === username.toLowerCase();
      } catch {
        return false;
      }
    });

    return event || null;
  } catch (error) {
    console.error('Vertex profile lookup error:', error);
    return null;
  }
}; 