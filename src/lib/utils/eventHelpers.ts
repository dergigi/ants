import { formatRelativeTimeAuto } from '@/lib/relativeTime';

/**
 * Formats an event's created_at timestamp with fallback
 * @param event - Event object with created_at property
 * @returns Formatted relative time or 'Unknown date'
 */
export function formatEventTimestamp(event: { created_at?: number }): string {
  return event.created_at ? formatRelativeTimeAuto(event.created_at) : 'Unknown date';
}

/**
 * Formats a timestamp with fallback
 * @param timestamp - Unix timestamp in seconds
 * @param fallback - Fallback text if timestamp is invalid
 * @returns Formatted relative time or fallback
 */
export function formatTimestamp(timestamp: number | undefined, fallback: string = 'Unknown date'): string {
  return timestamp ? formatRelativeTimeAuto(timestamp) : fallback;
}

/**
 * Determine the event id this event replies to, preferring NIP-10 markers.
 * Falls back to the last unique e-tag when no reply/root marker is present.
 */
export function getReplyToEventId(event: { tags?: string[][] }): string | null {
  try {
    const eTags = (event.tags || []).filter((t) => t && t[0] === 'e');
    if (eTags.length === 0) return null;

    // Deduplicate e tags by event ID to prevent duplicate quoted events
    const uniqueETags = new Map<string, typeof eTags[0]>();
    eTags.forEach((tag) => {
      const eventId = tag[1];
      if (eventId && !uniqueETags.has(eventId)) {
        uniqueETags.set(eventId, tag);
      }
    });
    const deduplicatedETags = Array.from(uniqueETags.values());

    const replyTag = deduplicatedETags.find((t) => t[3] === 'reply') || deduplicatedETags.find((t) => t[3] === 'root') || deduplicatedETags[deduplicatedETags.length - 1];
    return replyTag && replyTag[1] ? replyTag[1] : null;
  } catch {
    return null;
  }
}
