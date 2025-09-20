'use client';

import { useEffect, useState } from 'react';
import { NDKUser } from '@nostr-dev-kit/ndk';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleCheck, faCircleXmark, faCircleExclamation, faArrowUpRightFromSquare, faArrowsRotate } from '@fortawesome/free-solid-svg-icons';

type Nip05CheckResult = {
  isVerified: boolean;
  value: string | undefined;
};

const nip05Cache = new Map<string, boolean>();

async function verifyNip05(pubkeyHex: string, nip05?: string): Promise<boolean> {
  if (!nip05) return false;
  const cacheKey = `${nip05}|${pubkeyHex}`;
  if (nip05Cache.has(cacheKey)) return nip05Cache.get(cacheKey) as boolean;

  try {
    const [namePart, domainPartCandidate] = nip05.includes('@') ? nip05.split('@') : ['_', nip05];
    const name = namePart || '_';
    const domain = (domainPartCandidate || '').trim();
    if (!domain) {
      nip05Cache.set(cacheKey, false);
      return false;
    }
    const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) {
      nip05Cache.set(cacheKey, false);
      return false;
    }
    const data = await res.json();
    const mapped = (data?.names?.[name] as string | undefined)?.toLowerCase();
    const result = mapped === pubkeyHex.toLowerCase();
    nip05Cache.set(cacheKey, result);
    return result;
  } catch {
    nip05Cache.set(cacheKey, false);
    return false;
  }
}

function useNip05Status(user: NDKUser): Nip05CheckResult {
  const [verified, setVerified] = useState(false);
  const nip05 = user.profile?.nip05;
  const pubkey = user.pubkey;

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const result = await verifyNip05(pubkey, nip05);
      if (isMounted) setVerified(result);
    })();
    return () => { isMounted = false; };
  }, [pubkey, nip05]);

  return { isVerified: verified, value: nip05 };
}

export default function AuthorBadge({ user, onAuthorClick }: { user: NDKUser, onAuthorClick?: (npub: string) => void }) {
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const { isVerified, value } = useNip05Status(user);
  const [manualVerified, setManualVerified] = useState<boolean | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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

  const effectiveVerified = manualVerified ?? isVerified;

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
      {(() => {
        const parts = value.includes('@') ? value.split('@') : ['_', value];
        const domain = (parts[1] || parts[0] || '').trim();
        if (!domain) return null;
        const wellKnown = `https://${domain}/.well-known/nostr.json`;
        return (
          <a
            href={wellKnown}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-gray-200"
            title={`Open ${wellKnown}`}
            onClick={(e) => { e.stopPropagation(); }}
          >
            <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3 w-3" />
          </a>
        );
      })()}
      <button
        type="button"
        className="text-gray-300 hover:text-gray-100"
        title={refreshing ? 'Re-validating…' : 'Re-validate NIP-05 now'}
        onClick={async (e) => {
          e.preventDefault();
          if (!value) return;
          setRefreshing(true);
          try {
            // invalidate local cache and re-run verification
            try { nip05Cache.delete(`${value}|${user.pubkey}`); } catch {}
            const ok = await verifyNip05(user.pubkey, value);
            setManualVerified(ok);
          } catch {
            setManualVerified(false);
          } finally {
            setRefreshing(false);
          }
        }}
      >
        <FontAwesomeIcon icon={faArrowsRotate} className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
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


