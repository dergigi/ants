/**
 * Query translation layer for relative date syntax.
 * Converts tokens like "since:2w" or "until:3d" to absolute YYYY-MM-DD format
 * before the existing date parser processes them.
 */

/**
 * Resolve relative date tokens in a query string to YYYY-MM-DD format.
 * Returns the rewritten query and a human-readable translation if any were resolved.
 *
 * Examples:
 *   "bitcoin since:2w"  → "bitcoin since:2026-03-06"
 *   "until:3d"          → "until:2026-03-17"
 *   "since:1m until:1w" → "since:2026-02-20 until:2026-03-13"
 */
export function resolveRelativeDates(rawQuery: string): { resolved: string; translation: string | null } {
  const relativeRegex = /(?:^|\s)(since|until):(\d+[dwmy])(?=\s|$)/gi;
  let resolved = rawQuery;
  const translations: string[] = [];

  resolved = resolved.replace(relativeRegex, (match, keyword: string, relative: string) => {
    const date = relativeToAbsoluteDate(relative);
    if (!date) return match;
    translations.push(`${keyword}:${relative} → ${keyword}:${date}`);
    return match.replace(`${keyword}:${relative}`, `${keyword}:${date}`);
  });

  return {
    resolved,
    translation: translations.length > 0 ? translations.join(', ') : null,
  };
}

function relativeToAbsoluteDate(input: string): string | null {
  const match = input.match(/^(\d+)([dwmy])$/i);
  if (!match) return null;

  const amount = parseInt(match[1], 10);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 3650) return null;
  const unit = match[2].toLowerCase();
  const now = new Date();

  switch (unit) {
    case 'd':
      now.setUTCDate(now.getUTCDate() - amount);
      break;
    case 'w':
      now.setUTCDate(now.getUTCDate() - amount * 7);
      break;
    case 'm':
      now.setUTCMonth(now.getUTCMonth() - amount);
      break;
    case 'y':
      now.setUTCFullYear(now.getUTCFullYear() - amount);
      break;
    default:
      return null;
  }

  return now.toISOString().split('T')[0];
}
