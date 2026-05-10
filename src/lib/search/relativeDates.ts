/**
 * Helpers for resolving relative date filters like `since:2w` or `until:12h`.
 */

const ABSOLUTE_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const RELATIVE_DATE_REGEX = /^(\d+)([hdwmy])$/i;
const HOUR_MS = 60 * 60 * 1000;
const DAY_END_SECONDS = 86399;

interface ParsedDateValue {
  timestamp: number;
  displayValue: string;
}

function formatUtcDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatUtcDateTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function getStartOfUtcDayTimestamp(dateStr: string): number {
  return Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / 1000);
}

function getEndOfUtcDayTimestamp(dateStr: string): number {
  return getStartOfUtcDayTimestamp(dateStr) + DAY_END_SECONDS;
}

export function parseDateValue(value: string, keyword: 'since' | 'until', now = new Date()): ParsedDateValue | null {
  const trimmed = (value || '').trim();
  if (!trimmed) return null;

  if (ABSOLUTE_DATE_REGEX.test(trimmed)) {
    const timestamp = keyword === 'until' ? getEndOfUtcDayTimestamp(trimmed) : getStartOfUtcDayTimestamp(trimmed);
    if (!Number.isFinite(timestamp)) return null;

    return {
      timestamp,
      displayValue: trimmed,
    };
  }

  const relativeMatch = trimmed.match(RELATIVE_DATE_REGEX);
  if (!relativeMatch) return null;

  const amount = parseInt(relativeMatch[1], 10);
  const unit = relativeMatch[2].toLowerCase();
  const resolvedDate = new Date(now);

  switch (unit) {
    case 'h': {
      resolvedDate.setTime(resolvedDate.getTime() - amount * HOUR_MS);
      return {
        timestamp: Math.floor(resolvedDate.getTime() / 1000),
        displayValue: formatUtcDateTime(resolvedDate),
      };
    }
    case 'd':
      resolvedDate.setUTCDate(resolvedDate.getUTCDate() - amount);
      break;
    case 'w':
      resolvedDate.setUTCDate(resolvedDate.getUTCDate() - amount * 7);
      break;
    case 'm':
      // `setUTCMonth` can overflow when the current day does not exist in the target month.
      // Example: Jan 31 minus 1 month lands in early March instead of the last day of February.
      resolvedDate.setUTCMonth(resolvedDate.getUTCMonth() - amount);
      break;
    case 'y':
      // `setUTCFullYear` follows the same overflow behavior for leap days and short months.
      resolvedDate.setUTCFullYear(resolvedDate.getUTCFullYear() - amount);
      break;
    default:
      return null;
  }

  const displayValue = formatUtcDate(resolvedDate);

  return {
    timestamp: keyword === 'until' ? getEndOfUtcDayTimestamp(displayValue) : getStartOfUtcDayTimestamp(displayValue),
    displayValue,
  };
}

export function resolveRelativeDates(rawQuery: string, now = new Date()): { resolved: string; translation: string | null } {
  const relativeRegex = /(?:^|\s)(since|until):(\d+[hdwmy])(?=\s|$)/gi;
  const translations: string[] = [];

  const resolved = rawQuery.replace(relativeRegex, (match, keyword: 'since' | 'until', value: string) => {
    const parsed = parseDateValue(value, keyword, now);
    if (!parsed) return match;

    const replacement = `${keyword}:${parsed.displayValue}`;
    translations.push(`${keyword}:${value} → ${replacement}`);
    return match.replace(`${keyword}:${value}`, replacement);
  });

  return {
    resolved,
    translation: translations.length ? translations.join(', ') : null,
  };
}
