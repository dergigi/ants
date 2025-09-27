'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { getNip05Domain, isRootNip05 } from '@/lib/nip05';
import { cleanNip05Display } from '@/lib/utils';

// Extract domain part without TLD for mobile display
function getDomainWithoutTld(nip05?: string): string {
  if (!nip05) return '';
  const domain = getNip05Domain(nip05);
  if (!domain) return '';
  
  // Split by dots and take everything except the last part (TLD)
  const parts = domain.split('.');
  if (parts.length <= 1) return domain;
  
  // Return all parts except the last one (TLD)
  return parts.slice(0, -1).join('.');
}
import { NDKUser } from '@nostr-dev-kit/ndk';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleXmark, faCircleExclamation, faUserGroup, faCheckDouble } from '@fortawesome/free-solid-svg-icons';
import { faIdBadge } from '@fortawesome/free-regular-svg-icons';

type Nip05CheckResult = { isVerified: boolean; value: string | undefined };

function useNip05Status(user: NDKUser): Nip05CheckResult {
  const nip05Raw = user.profile?.nip05 as
    | string
    | { url?: string; verified?: boolean }
    | undefined;
  const nip05 = typeof nip05Raw === 'string' ? nip05Raw : nip05Raw?.url;
  const hintedVerified =
    typeof nip05Raw === 'object' && nip05Raw !== null && typeof nip05Raw.verified === 'boolean'
      ? nip05Raw.verified
      : undefined;
  const [verified, setVerified] = useState(Boolean(hintedVerified));
  const pubkey = user.pubkey;

  useEffect(() => {
    if (typeof hintedVerified === 'boolean') {
      setVerified(hintedVerified);
    } else if (!nip05) {
      setVerified(false);
    }
  }, [hintedVerified, nip05]);

  useEffect(() => {
    let isMounted = true;
    if (!nip05) {
      setVerified(false);
      return () => {
        isMounted = false;
      };
    }
    (async () => {
      try {
        const { checkNip05 } = await import('@/lib/vertex');
        const result = await checkNip05(pubkey, nip05);
        if (isMounted) setVerified(Boolean(result));
      } catch {
        if (isMounted) setVerified(false);
      }
    })();
    return () => { isMounted = false; };
  }, [pubkey, nip05]);

  return { isVerified: verified, value: nip05 };
}

export default function Nip05Display({ user }: { user: NDKUser }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { isVerified, value } = useNip05Status(user);

  const effectiveVerified = isVerified;

  const nip05Part = value ? (
    <span className={`inline-flex items-center gap-1 ${effectiveVerified ? 'text-green-400' : 'text-red-400'}`}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!value) return;
          const current = searchParams ? searchParams.toString() : '';
          const params = new URLSearchParams(current);
          params.set('q', value);
          router.push(`/?${params.toString()}`);
        }}
        className="hover:opacity-80 transition-opacity"
        title={`Search for ${value}`}
      >
        {effectiveVerified && isRootNip05(value) ? (
          <>
            <FontAwesomeIcon icon={faCheckDouble} className="h-4 w-4" />
            <FontAwesomeIcon icon={faIdBadge} className="h-4 w-4" />
          </>
        ) : (
          <FontAwesomeIcon icon={effectiveVerified ? faIdBadge : faCircleXmark} className="h-4 w-4" />
        )}
      </button>
      <button
        type="button"
        className="hover:underline truncate max-w-[14rem] text-left hidden sm:block"
        title={cleanNip05Display(value) || undefined}
      >
        <span className="truncate max-w-[14rem]">{cleanNip05Display(value) || value}</span>
      </button>
      {/* Mobile view: show only domain part without TLD */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!value) return;
          const current = searchParams ? searchParams.toString() : '';
          const params = new URLSearchParams(current);
          params.set('q', value);
          router.push(`/?${params.toString()}`);
        }}
        className="hover:underline truncate max-w-[8rem] text-left sm:hidden"
        title={cleanNip05Display(value) || undefined}
      >
        <span className="truncate max-w-[8rem]">{getDomainWithoutTld(value)}</span>
      </button>
      {pathname?.startsWith('/p/') && (
      <button
        type="button"
        className="text-gray-300 hover:text-gray-100"
        title="Search for profiles by this domain"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!value) return;
          const domain = getNip05Domain(value);
          if (!domain) return;
          const q = `p:${domain}`;
          const current = searchParams ? searchParams.toString() : '';
          const params = new URLSearchParams(current);
          params.set('q', q);
          router.push(`/?${params.toString()}`);
        }}
      >
        <FontAwesomeIcon icon={faUserGroup} className="h-3 w-3" />
      </button>
      )}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-yellow-400">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const current = searchParams ? searchParams.toString() : '';
          const params = new URLSearchParams(current);
          params.set('q', 'nip:05');
          router.push(`/?${params.toString()}`);
        }}
        className="hover:opacity-80 transition-opacity"
        title="Search for NIP-05 specification"
      >
        <FontAwesomeIcon icon={faCircleExclamation} className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const current = searchParams ? searchParams.toString() : '';
          const params = new URLSearchParams(current);
          params.set('q', 'nip:05');
          router.push(`/?${params.toString()}`);
        }}
        className="text-gray-400 hidden sm:inline hover:underline"
        title="Search for NIP-05 specification"
      >
        no NIP-05
      </button>
      {/* Mobile view: show shorter text */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const current = searchParams ? searchParams.toString() : '';
          const params = new URLSearchParams(current);
          params.set('q', 'nip:05');
          router.push(`/?${params.toString()}`);
        }}
        className="text-gray-400 sm:hidden hover:underline"
        title="Search for NIP-05 specification"
      >
        no NIP-05
      </button>
    </span>
  );

  return (
    <div className="flex items-center gap-2">
      {nip05Part}
    </div>
  );
}
