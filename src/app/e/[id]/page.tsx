'use client';

import { useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LoadingLayout } from '@/components/LoadingLayout';
import SearchView from '@/components/SearchView';
import { parseEventIdentifier, isValidEventIdentifier } from '@/lib/utils/nostrIdentifiers';
import { isHashtagOnlyQuery, hashtagQueryToUrl } from '@/lib/utils';

export default function EidRedirectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const rawId = params?.id || '';

  const normalizedQuery = useMemo(() => parseEventIdentifier(rawId), [rawId]);

  // If we have a valid nevent/note, display it directly instead of redirecting
  const isValidNevent = useMemo(() => isValidEventIdentifier(normalizedQuery), [normalizedQuery]);

  // Unified URL update handler: while on /e/ pages, any non-empty query
  // should navigate to either /t/<tags> for hashtag-only queries or
  // to the root search with ?q=<query> for general searches.
  const handleUrlUpdate = useCallback((q: string) => {
    const query = (q || '').trim();
    if (!query) return;
    if (isHashtagOnlyQuery(query)) {
      const tagUrl = hashtagQueryToUrl(query);
      if (tagUrl) {
        router.replace(`/t/${tagUrl}`);
        return;
      }
    }
    router.replace(`/?q=${encodeURIComponent(query)}`);
  }, [router]);

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
            onUrlUpdate={handleUrlUpdate}
          />
        </div>
      </main>
    );
  }

  return <LoadingLayout message="Redirecting to search…" />;
}


