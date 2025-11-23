import { NDKEvent } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { searchProfilesFullText, profileEventFromPubkey, resolveNip05ToPubkey } from '../../vertex';
import { getNip05Domain } from '../../nip05';
import { SearchContext } from '../types';

/**
 * Handle full-text profile search `p:<term>` (not only username)
 * Also supports hex or npub directly to fetch that exact profile
 * Returns null if the query is not a profile search
 */
export async function tryHandleProfileSearch(
  query: string,
  context: SearchContext
): Promise<NDKEvent[] | null> {
  // Context parameter kept for strategy interface consistency
  void context;
  const fullProfileMatch = query.match(/^p:(.+)$/i);
  if (fullProfileMatch) {
    const term = (fullProfileMatch[1] || '').trim();
    if (!term) return [];
    
    // If term is an npub or 64-char hex, fetch the exact profile event
    if (/^npub1[0-9a-z]+$/i.test(term)) {
      try {
        const decoded = nip19.decode(term);
        if (decoded?.type === 'npub' && typeof decoded.data === 'string') {
          const evt = await profileEventFromPubkey(decoded.data);
          return evt ? [evt] : [];
        }
      } catch {}
    }
    if (/^[0-9a-fA-F]{64}$/.test(term)) {
      try {
        const evt = await profileEventFromPubkey(term.toLowerCase());
        return evt ? [evt] : [];
      } catch {}
    }
    // If term looks like a NIP-05 identifier with local-part (name@domain or @name@domain),
    // resolve directly to a single pubkey
    const nip05WithLocal = term.match(/^@?[^\s@]+@[^\s@]+$/);
    if (nip05WithLocal) {
      try {
        const pubkey = await resolveNip05ToPubkey(term);
        if (pubkey) {
          const evt = await profileEventFromPubkey(pubkey);
          if (evt) return [evt];
        }
      } catch {
        // Fall through to full-text search below on failure
      }
    }

    // If term looks like a bare domain (e.g. "zaps.lol"), return all profiles whose NIP-05
    // domain matches this value, falling back to general full-text ranking if needed.
    const domainLike = /^[^\s@]+\.[^\s@]+$/.test(term);
    if (domainLike) {
      try {
        const profiles = await searchProfilesFullText(term);
        if (profiles.length === 0) return [];

        const domainLower = term.toLowerCase();
        const filtered = profiles.filter((evt) => {
          const nip05 = (evt.author as { profile?: { nip05?: string } } | undefined)?.profile?.nip05;
          if (!nip05) return false;
          return getNip05Domain(nip05) === domainLower;
        });

        return (filtered.length > 0 ? filtered : profiles);
      } catch (error) {
        console.warn('Domain-based profile search failed:', error);
        return [];
      }
    }

    // Otherwise, do a general full-text profile search
    try {
      const profiles = await searchProfilesFullText(term);
      return profiles;
    } catch (error) {
      console.warn('Full-text profile search failed:', error);
      return [];
    }
  }
  
  return null;
}

