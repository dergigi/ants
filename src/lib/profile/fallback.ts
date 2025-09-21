import { NDKEvent, NDKUser, type NDKUserProfile } from '@nostr-dev-kit/ndk';
import { getStoredPubkey } from '../nip07';
import { 
  subscribeAndCollectProfiles, 
  getDirectFollows, 
  countFollowerMentions, 
  extractProfileFields 
} from './utils';

// Fallback profile lookup using NIP-50 search
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
      user.ndk = evt.ndk;
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
