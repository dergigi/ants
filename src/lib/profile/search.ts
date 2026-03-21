import { NDKEvent, NDKUser, type NDKUserProfile } from '@nostr-dev-kit/ndk';
import { getStoredPubkey } from '../nip07';
import { 
  subscribeAndCollectProfiles, 
  getDirectFollows, 
  extractProfileFields, 
  computeMatchScore 
} from './utils';
import { verifyNip05, isRootNip05 } from './nip05';
import { getCachedNip05Result } from './cache';
import { 
  getCachedLightningFlag, 
  prefetchLightningRealness, 
  LIGHTNING_FLAGS 
} from './lightning';
import { PROFILE_SEARCH_MAX_RESULTS } from '../constants';
import { tryQueryProviders } from './providers';
import {
  getCachedProfileSearch,
  makeProfileSearchCacheKey,
  setCachedProfileSearch
} from './search-cache';

// Full-text profile search with ranking
export async function searchProfilesFullText(term: string, limit: number = PROFILE_SEARCH_MAX_RESULTS): Promise<NDKEvent[]> {
  const query = term.trim();
  if (!query) return [];

  const storedPubkey = getStoredPubkey();
  const loggedIn = Boolean(storedPubkey);
  const cacheKey = makeProfileSearchCacheKey(query, loggedIn);
  const cached = getCachedProfileSearch(cacheKey);
  if (cached) return cached.slice(0, limit);

  // Step 0: try configured providers before relay-based ranking
  const providerResult = await tryQueryProviders(query, limit, loggedIn);
  if (providerResult) {
    setCachedProfileSearch(cacheKey, providerResult);
    return providerResult.slice(0, limit);
  }

  // Step 1: fetch candidate profiles from NIP-50 capable relay(s)
  const candidates = await subscribeAndCollectProfiles({ kinds: [0], search: query, limit: Math.max(limit, 200) });
  if (candidates.length === 0) {
    setCachedProfileSearch(cacheKey, []);
    return [];
  }

  const termLower = query.toLowerCase();
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
    verifyHint?: boolean;
    hasZap: boolean;
    hasNutzap: boolean;
  };

  const enriched: EnrichedRow[] = candidates.map((evt, idx) => {
    const pubkey = evt.pubkey || evt.author?.pubkey || '';
    const { name, display, about, nip05, nip05VerifiedHint: extractedVerifiedHint, image } = extractProfileFields(evt);
    const profile = evt.author?.profile as { nip05?: string | { url?: string; verified?: boolean } } | undefined;
    const rawNip05 = profile?.nip05;
    const nip05Value = typeof rawNip05 === 'string' ? rawNip05 : nip05;
    const nip05VerifiedHint = typeof rawNip05 === 'object' && rawNip05 !== null ? rawNip05.verified : extractedVerifiedHint;
    const nameForAuthor = display || name || '';

    // Ensure author is set for UI
    if (!evt.author && pubkey) {
      const user = new NDKUser({ pubkey });
      user.ndk = evt.ndk;
      (user as NDKUser & { profile: NDKUserProfile }).profile = { name, displayName: display, about, nip05: nip05Value, image };
      evt.author = user;
    } else if (evt.author && !evt.author.profile) {
      (evt.author as NDKUser & { profile: NDKUserProfile }).profile = { name, displayName: display, about, nip05: nip05Value, image };
    }

    const baseScore = computeMatchScore(termLower, name, display, about, nip05Value);
    const isFriend = storedPubkey ? follows.has(pubkey) : false;
    const cachedZap = getCachedLightningFlag(pubkey, LIGHTNING_FLAGS.ZAP);
    const cachedNutzap = getCachedLightningFlag(pubkey, LIGHTNING_FLAGS.NUTZAP);

    if (pubkey && idx < verificationLimit && (cachedZap === undefined || cachedNutzap === undefined)) {
      void prefetchLightningRealness(pubkey).catch(() => undefined);
    }

    let verifyPromise: Promise<boolean> | null = null;
    const cached = pubkey && nip05Value ? getCachedNip05Result(pubkey, nip05Value) : null;
    if (idx < verificationLimit && cached === null && pubkey && nip05Value) {
      verifyPromise = verifyNip05(pubkey, nip05Value);
      verifications.push(verifyPromise.catch(() => false));
    }

    return {
      event: evt, pubkey, name: nameForAuthor, baseScore, isFriend,
      nip05: nip05Value, verifyPromise, verifyHint: nip05VerifiedHint,
      hasZap: cachedZap ?? false, hasNutzap: cachedNutzap ?? false
    };
  });

  // Step 3: don't await verifications; they run in background and update cache when done

  // Step 4: assign final score and sort
  for (const row of enriched) {
    const verified = row.verifyHint === true ? true : (row.pubkey && row.nip05 ? (getCachedNip05Result(row.pubkey, row.nip05) ?? false) : false);
    let score = row.baseScore;
    if (verified) score += 100;
    if (verified && row.nip05 && isRootNip05(row.nip05)) score += 50;
    const updatedNutzap = row.pubkey ? getCachedLightningFlag(row.pubkey, LIGHTNING_FLAGS.NUTZAP) : undefined;
    const updatedZap = row.pubkey ? getCachedLightningFlag(row.pubkey, LIGHTNING_FLAGS.ZAP) : undefined;
    const hasNutzap = updatedNutzap ?? row.hasNutzap;
    const hasZap = updatedZap ?? row.hasZap;
    row.hasNutzap = hasNutzap;
    row.hasZap = hasZap;
    if (hasNutzap) score += 150;
    else if (hasZap) score += 40;
    if (row.isFriend) score += 50;
    row.finalScore = score;
    row.verified = verified;
  }

  enriched.sort((a, b) => {
    const as = a.finalScore || 0;
    const bs = b.finalScore || 0;
    if (as !== bs) return bs - as;
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
    if (!evt.kind) evt.kind = 0;
    if (!evt.author && pk) {
      const user = new NDKUser({ pubkey: pk });
      user.ndk = evt.ndk;
      evt.author = user;
    }
    ordered.push(evt);
  };

  for (const row of enriched) pushIfNew(row.event);

  setCachedProfileSearch(cacheKey, ordered);
  return ordered.slice(0, limit);
}
