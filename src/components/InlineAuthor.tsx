'use client';

import { useState, useEffect } from 'react';
import { NDKUser } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';
import { shortenNpub } from '@/lib/utils';
import { ndk } from '@/lib/ndk';

type Props = {
  pubkeyHex: string;
  onAuthorClick?: (npub: string) => void;
};

/** Renders an author like an inline mention, resolving the display name async */
export default function InlineAuthor({ pubkeyHex, onAuthorClick }: Props) {
  const [label, setLabel] = useState<string>('');
  const [npub, setNpub] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const user = new NDKUser({ pubkey: pubkeyHex });
        user.ndk = ndk;
        try { await user.fetchProfile(); } catch {}
        if (!isMounted) return;
        const profile = user.profile as { display?: string; displayName?: string; name?: string } | undefined;
        const display = profile?.displayName || profile?.display || profile?.name || '';
        const npubVal = nip19.npubEncode(pubkeyHex);
        setNpub(npubVal);
        setLabel(display || `npub:${shortenNpub(npubVal)}`);
      } catch {
        if (!isMounted) return;
        setLabel(`npub:${shortenNpub(nip19.npubEncode(pubkeyHex))}`);
      }
    })();
    return () => { isMounted = false; };
  }, [pubkeyHex]);

  return (
    <button
      type="button"
      onClick={() => onAuthorClick && onAuthorClick(npub)}
      className="text-blue-400 hover:text-blue-300 hover:underline"
      title={npub}
    >
      {label || <FontAwesomeIcon icon={faSpinner} className="animate-spin" />}
    </button>
  );
}
