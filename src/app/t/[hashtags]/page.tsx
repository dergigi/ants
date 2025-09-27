'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { decodeMaybe } from '@/lib/utils';
import SearchView from '@/components/SearchView';

export default function HashtagsPage() {
  const params = useParams<{ hashtags: string }>();
  const rawHashtags = params?.hashtags || '';

  const normalizedQuery = useMemo(() => {
    const hashtags = decodeMaybe(rawHashtags).trim();
    if (!hashtags) return '';
    
    // Split by comma, space, or plus sign to handle multiple hashtags
    const hashtagList = hashtags
      .split(/[,+\s]+/)
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0)
      .map(tag => {
        // Ensure hashtag starts with # if not already present
        return tag.startsWith('#') ? tag : `#${tag}`;
      });
    
    if (hashtagList.length === 0) return '';
    
    // If multiple hashtags, join with OR operator
    if (hashtagList.length === 1) {
      return hashtagList[0];
    } else {
      return hashtagList.join(' OR ');
    }
  }, [rawHashtags]);

  return (
    <main className="min-h-screen bg-[#1a1a1a] text-gray-100">
      <div className="max-w-2xl mx-auto px-4 min-h-screen flex items-center w-full">
        <SearchView initialQuery={normalizedQuery} manageUrl={false} />
      </div>
    </main>
  );
}
