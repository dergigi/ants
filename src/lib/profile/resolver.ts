import { NDKEvent } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { resolveNip05ToPubkey } from './nip05';
import { normalizeNip05String } from '../nip05';
import { extractProfileFields, profileEventFromPubkey } from './utils';
import { getCachedUsername, setCachedUsername } from './username-cache';
import { getCachedProfileEvent, setCachedProfileEvent } from './profile-event-cache';
import { searchProfilesFullText } from './search';

function scoreAuthorResolutionCandidate(input: string, event: NDKEvent): number {
  const rawInput = (input || '').trim().toLowerCase();
  if (!rawInput) return 0;

  const normalizedInput = rawInput.startsWith('@') ? rawInput.slice(1) : rawInput;
  const normalizedInputNip05 = rawInput.includes('.') || rawInput.includes('@')
    ? normalizeNip05String(rawInput)
    : '';

  const { name, display, nip05 } = extractProfileFields(event);
  const nameLower = (name || '').trim().toLowerCase();
  const displayLower = (display || '').trim().toLowerCase();
  const normalizedNip05 = nip05 ? normalizeNip05String(nip05) : '';
  const [nip05LocalRaw = '', nip05Domain = ''] = normalizedNip05.split('@');
  const nip05Local = nip05LocalRaw === '_' ? '' : nip05LocalRaw;
  const hasRootNip05 = nip05LocalRaw === '_';

  let score = 0;

  if (nameLower === rawInput || nameLower === normalizedInput) score += 500;
  else if (nameLower.startsWith(normalizedInput)) score += 120;

  if (displayLower === rawInput || displayLower === normalizedInput) score += 500;
  else if (displayLower.startsWith(normalizedInput)) score += 120;

  if (normalizedNip05) {
    if (normalizedInputNip05 && normalizedNip05 === normalizedInputNip05) score += 700;
    if (nip05Local && (nip05Local === rawInput || nip05Local === normalizedInput)) score += 650;
    if (nip05Domain && (nip05Domain === rawInput || nip05Domain === normalizedInput)) score += hasRootNip05 ? 650 : 550;
    if (nip05Local && nip05Local.startsWith(normalizedInput)) score += 140;
    if (nip05Domain && nip05Domain.startsWith(`${normalizedInput}.`)) score += hasRootNip05 ? 700 : 220;
    else if (nip05Domain && nip05Domain.startsWith(normalizedInput)) score += hasRootNip05 ? 420 : 120;
  }

  return score;
}

function isStrongAuthorResolutionMatch(input: string, event: NDKEvent): boolean {
  return scoreAuthorResolutionCandidate(input, event) >= 500;
}

function pickBestAuthorResolutionProfile(input: string, profiles: NDKEvent[]): NDKEvent | null {
  if (profiles.length === 0) return null;

  const ranked = profiles
    .map((event, index) => ({
      event,
      index,
      score: scoreAuthorResolutionCandidate(input, event),
      createdAt: event.created_at || 0,
    }))
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
      return a.index - b.index;
    });

  const best = ranked[0];
  return best && best.score > 0 ? best.event : null;
}

// Unified author resolver: npub | nip05 | username -> pubkey (hex) and an optional profile event
export async function resolveAuthor(authorInput: string): Promise<{ pubkeyHex: string | null; profileEvent: NDKEvent | null }> {
  try {
    const input = (authorInput || '').trim();
    if (!input) return { pubkeyHex: null, profileEvent: null };

    // 1) If input is npub, decode directly
    if (/^npub1[0-9a-z]+$/i.test(input)) {
      try {
        const { type, data } = nip19.decode(input);
        if (type === 'npub' && typeof data === 'string') {
          const cachedEvent = getCachedProfileEvent(data);
          const profileEvent = cachedEvent ?? await profileEventFromPubkey(data);
          if (!cachedEvent && profileEvent) setCachedProfileEvent(data, profileEvent);
          return { pubkeyHex: data, profileEvent };
        }
      } catch {}
      return { pubkeyHex: null, profileEvent: null };
    }

    // 1b) If input is a 64-char hex pubkey, accept directly
    if (/^[0-9a-fA-F]{64}$/.test(input)) {
      const hex = input.toLowerCase();
      const cachedEvent = getCachedProfileEvent(hex);
      const profileEvent = cachedEvent ?? await profileEventFromPubkey(hex);
      if (!cachedEvent && profileEvent) setCachedProfileEvent(hex, profileEvent);
      return { pubkeyHex: hex, profileEvent };
    }

    // 2) If input looks like NIP-05 ('@name@domain' | 'domain.tld' | '@domain.tld'), resolve to pubkey
    const nip05Like = input.match(/^@?([^\s@]+@[^\s@]+|[^\s@]+\.[^\s@]+)$/);
    if (nip05Like) {
      const pk = await resolveNip05ToPubkey(input);
      if (!pk) return { pubkeyHex: null, profileEvent: null };
      const cachedEvent = getCachedProfileEvent(pk);
      const profileEvent = cachedEvent ?? await profileEventFromPubkey(pk);
      if (!cachedEvent && profileEvent) setCachedProfileEvent(pk, profileEvent);
      return { pubkeyHex: pk, profileEvent };
    }

    // 3) Otherwise treat as username and check cache first, then try lookup with proper sorting
    const usernameLower = input.toLowerCase();
    const cachedProfile = getCachedUsername(usernameLower);
    if (cachedProfile !== undefined && (!cachedProfile || isStrongAuthorResolutionMatch(input, cachedProfile))) {
      const pubkeyHex = cachedProfile?.author?.pubkey || cachedProfile?.pubkey || null;
      if (pubkeyHex && cachedProfile) {
        setCachedProfileEvent(pubkeyHex, cachedProfile, { username: usernameLower });
      }
      return { pubkeyHex, profileEvent: cachedProfile };
    }

    let profileEvt: NDKEvent | null = null;
    try {
      const profiles = await searchProfilesFullText(input, 200);
      profileEvt = pickBestAuthorResolutionProfile(input, profiles);
    } catch {}

    setCachedUsername(usernameLower, profileEvt);
    if (profileEvt?.pubkey) setCachedProfileEvent(profileEvt.pubkey, profileEvt, { username: usernameLower });

    if (!profileEvt) {
      return { pubkeyHex: null, profileEvent: null };
    }
    const pubkeyHex = profileEvt.author?.pubkey || profileEvt.pubkey || null;
    return { pubkeyHex, profileEvent: profileEvt };
  } catch {
    return { pubkeyHex: null, profileEvent: null };
  }
}

// Resolve a by:<author> token value (username, nip05, or npub) to an npub.
// Returns the original input if it's already an npub, otherwise attempts Vertex DVM
// and falls back to a NIP-50 profile search. Hard timebox externally when needed.
export async function resolveAuthorToNpub(author: string): Promise<string | null> {
  try {
    const input = (author || '').trim();
    if (!input) return null;
    if (/^npub1[0-9a-z]+$/i.test(input)) return input;
    if (/^[0-9a-fA-F]{64}$/.test(input)) {
      try { return nip19.npubEncode(input.toLowerCase()); } catch { return null; }
    }
    const { pubkeyHex } = await resolveAuthor(input);
    if (!pubkeyHex) return null;
    try { return nip19.npubEncode(pubkeyHex); } catch { return null; }
  } catch {
    return null;
  }
}

