'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import SearchView from '@/components/SearchView';
import ProfileCard from '@/components/ProfileCard';
import NoteHeader from '@/components/NoteHeader';
import { resolveNip05ToPubkey } from '@/lib/vertex';
import { useNostrUser } from '@/hooks/useNostrUser';
import { LoadingLayout } from '@/components/LoadingLayout';
import { ProfileCardPlaceholder, PlaceholderStyles } from '@/components/Placeholder';
import { parseProfileIdentifier, isValidNpub } from '@/lib/utils/nostrIdentifiers';
import { nip19 } from 'nostr-tools';

// shared hook imported from '@/hooks/useNostrUser'

export default function PidPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawId = params?.id || '';
  const q = searchParams?.get('q') || '';

  const id = useMemo(() => parseProfileIdentifier(rawId), [rawId]);

  const looksLikeNip05 = useMemo(() => /@/.test(id) || /\./.test(id), [id]);
  const isValidNpubValue = useMemo(() => isValidNpub(id), [id]);

  const [mode, setMode] = useState<'profile' | 'psearch' | 'checking'>(() => (isValidNpubValue ? 'profile' : (looksLikeNip05 ? 'checking' : 'psearch')));
  const npub = useMemo(() => (isValidNpubValue ? id : null), [isValidNpubValue, id]);

  useEffect(() => {
    if (isValidNpubValue) { setMode('profile'); return; }
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
  }, [id, isValidNpubValue, looksLikeNip05, q, router]);

  useEffect(() => {
    if (mode !== 'psearch') return;
    const implicit = (q && q.trim()) ? q : `p:${id}`;
    router.replace(`/?q=${encodeURIComponent(implicit)}`);
  }, [mode, q, id, router]);

  const { profileEvent } = useNostrUser(npub || undefined);

  if (mode === 'checking') {
    return <LoadingLayout message="Trying to resolve NIP-05..." showProfilePlaceholder={true} />;
  }

  if (mode === 'profile' && npub) {
    return (
      <main className="min-h-screen bg-[#1a1a1a] text-gray-100">
        <PlaceholderStyles />
        <div className="max-w-2xl mx-auto px-4 pt-6 space-y-4">
          {profileEvent ? (
            <NoteHeader
              event={profileEvent}
              onSearch={(query) => {
                if (!query) return;
                const params = new URLSearchParams(searchParams?.toString() || '');
                params.set('q', query);
                router.replace(`?${params.toString()}`);
              }}
            />
          ) : null}
          {profileEvent ? (
            <ProfileCard event={profileEvent} onAuthorClick={() => {}} showBanner={true} />
          ) : (
            <ProfileCardPlaceholder />
          )}
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


