'use client';

import type { NDKEvent } from '@nostr-dev-kit/ndk';

function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function extractImetaImageUrls(event: NDKEvent): string[] {
  const urls: string[] = [];
  const tags = (event?.tags || []) as unknown as string[][];
  for (const tag of tags) {
    if (!Array.isArray(tag) || tag.length < 2) continue;
    if (tag[0] !== 'imeta') continue;
    for (let i = 1; i < tag.length; i++) {
      const entry = tag[i];
      if (typeof entry !== 'string') continue;
      if (entry.startsWith('url ')) {
        const maybeUrl = entry.slice(4).trim();
        if (maybeUrl && isHttpUrl(maybeUrl)) urls.push(maybeUrl);
      }
    }
  }
  // Deduplicate while preserving order
  return Array.from(new Set(urls));
}


