import { ndk } from './ndk';
import { NDKEvent } from '@nostr-dev-kit/ndk';

export const VERTEX_REGEXP = /^p:([a-zA-Z0-9_]+)$/;

export const lookupVertexProfile = async (query: string): Promise<NDKEvent | null> => {
  const match = query.match(VERTEX_REGEXP);
  if (!match) return null;

  const username = match[1];
  try {
    const events = await ndk.fetchEvents({
      kinds: [0], // profile metadata
      search: username,
      limit: 1
    });

    if (events.size === 0) return null;

    const event = Array.from(events)[0];
    const content = JSON.parse(event.content);
    
    // Check if the username matches the display name or name
    const displayName = content.display_name || content.displayName || content.name;
    if (displayName?.toLowerCase() !== username.toLowerCase()) return null;

    return event;
  } catch (error) {
    console.error('Vertex profile lookup error:', error);
    return null;
  }
}; 