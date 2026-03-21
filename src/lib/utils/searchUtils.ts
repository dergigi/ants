import { NDKEvent } from '@nostr-dev-kit/ndk';

/**
 * Sort events by created_at in descending order (newest first)
 */
export function sortEventsNewestFirst(events: NDKEvent[]): NDKEvent[] {
  return [...events].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
}

/**
 * Sort events by created_at in descending order and slice to limit
 */
export function sortAndLimitEvents(events: NDKEvent[], limit: number): NDKEvent[] {
  return sortEventsNewestFirst(events).slice(0, limit);
}

/**
 * Find a content snippet centered around the first search term match.
 * Returns `isSnippet: true` when the snippet doesn't start at the beginning.
 * Breaks at word boundaries to avoid cutting words mid-character.
 */
export function findSearchSnippet(
  content: string,
  maxLength: number,
  searchTerms?: string[],
): { text: string; isSnippet: boolean } {
  if (content.length <= maxLength) return { text: content, isSnippet: false };

  if (searchTerms?.length) {
    const lowerContent = content.toLowerCase();
    let firstMatchIdx = -1;
    for (const term of searchTerms) {
      const idx = lowerContent.indexOf(term.toLowerCase());
      if (idx !== -1 && (firstMatchIdx === -1 || idx < firstMatchIdx)) {
        firstMatchIdx = idx;
      }
    }
    if (firstMatchIdx > maxLength) {
      const contextBefore = Math.floor(maxLength * 0.3);
      const start = Math.max(0, firstMatchIdx - contextBefore);
      const snippet = content.slice(start, start + maxLength);
      const spaceBreak = snippet.lastIndexOf(' ');
      const text = spaceBreak > snippet.length * 0.4 ? snippet.slice(0, spaceBreak) : snippet;
      return { text, isSnippet: start > 0 };
    }
  }

  return { text: content.slice(0, maxLength), isSnippet: false };
}
