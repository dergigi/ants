'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { NDKUser } from '@nostr-dev-kit/ndk';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleCheck, faCircleXmark, faCircleExclamation, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';

type Nip05CheckResult = { isVerified: boolean; value: string | undefined };

function useNip05Status(user: NDKUser): Nip05CheckResult {
  const [verified, setVerified] = useState(false);
  const nip05 = user.profile?.nip05;
  const pubkey = user.pubkey;

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { reverifyNip05 } = await import('@/lib/vertex');
        const result = await reverifyNip05(pubkey, nip05 || '');
        if (isMounted) setVerified(Boolean(result));
      } catch {
        if (isMounted) setVerified(false);
      }
    })();
    return () => { isMounted = false; };
  }, [pubkey, nip05]);

  return { isVerified: verified, value: nip05 };
}

export default function AuthorBadge({ user, onAuthorClick }: { user: NDKUser, onAuthorClick?: (npub: string) => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const { isVerified, value } = useNip05Status(user);
  // Removed manual revalidation UI; rely on automatic/implicit verification

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        await user.fetchProfile();
      } catch {}
      if (!isMounted) return;
      const display = user.profile?.displayName || user.profile?.name || '';
      setName(display);
      setLoaded(true);
    })();
    return () => { isMounted = false; };
  }, [user]);

  const effectiveVerified = isVerified;

  const nip05Part = value ? (
    <span className={`inline-flex items-center gap-2 ${effectiveVerified ? 'text-green-400' : 'text-red-400'}`}>
      <FontAwesomeIcon icon={effectiveVerified ? faCircleCheck : faCircleXmark} className="h-4 w-4" />
      <button
        type="button"
        onClick={() => onAuthorClick && onAuthorClick(user.npub)}
        className="hover:underline truncate max-w-[14rem] text-left"
        title={value}
      >
        <span className="truncate max-w-[14rem]">{value}</span>
      </button>
      {/* External link removed */}
      <button
        type="button"
        className="text-gray-300 hover:text-gray-100"
        title="Search for profiles by this domain"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!value) return;
          try {
            const parts = value.includes('@') ? value.split('@') : ['_', value];
            const domain = (parts[1] || parts[0] || '').trim();
            if (!domain) return;
            const q = `p:${domain}`;
            const current = searchParams ? searchParams.toString() : '';
            const params = new URLSearchParams(current);
            params.set('q', q);
            router.push(`/?${params.toString()}`);
          } catch {}
        }}
      >
        <FontAwesomeIcon icon={faMagnifyingGlass} className="h-3 w-3" />
      </button>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-yellow-400">
      <FontAwesomeIcon icon={faCircleExclamation} className="h-4 w-4" />
      <span className="text-gray-400">no NIP-05</span>
    </span>
  );

  return (
    <div className="flex items-center gap-2">
      {loaded ? (
        <button
          type="button"
          onClick={() => onAuthorClick && onAuthorClick(user.npub)}
          className="font-medium text-gray-100 hover:underline truncate max-w-[10rem] text-left"
          title={name || 'Unknown'}
        >
          {name || 'Unknown'}
        </button>
      ) : (
        <span className="font-medium text-gray-100 truncate max-w-[10rem]">Loading...</span>
      )}
      <span className="text-sm truncate">{nip05Part}</span>
    </div>
  );
}


