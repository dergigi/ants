import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { ndk, safeSubscribe } from '../ndk';
import { relaySets } from '../relays';
import { NDKSubscriptionCacheUsage, NDKFilter } from '@nostr-dev-kit/ndk';

// Helper function to extract profile fields from an event
export function extractProfileFields(event: NDKEvent): { 
  name?: string; 
  display?: string; 
  about?: string; 
  nip05?: string; 
  nip05VerifiedHint?: boolean;
  image?: string 
} {
  try {
    const content = JSON.parse(event.content || '{}');
    const nip05Raw = content.nip05 as { url?: string; verified?: boolean } | string | undefined;
    const nip05 = typeof nip05Raw === 'string' ? nip05Raw : nip05Raw?.url;
    const nip05VerifiedHint = typeof nip05Raw === 'object' && nip05Raw !== null ? nip05Raw.verified : undefined;
    return {
      name: content.name,
      display: content.display_name || content.displayName,
      about: content.about,
      nip05,
      nip05VerifiedHint,
      image: content.image || content.picture
    };
  } catch {
    return {};
  }
}

// Create a profile event from a pubkey
export async function profileEventFromPubkey(pubkey: string): Promise<NDKEvent> {
  const user = new NDKUser({ pubkey });
  user.ndk = ndk;
  try {
    await user.fetchProfile();
  } catch {}
  const evt = new NDKEvent(ndk, {
    kind: 0,
    created_at: Math.floor(Date.now() / 1000),
    content: JSON.stringify(user.profile || {}),
    pubkey,
    tags: [],
    id: '',
    sig: ''
  });
  evt.author = user;
  return evt;
}

// Subscribe and collect profile events
export async function subscribeAndCollectProfiles(filter: NDKFilter, timeoutMs: number = 8000): Promise<NDKEvent[]> {
  return new Promise<NDKEvent[]>((resolve) => {
    const collected: Map<string, NDKEvent> = new Map();

    (async () => {
      const relaySet = await relaySets.profileSearch();
      const sub = safeSubscribe(
        [filter],
        { closeOnEose: true, cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY, relaySet }
      );
    
      if (!sub) {
        console.warn('Failed to create profile search subscription');
        resolve([]);
        return;
      }
      const timer = setTimeout(() => {
        try { sub.stop(); } catch {}
        resolve(Array.from(collected.values()));
      }, timeoutMs);

      sub.on('event', (event: NDKEvent) => {
        if (!collected.has(event.id)) {
          collected.set(event.id, event);
        }
      });

      sub.on('eose', () => {
        clearTimeout(timer);
        resolve(Array.from(collected.values()));
      });

      sub.start();
    })();
  });
}

// Get direct follows for a pubkey
export async function getDirectFollows(pubkey: string): Promise<Set<string>> {
  const events = await subscribeAndCollectProfiles({ kinds: [3], authors: [pubkey], limit: 1 });
  const follows = new Set<string>();
  if (events.length === 0) return follows;
  const event = events[0];
  for (const tag of event.tags as unknown as string[][]) {
    if (Array.isArray(tag) && tag[0] === 'p' && tag[1]) {
      follows.add(tag[1]);
    }
  }
  return follows;
}

// Count follower mentions for multiple pubkeys
type TagPFilter = NDKFilter & { '#p'?: string[] };

export async function countFollowerMentions(pubkeys: string[]): Promise<Map<string, number>> {
  if (pubkeys.length === 0) return new Map();
  const counts = new Map<string, number>();
  const tagFilter: TagPFilter = { kinds: [3], '#p': pubkeys, limit: 4000 };
  const batch = await subscribeAndCollectProfiles(tagFilter, 6000);
  for (const evt of batch) {
    for (const tag of evt.tags as unknown as string[][]) {
      if (Array.isArray(tag) && tag[0] === 'p' && tag[1] && pubkeys.includes(tag[1])) {
        counts.set(tag[1], (counts.get(tag[1]) || 0) + 1);
      }
    }
  }
  return counts;
}

// Get oldest profile metadata for a pubkey
export async function getOldestProfileMetadata(pubkey: string): Promise<{ id: string; created_at: number } | null> {
  try {
    const events = await subscribeAndCollectProfiles({ kinds: [0], authors: [pubkey], limit: 8000 }, 8000);
    if (!events || events.length === 0) return null;
    let oldest: NDKEvent | null = null;
    for (const e of events) {
      if (!oldest || ((e.created_at || Number.MAX_SAFE_INTEGER) < (oldest.created_at || Number.MAX_SAFE_INTEGER))) {
        oldest = e;
      }
    }
    if (!oldest) return null;
    return { id: oldest.id, created_at: oldest.created_at as number };
  } catch {
    return null;
  }
}

// Get newest profile metadata for a pubkey
export async function getNewestProfileMetadata(pubkey: string): Promise<{ id: string; created_at: number } | null> {
  try {
    const events = await subscribeAndCollectProfiles({ kinds: [0], authors: [pubkey], limit: 8000 }, 8000);
    if (!events || events.length === 0) return null;
    let newest: NDKEvent | null = null;
    for (const e of events) {
      if (!newest || ((e.created_at || 0) > (newest.created_at || 0))) {
        newest = e;
      }
    }
    if (!newest) return null;
    return { id: newest.id, created_at: newest.created_at as number };
  } catch {
    return null;
  }
}

// Get the full newest profile event for a pubkey
export async function getNewestProfileEvent(pubkey: string): Promise<NDKEvent | null> {
  try {
    const events = await subscribeAndCollectProfiles({ kinds: [0], authors: [pubkey], limit: 8000 }, 8000);
    if (!events || events.length === 0) return null;
    let newest: NDKEvent | null = null;
    for (const e of events) {
      if (!newest || ((e.created_at || 0) > (newest.created_at || 0))) {
        newest = e;
      }
    }
    return newest;
  } catch {
    return null;
  }
}

// Compute match score for profile search ranking
export function computeMatchScore(termLower: string, name?: string, display?: string, about?: string, nip05?: string): number {
  let score = 0;
  const n = (name || '').toLowerCase();
  const d = (display || '').toLowerCase();
  const a = (about || '').toLowerCase();
  const n5 = (nip05 || '').toLowerCase();
  if (!termLower) return 0;
  const exact = d === termLower || n === termLower;
  const starts = d.startsWith(termLower) || n.startsWith(termLower);
  const contains = d.includes(termLower) || n.includes(termLower);
  if (exact) score += 40;
  else if (starts) score += 30;
  else if (contains) score += 20;
  if (a.includes(termLower)) score += 10;
  // Consider NIP-05 string with strong weighting; top-level (no local part) scores highest
  if (n5) {
    const [localRaw, domainRaw] = n5.includes('@') ? n5.split('@') : ['_', n5];
    const local = (localRaw || '').trim();
    const domain = (domainRaw || '').trim();
    const isTop = local === '' || local === '_';
    if (isTop) {
      if (domain === termLower) score += 120; // top-level exact
      else if (domain.startsWith(termLower)) score += 90; // top-level starts
      else if (domain.includes(termLower)) score += 70; // top-level contains
    } else {
      const full = `${local}@${domain}`;
      if (full === termLower || local === termLower || domain === termLower) score += 90; // exact on any part
      else if (full.startsWith(termLower) || local.startsWith(termLower) || domain.startsWith(termLower)) score += 70;
      else if (full.includes(termLower) || local.includes(termLower) || domain.includes(termLower)) score += 50;
    }
  }
  return score;
}
