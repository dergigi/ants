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
 *
 * When searchTerms are provided and the first match is beyond the default
 * truncation window, returns a snippet centered around the match with
 * `isSnippet: true` so callers can prepend an ellipsis.
 */
export function truncateMarkdown(
  content: string,
  target = 600,
  searchTerms?: string[],
): { text: string; isSnippet: boolean } {
  if (content.length <= target) return { text: content, isSnippet: false };

  // Check if search terms appear beyond the default truncation window
  if (searchTerms?.length) {
    const lowerContent = content.toLowerCase();
    let firstMatchIdx = -1;
    for (const term of searchTerms) {
      const idx = lowerContent.indexOf(term.toLowerCase());
      if (idx !== -1 && (firstMatchIdx === -1 || idx < firstMatchIdx)) {
        firstMatchIdx = idx;
      }
    }
    if (firstMatchIdx > target) {
      const contextBefore = Math.floor(target * 0.3);
      const start = Math.max(0, firstMatchIdx - contextBefore);
      const snippet = content.slice(start, start + target);
      // Try to break at a clean boundary
      const spaceBreak = snippet.lastIndexOf(' ', target);
      const text = spaceBreak > target * 0.4 ? snippet.slice(0, spaceBreak) : snippet;
      return { text, isSnippet: start > 0 };
    }
  }

  // Default: truncate from the beginning at a clean boundary
  const paragraphBreak = content.lastIndexOf('\n\n', target);
  if (paragraphBreak > target * 0.4) return { text: content.slice(0, paragraphBreak), isSnippet: false };

  const lineBreak = content.lastIndexOf('\n', target);
  if (lineBreak > target * 0.4) return { text: content.slice(0, lineBreak), isSnippet: false };

  const spaceBreak = content.lastIndexOf(' ', target);
  if (spaceBreak > target * 0.4) return { text: content.slice(0, spaceBreak), isSnippet: false };

  return { text: content.slice(0, target), isSnippet: false };
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
