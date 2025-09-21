// Strip legacy relay filters from query (relay:..., relays:mine)
export function stripRelayFilters(rawQuery: string): string {
  return rawQuery
    .replace(/(?:^|\s)relay:[^\s]+(?:\s|$)/gi, ' ')
    .replace(/(?:^|\s)relays:mine(?:\s|$)/gi, ' ')
    .trim();
}

// Extract kind filter(s) from query string: supports comma-separated numbers
export function extractKindFilter(rawQuery: string): { cleaned: string; kinds?: number[] } {
  let cleaned = rawQuery;
  const kinds: number[] = [];
  const kindRegex = /(?:^|\s)kind:([0-9,\s]+)(?=\s|$)/gi;
  cleaned = cleaned.replace(kindRegex, (_, list: string) => {
    (list || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((token) => {
        const num = parseInt(token, 10);
        if (!Number.isNaN(num)) kinds.push(num);
      });
    return ' ';
  });
  const uniqueKinds = Array.from(new Set(kinds));
  return { cleaned: cleaned.trim(), kinds: uniqueKinds.length ? uniqueKinds : undefined };
}

export function parseOrQuery(query: string): string[] {
  // Split by " OR " (case-insensitive) while preserving quoted segments
  const parts: string[] = [];
  let currentPart = '';
  let inQuotes = false;

  const stripOuterQuotes = (value: string): string => {
    const trimmed = value.trim();
    return trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2
      ? trimmed.slice(1, -1)
      : trimmed;
  };

  for (let i = 0; i < query.length; i++) {
    const char = query[i];

    if (char === '"') {
      inQuotes = !inQuotes;
      currentPart += char;
      continue;
    }

    // Detect the literal sequence " OR " when not inside quotes
    if (!inQuotes && query.substr(i, 4).toUpperCase() === ' OR ') {
      const cleaned = stripOuterQuotes(currentPart);
      if (cleaned) parts.push(cleaned);
      currentPart = '';
      i += 3; // skip the remaining characters of " OR " (loop will +1)
      continue;
    }

    currentPart += char;
  }

  const cleaned = stripOuterQuotes(currentPart);
  if (cleaned) parts.push(cleaned);
  return parts;
}

// Expand queries with parenthesized OR blocks by distributing surrounding terms.
// Example: "GM (.mp4 OR .jpg)" -> ["GM .mp4", "GM .jpg"]
export function expandParenthesizedOr(query: string): string[] {
  const normalize = (s: string) => s.replace(/\s{2,}/g, ' ').trim();
  const needsSpace = (leftLast: string | undefined, rightFirst: string | undefined): boolean => {
    if (!leftLast || !rightFirst) return false;
    if (/\s/.test(leftLast)) return false; // already spaced
    if (/\s/.test(rightFirst)) return false; // already spaced
    // If right begins with a dot or alphanumeric, and left ends with alphanumeric or ':' (e.g., by:npub)
    // insert a space to avoid unintended token merge like "GM.png".
    const leftWordy = /[A-Za-z0-9:_]$/.test(leftLast);
    const rightWordyOrDot = /^[A-Za-z0-9.]/.test(rightFirst);
    return leftWordy && rightWordyOrDot;
  };
  const smartJoin = (a: string, b: string): string => {
    if (!a) return b;
    if (!b) return a;
    const leftLast = a[a.length - 1];
    const rightFirst = b[0];
    return needsSpace(leftLast, rightFirst) ? `${a} ${b}` : `${a}${b}`;
  };
  const unique = (arr: string[]) => Array.from(new Set(arr.map(normalize)));

  const rx = /\(([^()]*?\s+OR\s+[^()]*?)\)/i; // innermost () that contains an OR
  const work = normalize(query);
  const m = work.match(rx);
  if (!m) return [work];

  const start = m.index || 0;
  const end = start + m[0].length;
  const before = work.slice(0, start);
  const inner = m[1];
  const after = work.slice(end);

  // Split inner by OR (case-insensitive), keep tokens as-is
  const alts = inner.split(/\s+OR\s+/i).map((s) => s.trim()).filter(Boolean);
  const expanded: string[] = [];
  for (const alt of alts) {
    const joined = smartJoin(before, alt);
    const next = normalize(smartJoin(joined, after));
    for (const ex of expandParenthesizedOr(next)) {
      expanded.push(ex);
    }
  }
  return unique(expanded);
}
