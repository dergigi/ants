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
