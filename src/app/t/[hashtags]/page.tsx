'use client';

import { useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import SearchView from '@/components/SearchView';

export default function HashtagsPage() {
  const params = useParams<{ hashtags: string }>();
  const router = useRouter();
  const rawHashtags = params?.hashtags || '';

  const normalizedQuery = useMemo(() => {
    const decodeMaybe = (s: string): string => {
      try { return decodeURIComponent(s); } catch { return s; }
    };
    
    let hashtags = decodeMaybe(rawHashtags).trim();
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

  useEffect(() => {
    if (!normalizedQuery) return;
    router.replace(`/?q=${encodeURIComponent(normalizedQuery)}`);
  }, [normalizedQuery, router]);

  return (
    <main className="min-h-screen bg-[#1a1a1a] text-gray-100">
      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-4">
        <div className="text-sm text-gray-400">Searching hashtags: {rawHashtags}</div>
      </div>
    </main>
  );
}
