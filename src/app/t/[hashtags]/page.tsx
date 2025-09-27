'use client';

import { useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { decodeMaybe } from '@/lib/utils';
import { LoadingLayout } from '@/components/LoadingLayout';

export default function HashtagsPage() {
  const params = useParams<{ hashtags: string }>();
  const router = useRouter();
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

  useEffect(() => {
    if (!normalizedQuery) return;
    router.replace(`/?q=${encodeURIComponent(normalizedQuery)}`);
  }, [normalizedQuery, router]);

  return <LoadingLayout message={`Searching hashtags: ${rawHashtags}`} />;
}
