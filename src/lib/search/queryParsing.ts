// Query parsing utilities

/**
 * Parse relative date syntax (e.g., "2w", "3d", "1m", "1y") to unix timestamp
 * Returns timestamp in seconds (for Nostr filters)
 */
function parseRelativeDate(input: string): number | null {
  const match = input.match(/^(\d+)([dwmy])$/i);
  if (!match) return null;

  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  const now = Math.floor(Date.now() / 1000); // Current time in seconds
  const secondsPerDay = 86400;

  switch (unit) {
    case 'd': // days
      return now - (amount * secondsPerDay);
    case 'w': // weeks
      return now - (amount * 7 * secondsPerDay);
    case 'm': // months (approximate: 30 days)
      return now - (amount * 30 * secondsPerDay);
    case 'y': // years (approximate: 365 days)
      return now - (amount * 365 * secondsPerDay);
    default:
      return null;
  }
}

/**
 * Parse absolute date in YYYY-MM-DD format to unix timestamp
 * Returns timestamp in seconds (for Nostr filters)
 */
function parseAbsoluteDate(input: string): number | null {
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  
  if (isNaN(date.getTime())) return null;
  
  return Math.floor(date.getTime() / 1000);
}

/**
 * Parse date filter value (supports both relative and absolute formats)
 * Examples: "2w", "3d", "1m", "1y", "2026-03-20"
 * Returns unix timestamp in seconds, or null if invalid
 */
function parseDateValue(value: string): number | null {
  const trimmed = value.trim();
  
  // Try relative format first (2w, 3d, 1m, 1y)
  const relative = parseRelativeDate(trimmed);
  if (relative !== null) return relative;
  
  // Try absolute format (YYYY-MM-DD)
  const absolute = parseAbsoluteDate(trimmed);
  if (absolute !== null) return absolute;
  
  return null;
}

export interface DateFilters {
  since?: number;
  until?: number;
}

/**
 * Extract date filters from query string
 * Supports: since:<date> and until:<date>
 * Date formats: YYYY-MM-DD or relative (2w, 3d, 1m, 1y)
 * Returns { since, until } timestamps and cleaned query
 */
export function extractDateFilters(query: string): { cleaned: string; filters: DateFilters } {
  let cleaned = query;
  const filters: DateFilters = {};

  // Extract since:<date>
  const sinceRegex = /(?:^|\s)since:(\S+)(?:\s|$)/gi;
  cleaned = cleaned.replace(sinceRegex, (match, value: string) => {
    const timestamp = parseDateValue(value);
    if (timestamp !== null) {
      filters.since = timestamp;
      return ' '; // Replace with space to preserve word boundaries
    }
    return match; // Keep invalid syntax as-is
  });

  // Extract until:<date>
  const untilRegex = /(?:^|\s)until:(\S+)(?:\s|$)/gi;
  cleaned = cleaned.replace(untilRegex, (match, value: string) => {
    const timestamp = parseDateValue(value);
    if (timestamp !== null) {
      filters.until = timestamp;
      return ' ';
    }
    return match;
  });

  // Clean up multiple spaces
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

  return { cleaned, filters };
}
