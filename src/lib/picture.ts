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

export function extractImetaVideoUrls(event: NDKEvent): string[] {
  const urls: string[] = [];
  const tags = (event?.tags || []) as unknown as string[][];
  const VIDEO_MIME_RX = /^(video\/|application\/x-mpegURL)/i;
  const VIDEO_FILE_RX = /\.(mp4|webm|ogg|ogv|mov|m4v|m3u8)(?:[?#].*)?$/i;
  for (const tag of tags) {
    if (!Array.isArray(tag) || tag.length < 2) continue;
    if (tag[0] !== 'imeta') continue;
    let hasVideoMime = false;
    const localUrls: string[] = [];
    for (let i = 1; i < tag.length; i++) {
      const entry = tag[i];
      if (typeof entry !== 'string') continue;
      if (entry.startsWith('m ')) {
        const mime = entry.slice(2).trim();
        if (VIDEO_MIME_RX.test(mime)) hasVideoMime = true;
      } else if (entry.startsWith('url ')) {
        const u = entry.slice(4).trim();
        if (u && isHttpUrl(u)) localUrls.push(u);
      } else if (entry.startsWith('fallback ')) {
        const u = entry.slice(9).trim();
        if (u && isHttpUrl(u)) localUrls.push(u);
      }
    }
    for (const u of localUrls) {
      if (hasVideoMime || VIDEO_FILE_RX.test(u)) urls.push(u);
    }
  }
  return Array.from(new Set(urls));
}

export function extractImetaBlurhashes(event: NDKEvent): string[] {
  const hashes: string[] = [];
  const tags = (event?.tags || []) as unknown as string[][];
  for (const tag of tags) {
    if (!Array.isArray(tag) || tag.length < 2) continue;
    if (tag[0] !== 'imeta') continue;
    for (let i = 1; i < tag.length; i++) {
      const entry = tag[i];
      if (typeof entry !== 'string') continue;
      if (entry.startsWith('blurhash ')) {
        const hash = entry.slice(9).trim();
        if (hash) hashes.push(hash);
      }
    }
  }
  return Array.from(new Set(hashes));
}

export function extractImetaDimensions(event: NDKEvent): Array<{ width: number; height: number }> {
  const dimensions: Array<{ width: number; height: number }> = [];
  const tags = (event?.tags || []) as unknown as string[][];
  for (const tag of tags) {
    if (!Array.isArray(tag) || tag.length < 2) continue;
    if (tag[0] !== 'imeta') continue;
    for (let i = 1; i < tag.length; i++) {
      const entry = tag[i];
      if (typeof entry !== 'string') continue;
      if (entry.startsWith('dim ')) {
        const dimStr = entry.slice(4).trim();
        const match = dimStr.match(/^(\d+)x(\d+)$/);
        if (match) {
          const width = parseInt(match[1], 10);
          const height = parseInt(match[2], 10);
          if (width > 0 && height > 0) {
            dimensions.push({ width, height });
          }
        }
      }
    }
  }
  return dimensions;
}


