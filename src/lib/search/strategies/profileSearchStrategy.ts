import { NDKEvent } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { searchProfilesFullText, profileEventFromPubkey } from '../../vertex';
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

