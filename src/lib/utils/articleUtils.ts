import { NDKEvent } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';

export interface ArticleMetadata {
  title: string;
  summary: string;
  image: string;
  publishedAt: number | null;
  topics: string[];
  dTag: string;
  naddr: string;
}

/**
 * Extract NIP-23 article metadata from a kind:30023 event
 */
export function extractArticleMetadata(event: NDKEvent): ArticleMetadata {
  const getTag = (name: string): string =>
    event.tags?.find((t) => t[0] === name)?.[1] ?? '';

  const dTag = getTag('d');
  const title = getTag('title');
  const summary = getTag('summary');
  const image = getTag('image');
  const publishedAtStr = getTag('published_at');
  const parsedTimestamp = publishedAtStr ? parseInt(publishedAtStr, 10) : NaN;
  const publishedAt = Number.isFinite(parsedTimestamp) ? parsedTimestamp : null;

  const topics = (event.tags ?? [])
    .filter((t) => t[0] === 't' && t[1])
    .map((t) => t[1]);

  let naddr = '';
  try {
    if (event.pubkey && dTag) {
      naddr = nip19.naddrEncode({
        identifier: dTag,
        pubkey: event.pubkey,
        kind: 30023,
      });
    }
  } catch {
    // encoding failed, leave empty
  }

  return { title, summary, image, publishedAt, topics, dTag, naddr };
}

/**
 * Truncate markdown content at a clean boundary (paragraph or line break).
 * Avoids cutting inside links, code blocks, or bold spans.
 */
export function truncateMarkdown(content: string, target = 600): string {
  if (content.length <= target) return content;

  // Look for a paragraph break (double newline) near the target
  const paragraphBreak = content.lastIndexOf('\n\n', target);
  if (paragraphBreak > target * 0.4) return content.slice(0, paragraphBreak);

  // Fall back to a single line break
  const lineBreak = content.lastIndexOf('\n', target);
  if (lineBreak > target * 0.4) return content.slice(0, lineBreak);

  // Last resort: break at a space to avoid splitting words
  const spaceBreak = content.lastIndexOf(' ', target);
  if (spaceBreak > target * 0.4) return content.slice(0, spaceBreak);

  return content.slice(0, target);
}

/**
 * Format a unix timestamp as a readable date string
 */
export function formatArticleDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
