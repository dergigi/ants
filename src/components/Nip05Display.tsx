'use client';

import { useEffect, useRef, useState } from 'react';
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
import { getCachedNip05String, setCachedNip05String } from '@/lib/profile/cache';

type Nip05CheckResult = { isVerified: boolean; value: string | undefined };

function useNip05Status(user: NDKUser): Nip05CheckResult {
  const nip05Raw = user.profile?.nip05 as
    | string
    | { url?: string; verified?: boolean }
    | undefined;
  const extractedFromProfile = typeof nip05Raw === 'string' ? nip05Raw : nip05Raw?.url;
  const hintedVerified =
    typeof nip05Raw === 'object' && nip05Raw !== null && typeof nip05Raw.verified === 'boolean'
      ? nip05Raw.verified
      : undefined;
  const [nip05Value, setNip05Value] = useState<string | null | undefined>(() => {
    if (extractedFromProfile) {
      setCachedNip05String(user.pubkey, extractedFromProfile);
      return extractedFromProfile;
    }
    return getCachedNip05String(user.pubkey);
  });
  const [verified, setVerified] = useState(Boolean(hintedVerified));
  const [, forceProfileRefresh] = useState(0);
  const pubkey = user.pubkey;
  const fetchStateRef = useRef<{ pubkey: string | null; attempted: boolean }>({ pubkey: null, attempted: false });

  useEffect(() => {
    if (typeof hintedVerified === 'boolean') {
      setVerified(hintedVerified);
    } else if (!nip05Value) {
      setVerified(false);
    }
  }, [hintedVerified, nip05Value]);

  useEffect(() => {
    if (extractedFromProfile) {
      setNip05Value((prev) => (prev === extractedFromProfile ? prev : extractedFromProfile));
      setCachedNip05String(pubkey, extractedFromProfile);
    } else if (nip05Raw !== undefined) {
      // profile explicitly missing nip05
      setNip05Value((prev) => (prev === null ? prev : null));
      setCachedNip05String(pubkey, null);
    }
  }, [extractedFromProfile, nip05Raw, pubkey]);

  useEffect(() => {
    if (!user?.pubkey) return;

    if (fetchStateRef.current.pubkey !== user.pubkey) {
      fetchStateRef.current = { pubkey: user.pubkey, attempted: false };
    }

    if (nip05Value !== undefined && nip05Value !== null || fetchStateRef.current.attempted) return;

    fetchStateRef.current.attempted = true;
    let cancelled = false;

    (async () => {
      try {
        await user.fetchProfile();
      } catch {}
      if (cancelled) return;
      forceProfileRefresh((count) => count + 1);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, nip05Value, forceProfileRefresh]);

  useEffect(() => {
    let isMounted = true;
    if (!nip05Value) {
      setVerified(false);
      return () => {
        isMounted = false;
      };
    }
    (async () => {
      try {
        const { checkNip05 } = await import('@/lib/vertex');
        const result = await checkNip05(pubkey, nip05Value);
        if (isMounted) setVerified(Boolean(result));
      } catch {
        if (isMounted) setVerified(false);
      }
    })();
    return () => { isMounted = false; };
  }, [pubkey, nip05Value]);

  return { isVerified: verified, value: nip05Value ?? undefined };
}

export default function Nip05Display({ user, compact }: { user: NDKUser; compact?: boolean }) {
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
      {compact ? null : (
        <>
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
        </>
      )}
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
      {compact ? null : (
        <>
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
        </>
      )}
    </span>
  );

  return (
    <div className="flex items-center gap-2">
      {nip05Part}
    </div>
  );
}
