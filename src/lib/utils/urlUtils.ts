import { URL_REGEX, IMAGE_EXT_REGEX, VIDEO_EXT_REGEX } from '../urlPatterns';

/**
 * Extract URLs from text using the standard URL regex
 */
export function extractUrlsFromText(text: string): string[] {
  if (!text) return [];
  const urls: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = URL_REGEX.exec(text)) !== null) {
    const url = (m[1] || '').replace(/[),.;]+$/, '').trim();
    if (url && !urls.includes(url)) {
      urls.push(url);
    }
  }
  return urls;
}

/**
 * Extract image URLs from text
 */
export function extractImageUrls(text: string): string[] {
  if (!text) return [];
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = URL_REGEX.exec(text)) !== null) {
    const url = (m[1] || '').replace(/[),.;]+$/, '').trim();
    if (IMAGE_EXT_REGEX.test(url) && !matches.includes(url)) {
      matches.push(url);
    }
  }
  return matches;
}

/**
 * Extract video URLs from text
 */
export function extractVideoUrls(text: string): string[] {
  if (!text) return [];
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = URL_REGEX.exec(text)) !== null) {
    const url = (m[1] || '').replace(/[),.;]+$/, '').trim();
    if (VIDEO_EXT_REGEX.test(url) && !matches.includes(url)) {
      matches.push(url);
    }
  }
  return matches;
}

/**
 * Extract non-media URLs from text (excludes images and videos)
 */
export function extractNonMediaUrls(text: string): string[] {
  if (!text) return [];
  const urls: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = URL_REGEX.exec(text)) !== null) {
    const raw = (m[1] || '').replace(/[),.;]+$/, '').trim();
    if (!IMAGE_EXT_REGEX.test(raw) && !VIDEO_EXT_REGEX.test(raw) && !urls.includes(raw)) {
      urls.push(raw);
    }
  }
  return urls;
}

/**
 * Get filename from URL
 */
export function getFilenameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const pathname = u.pathname || '';
    const last = pathname.split('/').filter(Boolean).pop() || '';
    return last;
  } catch {
    // Fallback for invalid URLs in content
    const cleaned = url.split(/[?#]/)[0];
    const parts = cleaned.split('/');
    return parts[parts.length - 1] || url;
  }
}
