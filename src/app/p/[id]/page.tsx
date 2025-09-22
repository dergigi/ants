'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { nip19 } from 'nostr-tools';
import SearchView from '@/components/SearchView';
import ProfileCard from '@/components/ProfileCard';
import { resolveNip05ToPubkey } from '@/lib/vertex';
import { useNostrUser } from '@/hooks/useNostrUser';

// shared hook imported from '@/hooks/useNostrUser'

export default function PidPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawId = params?.id || '';
  const q = searchParams?.get('q') || '';

  const id = useMemo(() => {
    const decodeMaybe = (s: string): string => {
      try { return decodeURIComponent(s); } catch { return s; }
    };
    let token = decodeMaybe(rawId).trim();
    if (!token) return '';
    if (/^nostr:/i.test(token)) token = token.replace(/^nostr:/i, '');
    const lower = token.toLowerCase();
    try {
      const decoded = nip19.decode(lower);
      if (decoded?.type === 'nprofile') {
        const pk = (decoded.data as { pubkey: string }).pubkey;
        return nip19.npubEncode(pk);
      }
      if (decoded?.type === 'npub') {
        return lower;
      }
    } catch {}
    return token;
  }, [rawId]);

  const looksLikeNip05 = useMemo(() => /@/.test(id) || /\./.test(id), [id]);
  const isValidNpub = useMemo(() => {
    try {
      const decoded = nip19.decode(id);
      return decoded?.type === 'npub' && typeof decoded.data === 'string';
    } catch {
      return false;
    }
  }, [id]);

  const [mode, setMode] = useState<'profile' | 'psearch' | 'checking'>(() => (isValidNpub ? 'profile' : (looksLikeNip05 ? 'checking' : 'psearch')));
  const npub = useMemo(() => (isValidNpub ? id : null), [isValidNpub, id]);

  useEffect(() => {
    if (isValidNpub) { setMode('profile'); return; }
    if (!looksLikeNip05) { setMode('psearch'); return; }

    let cancelled = false;
    setMode('checking');
    (async () => {
      try {
        const pubkey = await resolveNip05ToPubkey(id);
        if (cancelled) return;
        if (pubkey) {
          const resolvedNpub = nip19.npubEncode(pubkey);
          const carry = q ? `?q=${encodeURIComponent(q)}` : '';
          router.replace(`/p/${resolvedNpub}${carry}`);
        } else {
          setMode('psearch');
        }
      } catch {
        if (!cancelled) setMode('psearch');
      }
    })();
    return () => { cancelled = true; };
  }, [id, isValidNpub, looksLikeNip05, q, router]);

  useEffect(() => {
    if (mode !== 'psearch') return;
    const implicit = (q && q.trim()) ? q : `p:${id}`;
    router.replace(`/?q=${encodeURIComponent(implicit)}`);
  }, [mode, q, id, router]);

  const { profileEvent } = useNostrUser(npub || undefined);

  if (mode === 'checking') {
    return (
      <main className="min-h-screen bg-[#1a1a1a] text-gray-100">
        <div className="max-w-2xl mx-auto px-4 pt-6 space-y-4">
          <div className="text-sm text-gray-400">Trying to resolve NIP-05...</div>
        </div>
      </main>
    );
  }

  if (mode === 'profile' && npub) {
    return (
      <main className="min-h-screen bg-[#1a1a1a] text-gray-100">
        <div className="max-w-2xl mx-auto px-4 pt-6 space-y-4">
          {profileEvent ? (
            <ProfileCard event={profileEvent} onAuthorClick={() => {}} showBanner={true} />
          ) : null}
          <div className="mt-4">
            <SearchView initialQuery={q || `by:${npub}`} manageUrl={true} />
          </div>
        </div>
      </main>
    );
  }

  // Fallback: p-search
  return (
    <main className="min-h-screen bg-[#1a1a1a] text-gray-100">
      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-4">
        <div className="mt-4">
          <SearchView initialQuery={`p:${id}`} manageUrl={true} />
        </div>
      </div>
    </main>
  );
}


