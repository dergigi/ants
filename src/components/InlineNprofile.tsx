'use client';

import { useState, useEffect } from 'react';
import { nip19 } from 'nostr-tools';
import { NDKUser } from '@nostr-dev-kit/ndk';
import { ndk } from '@/lib/ndk';
import { shortenNpub } from '@/lib/utils';

interface InlineNprofileProps {
  token: string;
  onProfileClick: (npub: string) => void;
}

export default function InlineNprofile({ token, onProfileClick }: InlineNprofileProps) {
  const [label, setLabel] = useState<string>('');
  const [npub, setNpub] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const m = token.match(/^(nostr:nprofile1[0-9a-z]+)([),.;]*)$/i);
        const core = (m ? m[1] : token).replace(/^nostr:/i, '');
        const { type, data } = nip19.decode(core);
        let pubkey: string | undefined;
        if (type === 'nprofile') pubkey = (data as { pubkey: string }).pubkey;
        else if (type === 'npub') pubkey = data as string;
        else return;
        const user = new NDKUser({ pubkey });
        user.ndk = ndk;
        try { await user.fetchProfile(); } catch {}
        if (!isMounted) return;
        type UserProfileLike = { display?: string; displayName?: string; name?: string } | undefined;
        const profile = user.profile as UserProfileLike;
        const display = profile?.displayName || profile?.display || profile?.name || '';
        const npubVal = nip19.npubEncode(pubkey);
        setNpub(npubVal);
        setLabel(display || `npub:${shortenNpub(npubVal)}`);
      } catch {
        if (!isMounted) return;
        setLabel(token);
      }
    })();
    return () => { isMounted = false; };
  }, [token]);

  return (
    <button
      type="button"
      className="text-blue-400 hover:text-blue-300 hover:underline inline"
      title={token}
      onClick={() => {
        if (!npub) return;
        onProfileClick(npub);
      }}
    >
      {label || token}
    </button>
  );
}
