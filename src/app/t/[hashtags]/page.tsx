'use client';

import { useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { decodeMaybe, processHashtagInput, isHashtagOnlyQuery, hashtagQueryToUrl } from '@/lib/utils';
import SearchView from '@/components/SearchView';

export default function HashtagsPage() {
  const params = useParams<{ hashtags: string }>();
  const router = useRouter();
  const rawHashtags = params?.hashtags || '';

  const normalizedQuery = useMemo(() => {
    const hashtags = decodeMaybe(rawHashtags);
    return processHashtagInput(hashtags);
  }, [rawHashtags]);

  // Custom URL management for hashtag pages
  const handleUrlUpdate = useCallback((query: string) => {
    if (isHashtagOnlyQuery(query)) {
      // If it's hashtag-only, update to /t/ path
      const hashtagUrl = hashtagQueryToUrl(query);
      if (hashtagUrl) {
        router.replace(`/t/${hashtagUrl}`);
      }
    } else {
      // If it's not hashtag-only, redirect to main search
      router.replace(`/?q=${encodeURIComponent(query)}`);
    }
  }, [router]);

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
