import { NDKEvent } from '@nostr-dev-kit/ndk';

// NIP-84 Highlights utilities
export const HIGHLIGHTS_KIND = 9802;

export interface HighlightData {
  content: string;
  referencedEvent?: string;
  referencedAuthor?: string;
  referencedUrl?: string;
  context?: string;
  range?: string;
  tags: string[][];
}

/**
 * Parse a NIP-84 highlight event and extract relevant data
 */
export function parseHighlightEvent(event: NDKEvent): HighlightData | null {
  if (event.kind !== HIGHLIGHTS_KIND) {
    return null;
  }

  const tags = event.tags || [];
  const content = event.content || '';

  // Extract referenced event (e tag)
  const eventTag = tags.find(tag => tag[0] === 'e' && tag[1]);
  const referencedEvent = eventTag?.[1];

  // Extract referenced author (p tag)
  const authorTag = tags.find(tag => tag[0] === 'p' && tag[1]);
  const referencedAuthor = authorTag?.[1];

  // Extract referenced URL (r tag)
  const urlTag = tags.find(tag => tag[0] === 'r' && tag[1]);
  const referencedUrl = urlTag?.[1];

  // Extract context (context tag)
  const contextTag = tags.find(tag => tag[0] === 'context' && tag[1]);
  const context = contextTag?.[1];

  // Extract range (range tag)
  const rangeTag = tags.find(tag => tag[0] === 'range' && tag[1]);
  const range = rangeTag?.[1];

  return {
    content,
    referencedEvent,
    referencedAuthor,
    referencedUrl,
    context,
    range,
    tags
  };
}

/**
 * Check if an event is a NIP-84 highlight
 */
export function isHighlightEvent(event: NDKEvent): boolean {
  return event.kind === HIGHLIGHTS_KIND;
}

/**
 * Format highlight content for display
 */
export function formatHighlightContent(highlight: HighlightData): string {
  let formatted = highlight.content;
  
  if (highlight.context) {
    formatted = `"${highlight.content}"`;
  }
  
  return formatted;
}

/**
 * Get highlight metadata for display
 */
export function getHighlightMetadata(highlight: HighlightData): {
  hasContext: boolean;
  hasRange: boolean;
  hasReferences: boolean;
  referenceCount: number;
} {
  const hasContext = !!highlight.context;
  const hasRange = !!highlight.range;
  const hasReferences = !!(highlight.referencedEvent || highlight.referencedAuthor || highlight.referencedUrl);
  const referenceCount = [
    highlight.referencedEvent,
    highlight.referencedAuthor,
    highlight.referencedUrl
  ].filter(Boolean).length;

  return {
    hasContext,
    hasRange,
    hasReferences,
    referenceCount
  };
}
