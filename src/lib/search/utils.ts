import { NDKEvent } from '@nostr-dev-kit/ndk';

// Ensure newest-first ordering by created_at
export function sortEventsNewestFirst(events: NDKEvent[]): NDKEvent[] {
  return [...events].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
}

export function isNpub(str: string): boolean {
  return str.startsWith('npub1') && str.length > 10;
}

export function getPubkey(str: string): string | null {
  if (isNpub(str)) {
    try {
      const { nip19 } = require('nostr-tools');
      const { data } = nip19.decode(str);
      return data as string;
    } catch (error) {
      console.error('Error decoding npub:', error);
      return null;
    }
  }
  return str;
}
