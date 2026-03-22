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
 * Events with no searchable text (content + relevant tags like title/description/summary/alt)
 * are filtered out. Media-only events without these tags will not pass the filter.
 */
export function filterByContent(events: NDKEvent[], terms: string[]): NDKEvent[] {
  if (terms.length === 0) return events;

  const lowerTerms = terms.map((t) => t.toLowerCase());

  // Pre-compile boundary regexes for short terms (avoids re-creating per event)
  const shortTermRegexes = lowerTerms
    .filter((t) => t.length <= 3)
    .map((term) => new RegExp(
      `(?:^|[\\s,.!?;:'"()\\[\\]{}#@/\\\\—–-])${escapeRegex(term)}(?:$|[\\s,.!?;:'"()\\[\\]{}#@/\\\\—–-])`, 'i'
    ));
  const longTerms = lowerTerms.filter((t) => t.length > 3);

  return events.filter((event) => {
    // Build searchable text from content + relevant tag values.
    // We intentionally keep URLs and nostr: references in the searchable text.
    // Stripping them broke GIF, filename, URL, and NIP-05 searches (#228).
    // The relay already matched these events via NIP-50 — filtering them out
    // client-side just throws away valid results.
    const parts: string[] = [];
    if (event.content) parts.push(event.content);
    for (const tag of event.tags || []) {
      if (tag[0] === 'description' || tag[0] === 'title' || tag[0] === 'summary' || tag[0] === 'alt' || tag[0] === 'name') {
        if (tag[1]) parts.push(tag[1]);
      }
    }

    const searchable = parts.join(' ');
    if (searchable.length === 0) return false;

    const lowerSearchable = searchable.toLowerCase();
    return shortTermRegexes.some((regex) => regex.test(searchable)) ||
      longTerms.some((term) => lowerSearchable.includes(term));
  });
}
