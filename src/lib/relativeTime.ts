import RelativeTimeFormat from 'relative-time-format';
import en from 'relative-time-format/locale/en.json';
import { isMobileViewport as detectMobileViewport } from '@/lib/utils/ssr';

// Add the English locale data
RelativeTimeFormat.addLocale(en);

// Constants for time calculations
const SECONDS_IN_MINUTE = 60;
const MINUTES_IN_HOUR = 60;
const HOURS_IN_DAY = 24;
const DAYS_IN_MONTH = 30;
const DAYS_IN_YEAR = 365;

// Cache formatters to avoid recreating them
const formatters = {
  narrow: new RelativeTimeFormat('en', { style: 'narrow' }),
  long: new RelativeTimeFormat('en', { style: 'long' })
};

/**
 * Detects if the current viewport is mobile
 * @returns boolean indicating if the viewport is mobile
 */
const MOBILE_BREAKPOINT = 768;

function isMobileViewport(): boolean {
  return detectMobileViewport(MOBILE_BREAKPOINT);
}

/**
 * Calculates time differences from a timestamp
 * @param timestamp - Unix timestamp in seconds
 * @returns Object with time differences in various units
 */
function calculateTimeDifferences(timestamp: number) {
  const now = Date.now();
  const diffMs = now - timestamp * 1000;
  const diffSeconds = Math.round(diffMs / 1000);
  const diffMinutes = Math.round(diffSeconds / SECONDS_IN_MINUTE);
  const diffHours = Math.round(diffMinutes / MINUTES_IN_HOUR);
  const diffDays = Math.round(diffHours / HOURS_IN_DAY);
  const diffMonths = Math.round(diffDays / DAYS_IN_MONTH);
  const diffYears = Math.round(diffDays / DAYS_IN_YEAR);

  return { diffSeconds, diffMinutes, diffHours, diffDays, diffMonths, diffYears };
}

/**
 * Formats a timestamp as relative time with responsive formatting
 * @param timestamp - Unix timestamp in seconds
 * @param isMobile - Whether to use narrow format (mobile) or long format (desktop)
 * @returns Formatted relative time string
 */
export function formatRelativeTime(timestamp: number, isMobile: boolean = false): string {
  const { diffSeconds, diffMinutes, diffHours, diffDays, diffMonths, diffYears } = calculateTimeDifferences(timestamp);
  const formatter = isMobile ? formatters.narrow : formatters.long;

  if (Math.abs(diffYears) >= 1) {
    return formatter.format(-diffYears, 'year');
  }
  if (Math.abs(diffMonths) >= 1) {
    return formatter.format(-diffMonths, 'month');
  }
  if (Math.abs(diffDays) >= 1) {
    return formatter.format(-diffDays, 'day');
  }
  if (Math.abs(diffHours) >= 1) {
    return formatter.format(-diffHours, 'hour');
  }
  if (Math.abs(diffMinutes) >= 1) {
    return formatter.format(-diffMinutes, 'minute');
  }
  return formatter.format(-diffSeconds, 'second');
}

/**
 * Hook to detect if the current viewport is mobile
 * @returns boolean indicating if the viewport is mobile
 */
export function useIsMobile(): boolean {
  return isMobileViewport();
}

/**
 * Formats a timestamp as relative time, automatically detecting mobile vs desktop
 * @param timestamp - Unix timestamp in seconds
 * @returns Formatted relative time string
 */
export function formatRelativeTimeAuto(timestamp: number): string {
  return formatRelativeTime(timestamp, isMobileViewport());
}
