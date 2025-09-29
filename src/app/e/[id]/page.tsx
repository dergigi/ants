'use client';

import { useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { nip19 } from 'nostr-tools';
import { decodeMaybe } from '@/lib/utils';
import { LoadingLayout } from '@/components/LoadingLayout';
import SearchView from '@/components/SearchView';

export default function EidRedirectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const rawId = params?.id || '';

  const normalizedQuery = useMemo(() => {
    let token = decodeMaybe(rawId).trim();
    if (!token) return '';
    if (/^nostr:/i.test(token)) token = token.replace(/^nostr:/i, '');
    const lower = token.toLowerCase();

    // If it's bech32 nevent/note, pass through unchanged
    try {
      const decoded = nip19.decode(lower);
      if (decoded?.type === 'nevent' || decoded?.type === 'note') {
        return lower;
      }
    } catch {}

    // If it's a 64-char hex event id, encode as nevent so search can fetch by id
    if (/^[0-9a-fA-F]{64}$/.test(token)) {
      try {
        const nevent = nip19.neventEncode({ id: token.toLowerCase() });
        return nevent;
      } catch {}
    }

    // Fallback: use whatever was passed
    return token;
  }, [rawId]);

  // If we have a valid nevent/note, display it directly instead of redirecting
  const isValidNevent = useMemo(() => {
    if (!normalizedQuery) return false;
    try {
      const decoded = nip19.decode(normalizedQuery);
      return decoded?.type === 'nevent' || decoded?.type === 'note';
    } catch {
      return false;
    }
  }, [normalizedQuery]);

  useEffect(() => {
    if (!normalizedQuery) return;
    
    // Only redirect if it's not a valid nevent/note to avoid infinite loop
    if (!isValidNevent) {
      router.replace(`/?q=${encodeURIComponent(normalizedQuery)}`);
    }
  }, [normalizedQuery, router, isValidNevent]);

  // If it's a valid nevent/note, display the search view directly
  if (isValidNevent) {
    return (
      <main className="min-h-screen bg-[#1a1a1a] text-gray-100">
        <div className="max-w-2xl mx-auto px-4 min-h-screen flex items-center w-full">
          <SearchView 
            initialQuery={normalizedQuery} 
            manageUrl={false}
          />
        </div>
      </main>
    );
  }

  return <LoadingLayout message="Redirecting to search…" />;
}


