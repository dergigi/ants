'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { decodeMaybe, processHashtagInput } from '@/lib/utils';
import SearchView from '@/components/SearchView';

export default function HashtagsPage() {
  const params = useParams<{ hashtags: string }>();
  const rawHashtags = params?.hashtags || '';

  const normalizedQuery = useMemo(() => {
    const hashtags = decodeMaybe(rawHashtags);
    return processHashtagInput(hashtags);
  }, [rawHashtags]);

  return (
    <main className="min-h-screen bg-[#1a1a1a] text-gray-100">
      <div className="max-w-2xl mx-auto px-4 min-h-screen flex items-center w-full">
        <SearchView initialQuery={normalizedQuery} manageUrl={false} />
      </div>
    </main>
  );
}
