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
