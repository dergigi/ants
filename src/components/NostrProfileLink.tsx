'use client';

import { useState, useEffect } from 'react';
import { nip19 } from 'nostr-tools';
import { shortenNpub } from '@/lib/utils';
import { resolveProfileName } from '@/lib/utils/profileUtils';

interface NostrProfileLinkProps {
  token: string;
  href: string;
}

/**
 * Async-resolving profile link for nostr npub/nprofile tokens.
 * Shows shortened npub immediately, then resolves to display name.
 */
export default function NostrProfileLink({ token, href }: NostrProfileLinkProps) {
  const [displayName, setDisplayName] = useState<string>(() => {
    const clean = token.replace(/^nostr:/i, '');
    return clean.length > 20 ? `${clean.slice(0, 10)}…${clean.slice(-6)}` : clean;
  });

  useEffect(() => {
    let mounted = true;
    const clean = token.replace(/^nostr:/i, '');

    try {
      const decoded = nip19.decode(clean);
      const pubkey = decoded.type === 'npub'
        ? (decoded.data as string)
        : decoded.type === 'nprofile'
          ? (decoded.data as { pubkey: string }).pubkey
          : null;

      if (!pubkey) return;

      const npub = nip19.npubEncode(pubkey);
      setDisplayName(`@${shortenNpub(npub)}`);

      resolveProfileName(pubkey).then((result) => {
        if (!mounted) return;
        if (result && !result.isNpubFallback) {
          setDisplayName(`@${result.display.replace(/^@/, '')}`);
        }
      });
    } catch {
      // keep fallback display
    }

    return () => { mounted = false; };
  }, [token]);

  return (
    <a
      href={href}
      className="text-blue-400 hover:text-blue-300 hover:underline"
    >
      {displayName}
    </a>
  );
}
