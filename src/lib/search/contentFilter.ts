import { NDKEvent } from '@nostr-dev-kit/ndk';

/** Escape special regex characters in a string */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Structured token patterns that should be stripped before extracting content search terms.
 * These correspond to NIP-50 extensions, filter operators, and special syntax the app supports.
 */
const STRUCTURED_TOKEN_PATTERN =
  /\b(?:by|kind|kinds|since|until|mentions|reply|ref|link|id|d|a|domain|language|sentiment|nsfw|include|is|p):\S+|#[A-Za-z0-9_]+/gi;

/**
 * Parse a search query, strip all structured tokens (by:, kind:, #hashtag, etc.),
 * and return the remaining content search terms.
 * Returns null if no content terms remain.
 */
export function extractContentSearchTerms(query: string): string[] | null {
  // Extract quoted phrases first, before stripping structured tokens
  const phrases: string[] = [];
  const withoutQuotes = query.replace(/"([^"]+)"/g, (_match, phrase: string) => {
    const trimmed = phrase.trim();
    if (trimmed) phrases.push(trimmed);
    return ' '; // remove from query so individual words aren't also extracted
  });

  const stripped = withoutQuotes
    .replace(STRUCTURED_TOKEN_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = stripped.split(' ').filter(Boolean);
  const terms = [...phrases, ...words];
  return terms.length > 0 ? terms : null;
}

/**
 * Filter events whose content doesn't contain ANY of the given terms (case-insensitive).
 * Events with empty content are kept (they may be media-only kinds like reposts).
 */
export function filterByContent(events: NDKEvent[], terms: string[]): NDKEvent[] {
  if (terms.length === 0) return events;

  const lowerTerms = terms.map((t) => t.toLowerCase());

  // Kinds where content is not the primary data (reposts, reactions, zaps)
  const CONTENT_EXEMPT_KINDS = new Set([6, 7, 16, 9735]);

  return events.filter((event) => {
    // Reposts, reactions, zaps — content is not meaningful text
    if (CONTENT_EXEMPT_KINDS.has(event.kind ?? -1)) return true;

    // Build searchable text from content + visible tag values
    const parts: string[] = [];
    if (event.content) parts.push(event.content);
    // Include tag values that contribute to visible display (description, title, summary, alt)
    for (const tag of event.tags || []) {
      if (tag[0] === 'description' || tag[0] === 'title' || tag[0] === 'summary' || tag[0] === 'alt' || tag[0] === 'name') {
        if (tag[1]) parts.push(tag[1]);
      }
    }

    const searchable = parts.join(' ');
    if (searchable.length === 0) return false; // No text at all — filter out

    const lowerSearchable = searchable.toLowerCase();
    return lowerTerms.some((term) => {
      // Short terms (<=3 chars) use word-boundary matching to avoid
      // false positives like "designer" matching "GN"
      if (term.length <= 3) {
        const boundary = new RegExp(`(?:^|[\\s,.!?;:'"()\\[\\]{}#@/\\\\—–-])${escapeRegex(term)}(?:$|[\\s,.!?;:'"()\\[\\]{}#@/\\\\—–-])`, 'i');
        return boundary.test(searchable);
      }
      return lowerSearchable.includes(term);
    });
  });
}
