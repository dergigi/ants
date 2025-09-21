import { NDKEvent, NDKUser, NDKFilter, type NDKUserProfile } from '@nostr-dev-kit/ndk';
import { ndk, safeSubscribe } from '../ndk';
import { getStoredPubkey } from '../nip07';
import { relaySets } from '../relays';

// Lazily create relay sets when needed (avoid cache access during module import)
async function getProfileSearchRelaySet() {
  return relaySets.profileSearch();
}

async function subscribeAndCollectProfiles(filter: NDKFilter, timeoutMs: number = 8000): Promise<NDKEvent[]> {
  return new Promise<NDKEvent[]>((resolve) => {
    const collected: Map<string, NDKEvent> = new Map();

    (async () => {
      const relaySet = await getProfileSearchRelaySet();
      const sub = safeSubscribe(
        [filter],
        { closeOnEose: true, cacheUsage: 'ONLY_RELAY' as any, relaySet }
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

async function getDirectFollows(pubkey: string): Promise<Set<string>> {
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

type TagPFilter = NDKFilter & { '#p'?: string[] };

async function countFollowerMentions(pubkeys: string[]): Promise<Map<string, number>> {
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

function extractProfileFields(event: NDKEvent): { name?: string; display?: string; about?: string; nip05?: string; image?: string } {
  try {
    const content = JSON.parse(event.content || '{}');
    return {
      name: content.name,
      display: content.display_name || content.displayName,
      about: content.about,
      nip05: content.nip05,
      image: content.image || content.picture
    };
  } catch {
    return {};
  }
}

export async function fallbackLookupProfile(username: string): Promise<NDKEvent | null> {
  // 1) Search kind 0 profiles by username term
  const profiles = await subscribeAndCollectProfiles({ kinds: [0], search: username, limit: 21 });
  if (profiles.length === 0) return null;

  // Prefer exact name/display_name match when available
  function extractNames(e: NDKEvent): { name?: string; display?: string } {
    try {
      const content = JSON.parse(e.content || '{}');
      return { name: content.name, display: content.display_name };
    } catch {
      return {};
    }
  }

  const lower = username.toLowerCase();

  // Helper: ensure the returned event has an author with pubkey set
  const ensureAuthor = (evt: NDKEvent): NDKEvent => {
    const pk = evt.pubkey || evt.author?.pubkey;
    if (pk && !evt.author) {
      const user = new NDKUser({ pubkey: pk });
      user.ndk = ndk;
      // Optionally attach minimal profile fields for better UI
      const fields = extractProfileFields(evt);
      (user as NDKUser & { profile?: NDKUserProfile | undefined }).profile = {
        name: fields.name,
        displayName: fields.display,
        about: fields.about,
        nip05: fields.nip05,
        image: fields.image
      } as NDKUserProfile;
      evt.author = user;
    }
    return evt;
  };
  const exact = profiles.find((e) => {
    const n = extractNames(e);
    return (n.display || n.name || '').toLowerCase() === lower;
  });
  if (exact) return ensureAuthor(exact);

  const storedPubkey = getStoredPubkey();
  if (storedPubkey) {
    const follows = await getDirectFollows(storedPubkey);
    const sorted = [...profiles].sort((a, b) => {
      const af = follows.has(a.pubkey || a.author?.pubkey || '');
      const bf = follows.has(b.pubkey || b.author?.pubkey || '');
      if (af !== bf) return af ? -1 : 1;
      // Tie-breaker: shorter Levenshtein-like by prefix match
      const an = (extractNames(a).display || extractNames(a).name || '').toLowerCase();
      const bn = (extractNames(b).display || extractNames(b).name || '').toLowerCase();
      const ap = an.startsWith(lower) ? 0 : 1;
      const bp = bn.startsWith(lower) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return an.localeCompare(bn);
    });
    return ensureAuthor(sorted[0]);
  }

  // Not logged in: sort by follower count across relays
  const candidatePubkeys = profiles.map((e) => e.pubkey || e.author?.pubkey).filter(Boolean) as string[];
  const counts = await countFollowerMentions(candidatePubkeys);
  const sortedByCount = [...profiles].sort((a, b) => {
    const ac = counts.get((a.pubkey || a.author?.pubkey) as string) || 0;
    const bc = counts.get((b.pubkey || b.author?.pubkey) as string) || 0;
    if (ac !== bc) return bc - ac;
    // Tie-breaker by prefix match then alphabetic
    const an = (extractNames(a).display || extractNames(a).name || '') as string;
    const bn = (extractNames(b).display || extractNames(b).name || '') as string;
    const ap = an.toLowerCase().startsWith(lower) ? 0 : 1;
    const bp = bn.toLowerCase().startsWith(lower) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return an.localeCompare(bn);
  });
  return ensureAuthor(sortedByCount[0]);
}
