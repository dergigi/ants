import { NDKEvent, NDKUser, type NDKUserProfile } from '@nostr-dev-kit/ndk';
import { getStoredPubkey } from '../nip07';
import { 
  subscribeAndCollectProfiles, 
  getDirectFollows, 
  extractProfileFields, 
  computeMatchScore 
} from './utils';
import { queryVertexDVM } from './dvm-core';
import { verifyNip05 } from './nip05';
import { getCachedNip05Result } from './cache';

// Full-text profile search with ranking
export async function searchProfilesFullText(term: string, limit: number = 50): Promise<NDKEvent[]> {
  const query = term.trim();
  if (!query) return [];

  // Step 0: try Vertex DVM for top ranked results (only when logged in)
  let vertexEvents: NDKEvent[] = [];
  if (getStoredPubkey()) {
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

  const enriched: EnrichedRow[] = candidates.map((evt, idx) => {
    const pubkey = evt.pubkey || evt.author?.pubkey || '';
    const { name, display, about, nip05, image } = extractProfileFields(evt);
    const nameForAuthor = display || name || '';

    // Ensure author is set for UI
    if (!evt.author && pubkey) {
      const user = new NDKUser({ pubkey });
      user.ndk = evt.ndk;
      (user as NDKUser & { profile: NDKUserProfile }).profile = {
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
        (evt.author as NDKUser & { profile: NDKUserProfile }).profile = {
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
      user.ndk = evt.ndk;
      evt.author = user;
    }
    ordered.push(evt);
  };

  for (const v of vertexEvents) pushIfNew(v);
  for (const r of enriched.map((e) => e.event)) pushIfNew(r);

  return ordered.slice(0, limit);
}
