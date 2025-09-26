import RelativeTimeFormat from 'relative-time-format';
import en from 'relative-time-format/locale/en.json';

// Add the English locale data
RelativeTimeFormat.addLocale(en);

/**
 * Formats a timestamp as relative time with responsive formatting
 * @param timestamp - Unix timestamp in seconds
 * @param isMobile - Whether to use short format (mobile) or long format (desktop)
 * @returns Formatted relative time string
 */
export function formatRelativeTime(timestamp: number, isMobile: boolean = false): string {
  const now = Date.now();
  const diffMs = now - timestamp * 1000;
  const diffSeconds = Math.round(diffMs / 1000);
  const diffMinutes = Math.round(diffSeconds / 60);
  const diffHours = Math.round(diffMinutes / 60);
  const diffDays = Math.round(diffHours / 24);
  const diffMonths = Math.round(diffDays / 30);
  const diffYears = Math.round(diffDays / 365);

  // Use short format for mobile, long format for desktop
  const style = isMobile ? 'short' : 'long';

  if (Math.abs(diffYears) >= 1) {
    return rtf.format(-diffYears, 'year', { style });
  }
  if (Math.abs(diffMonths) >= 1) {
    return rtf.format(-diffMonths, 'month', { style });
  }
  if (Math.abs(diffDays) >= 1) {
    return rtf.format(-diffDays, 'day', { style });
  }
  if (Math.abs(diffHours) >= 1) {
    return rtf.format(-diffHours, 'hour', { style });
  }
  if (Math.abs(diffMinutes) >= 1) {
    return rtf.format(-diffMinutes, 'minute', { style });
  }
  return rtf.format(-diffSeconds, 'second', { style });
}

/**
 * Hook to detect if the current viewport is mobile
 * @returns boolean indicating if the viewport is mobile
 */
export function useIsMobile(): boolean {
  if (typeof window === 'undefined') return false;
  
  // Check if window width is below mobile breakpoint (typically 768px)
  return window.innerWidth < 768;
}

/**
 * Formats a timestamp as relative time, automatically detecting mobile vs desktop
 * @param timestamp - Unix timestamp in seconds
 * @returns Formatted relative time string
 */
export function formatRelativeTimeAuto(timestamp: number): string {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  return formatRelativeTime(timestamp, isMobile);
}
