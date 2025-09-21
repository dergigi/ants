import { NDKEvent, NDKUser, NDKFilter, type NDKUserProfile } from '@nostr-dev-kit/ndk';
import { ndk, safeSubscribe } from '../ndk';
import { getStoredPubkey } from '../nip07';
import { relaySets } from '../relays';
import { queryVertexDVM } from '../dvm/query';
import { getCachedNip05Result } from './verification';
import { verifyNip05 } from './verification';

// Lazily create relay sets when needed (avoid cache access during module import)
async function getProfileSearchRelaySet() {
  return relaySets.profileSearch();
}

function isLoggedIn(): boolean {
  return Boolean(getStoredPubkey());
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

function computeMatchScore(termLower: string, name?: string, display?: string, about?: string, nip05?: string): number {
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

export async function searchProfilesFullText(term: string, limit: number = 50): Promise<NDKEvent[]> {
  const query = term.trim();
  if (!query) return [];

  // Step 0: try Vertex DVM for top ranked results (only when logged in)
  let vertexEvents: NDKEvent[] = [];
  if (isLoggedIn()) {
    try {
      vertexEvents = await queryVertexDVM(query, Math.min(10, limit));
      for (const v of vertexEvents) {
        (v as unknown as { debugScore?: string }).debugScore = 'DVM-ranked result';
      }
    } catch (e) {
      if ((e as Error)?.message !== 'VERTEX_NO_CREDITS') {
        console.warn('Vertex aggregation failed, proceeding with fallback ranking:', e);
      }
    }
  }

  // Step 1: fetch candidate profiles from NIP-50 capable relay(s)
  const candidates = await subscribeAndCollectProfiles({ kinds: [0], search: query, limit: Math.max(limit, 200) });
  // If the NIP-50 relay returns nothing but DVM returned results, use DVM results directly
  if (candidates.length === 0) {
    return vertexEvents.slice(0, limit);
  }

  const termLower = query.toLowerCase();
  const storedPubkey = getStoredPubkey();
  const follows: Set<string> = storedPubkey ? await getDirectFollows(storedPubkey) : new Set<string>();

  // Step 2: build enriched rows with preliminary score and schedule NIP-05 verifications (limited)
  const verificationLimit = Math.min(candidates.length, 50);
  const verifications: Array<Promise<boolean>> = [];

  type EnrichedRow = {
    event: NDKEvent;
    pubkey: string;
    name: string;
    baseScore: number;
    isFriend: boolean;
    nip05?: string;
    verifyPromise: Promise<boolean> | null;
    finalScore?: number;
    verified?: boolean;
  };

  type UserProfile = {
    name?: string;
    displayName?: string;
    about?: string;
    nip05?: string;
    image?: string;
  };

  const enriched: EnrichedRow[] = candidates.map((evt, idx) => {
    const pubkey = evt.pubkey || evt.author?.pubkey || '';
    const { name, display, about, nip05, image } = extractProfileFields(evt);
    const nameForAuthor = display || name || '';

    // Ensure author is set for UI
    if (!evt.author && pubkey) {
      const user = new NDKUser({ pubkey });
      user.ndk = ndk;
      (user as NDKUser & { profile: UserProfile }).profile = {
        name: name,
        displayName: display,
        about,
        nip05,
        image
      };
      evt.author = user;
    } else if (evt.author) {
      // Populate minimal profile if missing
      if (!evt.author.profile) {
        (evt.author as NDKUser & { profile: UserProfile }).profile = {
          name: name,
          displayName: display,
          about,
          nip05,
          image
        };
      }
    }

    const baseScore = computeMatchScore(termLower, name, display, about, nip05);
    const isFriend = storedPubkey ? follows.has(pubkey) : false;

    let verifyPromise: Promise<boolean> | null = null;
    // Use cached result immediately for scoring, and schedule background verification for a subset
    const cached = pubkey ? getCachedNip05Result(pubkey, nip05) : null;
    if (idx < verificationLimit && cached === null && pubkey) {
      // Fire and forget; don't await in ranking path
      verifyPromise = verifyNip05(pubkey, nip05);
      verifications.push(verifyPromise.catch(() => false));
    }

    return {
      event: evt,
      pubkey,
      name: nameForAuthor,
      baseScore,
      isFriend,
      nip05,
      verifyPromise
    };
  });

  // Step 3: don't await verifications; they run in background and update cache when done

  // Step 4: assign final score and sort
  for (const row of enriched) {
    const verified = (row.pubkey ? (getCachedNip05Result(row.pubkey, row.nip05) ?? false) : false);
    let score = row.baseScore;
    if (verified) score += 100;
    if (row.isFriend) score += 50;
    row.finalScore = score;
    row.verified = verified;
  }

  enriched.sort((a, b) => {
    const as = a.finalScore || 0;
    const bs = b.finalScore || 0;
    if (as !== bs) return bs - as;
    // Tie-breakers: friend first, then name lexicographically
    if (a.isFriend !== b.isFriend) return a.isFriend ? -1 : 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  // Step 5: prepend Vertex results, then append ranked fallback, dedup by pubkey
  const seen = new Set<string>();
  const ordered: NDKEvent[] = [];

  const pushIfNew = (evt: NDKEvent) => {
    const pk = evt.pubkey || evt.author?.pubkey || '';
    if (!pk || seen.has(pk)) return;
    seen.add(pk);
    // Ensure kind is 0 and author is set
    if (!evt.kind) evt.kind = 0;
    if (!evt.author && pk) {
      const user = new NDKUser({ pubkey: pk });
      user.ndk = ndk;
      evt.author = user;
    }
    ordered.push(evt);
  };

  for (const v of vertexEvents) pushIfNew(v);
  for (const r of enriched.map((e) => e.event)) pushIfNew(r);

  return ordered.slice(0, limit);
}
