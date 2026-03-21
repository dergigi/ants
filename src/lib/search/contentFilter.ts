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
  /\b(?:by|kind|kinds|since|until|mentions|reply|ref|link|id|d|a|domain|language|sentiment|nsfw|include|is|has|site|p):\S+|#[A-Za-z0-9_]+/gi;

/**
 * Parse a search query, strip all structured tokens (by:, kind:, #hashtag, etc.),
 * boolean operators (AND/OR/NOT), and grouping punctuation.
 * Returns the remaining content search terms, or null if none remain.
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
    .replace(/[()"]/g, ' ')
    .replace(/\b(?:AND|OR|NOT)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = stripped.split(' ').filter(Boolean);
  const terms = [...phrases, ...words];
  return terms.length > 0 ? terms : null;
}

/**
 * Convenience: extract content terms from a query and filter results.
 * Returns results unchanged if no content terms exist in the query.
 */
export function applyContentFilter(results: NDKEvent[], query: string): NDKEvent[] {
  const terms = extractContentSearchTerms(query);
  return terms ? filterByContent(results, terms) : results;
}

/**
 * Filter events whose content doesn't contain ANY of the given terms (case-insensitive).
 * Events with empty content are kept (they may be media-only kinds like reposts).
 */
export function filterByContent(events: NDKEvent[], terms: string[]): NDKEvent[] {
  if (terms.length === 0) return events;

  const lowerTerms = terms.map((t) => t.toLowerCase());

  return events.filter((event) => {
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
