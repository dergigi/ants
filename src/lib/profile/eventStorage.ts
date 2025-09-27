import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { ndk } from '../ndk';

export type StoredProfileEvent = {
  id: string;
  pubkey: string;
  content: string;
  created_at?: number;
  kind: number;
  tags: unknown;
  author?: {
    pubkey: string;
    profile?: unknown;
  } | null;
};

function serializeAuthor(event: NDKEvent): StoredProfileEvent['author'] {
  try {
    const author = event.author;
    if (!author) return { pubkey: event.pubkey };
    const base = { pubkey: author.pubkey };
    const profile = (author as NDKUser & { profile?: unknown }).profile;
    return profile ? { ...base, profile } : base;
  } catch {
    return { pubkey: event.pubkey };
  }
}

export function serializeProfileEvent(event: NDKEvent | null): StoredProfileEvent | null {
  if (!event) return null;
  try {
    return {
      id: event.id,
      pubkey: event.pubkey,
      content: event.content,
      created_at: event.created_at,
      kind: event.kind,
      tags: event.tags,
      author: serializeAuthor(event)
    } satisfies StoredProfileEvent;
  } catch {
    return null;
  }
}

export function deserializeProfileEvent(stored: StoredProfileEvent | null): NDKEvent | null {
  if (!stored) return null;
  try {
    const event = new NDKEvent(ndk, {
      id: stored.id,
      pubkey: stored.pubkey,
      content: stored.content,
      created_at: stored.created_at,
      kind: stored.kind,
      tags: stored.tags
    });

    if (stored.author) {
      const user = new NDKUser({ pubkey: stored.author.pubkey });
      user.ndk = ndk;
      if ('profile' in stored.author && stored.author.profile !== undefined) {
        (user as NDKUser & { profile?: unknown }).profile = stored.author.profile;
      }
      event.author = user;
    }

    return event;
  } catch {
    return null;
  }
}


