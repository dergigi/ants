'use client';

import { useEffect, useState } from 'react';
import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { ndk, connect } from '@/lib/ndk';
import { getPrefetchedProfile, clearPrefetchedProfile } from '@/lib/profile/prefetch';

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
        if (prefetched) {
          prefetched.author = u;
          setProfileEvent(prefetched);
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

        // Load connection and fetch profile
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


