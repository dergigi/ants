'use client';

import { useEffect, useState } from 'react';
import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { ndk, connect } from '@/lib/ndk';
import { getPrefetchedProfile, clearPrefetchedProfile, prepareProfileEventForPrefetch } from '@/lib/profile/prefetch';

export function useNostrUser(npub: string | undefined) {
  const [user, setUser] = useState<NDKUser | null>(null);
  const [profileEvent, setProfileEvent] = useState<NDKEvent | null>(null);
  const [pubkey, setPubkey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!npub) { setUser(null); setProfileEvent(null); setPubkey(null); return; }
      try {
        const { data } = nip19.decode(npub);
        const pk = data as string;
        setPubkey(pk);
        const u = new NDKUser({ pubkey: pk });
        u.ndk = ndk;

        // Use prefetched event if available for instant UI; otherwise show placeholder
        setUser(u);
        const prefetched = getPrefetchedProfile(pk);
        console.log('🔥 useNostrUser prefetched result:', !!prefetched);
        if (prefetched) {
          const prepared = prepareProfileEventForPrefetch(prefetched);
          // Copy prepared author's profile into the new user before attaching
          try {
            const existingProfile = prepared.author && (prepared.author as unknown as { profile?: unknown }).profile;
            if (existingProfile) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (u as any).profile = existingProfile as any;
            }
          } catch {}
          prepared.author = u;
          setProfileEvent(prepared);
          clearPrefetchedProfile(pk);
        } else {
          const placeholder = new NDKEvent(ndk, {
            kind: 0,
            created_at: Math.floor(Date.now() / 1000),
            content: JSON.stringify({}),
            pubkey: pk,
            tags: [],
            id: '',
            sig: ''
          });
          placeholder.author = u;
          setProfileEvent(placeholder);
        }

        // Load connection and fetch profile to refresh in background
        ;(async () => {
          try { await connect(); } catch {}
          try { await u.fetchProfile(); } catch {}
          if (cancelled) return;
          const filled = new NDKEvent(ndk, {
            kind: 0,
            created_at: Math.floor(Date.now() / 1000),
            content: JSON.stringify(u.profile || {}),
            pubkey: pk,
            tags: [],
            id: '',
            sig: ''
          });
          filled.author = u;
          setProfileEvent(filled);
        })();
      } catch {
        if (cancelled) return;
        setUser(null);
        setProfileEvent(null);
        setPubkey(null);
      }
    })();
    return () => { cancelled = true; };
  }, [npub]);

  return { user, profileEvent, pubkey };
}


