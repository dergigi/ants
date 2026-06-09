'use client';

import { useState, useEffect, useMemo } from 'react';
import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { connect, ndk } from '@/lib/ndk';
import { profileEventFromPubkey } from '@/lib/vertex';
import { setPrefetchedProfile, prepareProfileEventForPrefetch } from '@/lib/profile/prefetch';
import { getCurrentProfileNpub } from '@/lib/search/queryTransforms';
import { getProfileScopeIdentifiers, hasProfileScope } from '@/lib/search/profileScope';

/**
 * Loads the profile user for `/p/...` pages and derives the
 * profile scope identifiers used to scope searches to that profile.
 */
export function useProfileScope(options: { manageUrl: boolean; pathname: string | null; query: string }) {
  const { manageUrl, pathname, query } = options;
  const [profileScopeUser, setProfileScopeUser] = useState<NDKUser | null>(null);

  useEffect(() => {
    if (!manageUrl) {
      setProfileScopeUser(null);
      return;
    }

    const currentProfileNpub = getCurrentProfileNpub(pathname);
    if (!currentProfileNpub) {
      setProfileScopeUser(null);
      return;
    }

    let cancelled = false;
    const cloneUserWithProfile = (source: NDKUser): NDKUser => {
      const clone = new NDKUser({ pubkey: source.pubkey });
      clone.ndk = ndk;
      if (source.profile) {
        clone.profile = { ...(source.profile as Record<string, unknown>) } as typeof source.profile;
      }
      return clone;
    };

    const profileHasHttpImage = (profile: unknown): boolean => {
      if (!profile || typeof profile !== 'object') return false;
      const p = profile as { image?: unknown; picture?: unknown };
      const candidate = typeof p.image === 'string' ? p.image : typeof p.picture === 'string' ? p.picture : undefined;
      return typeof candidate === 'string' && /^https?:\/\//i.test(candidate);
    };

    // Get profile data using the existing profile system
    const setupProfileUser = async () => {
      try {
        const decoded = nip19.decode(currentProfileNpub);
        if (decoded?.type === 'npub' && typeof decoded.data === 'string') {
          const pubkey = decoded.data;
          // Use the existing profile system that caches and fetches properly
          const profileEvent = await profileEventFromPubkey(pubkey);
          if (profileEvent) {
            const prepared = prepareProfileEventForPrefetch(profileEvent);
            const baseUser = prepared.author ?? new NDKUser({ pubkey });
            baseUser.ndk = ndk;
            if (!baseUser.profile) {
              baseUser.profile = profileEvent.content ? JSON.parse(profileEvent.content) : {};
            }

            setProfileScopeUser(cloneUserWithProfile(baseUser));

            // Prefetch by tag to mirror ProfileCard behaviour
            (async () => {
              try {
                const asyncUser = new NDKUser({ pubkey });
                asyncUser.ndk = ndk;
                await connect();
                await asyncUser.fetchProfile();
                if (cancelled) return;
                const hadImage = profileHasHttpImage(baseUser.profile);
                const hasImageNow = profileHasHttpImage(asyncUser.profile);
                if (!hadImage && hasImageNow) {
                  setPrefetchedProfile(pubkey, prepareProfileEventForPrefetch(new NDKEvent(ndk, {
                    kind: 0,
                    created_at: Math.floor(Date.now() / 1000),
                    content: JSON.stringify(asyncUser.profile || {}),
                    pubkey,
                    tags: [],
                    id: '',
                    sig: ''
                  })));
                  setProfileScopeUser(cloneUserWithProfile(asyncUser));
                } else if (hadImage && !hasImageNow) {
                  // keep existing image
                } else if (!hadImage && !hasImageNow) {
                  // nothing new
                } else {
                  setProfileScopeUser(prev => prev && prev.pubkey === asyncUser.pubkey ? cloneUserWithProfile(asyncUser) : prev);
                }
              } catch {
                // ignore
              }
            })();
          } else {
            setProfileScopeUser(null);
          }
        } else {
          setProfileScopeUser(null);
        }
      } catch {
        setProfileScopeUser(null);
      }
    };

    setupProfileUser();
    return () => { cancelled = true; };
  }, [manageUrl, pathname]);

  // Determine scope identifiers for current profile
  const profileScopeIdentifiers = useMemo(() => {
    const currentProfileNpub = getCurrentProfileNpub(pathname);
    if (!currentProfileNpub) return null;
    const identifiers = getProfileScopeIdentifiers(profileScopeUser, currentProfileNpub);
    if (!identifiers) return null;
    return identifiers;
  }, [profileScopeUser, pathname]);

  const profileScoped = useMemo(() => {
    if (!profileScopeIdentifiers) return false;
    return hasProfileScope(query, profileScopeIdentifiers);
  }, [query, profileScopeIdentifiers]);

  return { profileScopeUser, profileScopeIdentifiers, profileScoped };
}
