// Utilities to keep profile-page query handling DRY

import { parseQuery } from './query/parse';
import { isAuthor, withAuthor } from './query/scope';

export function getCurrentProfileNpub(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const m = pathname.match(/^\/p\/(npub1[0-9a-z]+)/i);
  return m ? m[1] : null;
}

// Preserve explicit branch constraints in shared URLs. Only the complete
// profile-only query can be omitted safely; restoring an empty query adds it back.
export function toImplicitUrlQuery(explicitQuery: string, currentNpub: string | null): string {
  const query = explicitQuery.trim();
  if (query && currentNpub) {
    try {
      const tree = parseQuery(query);
      if (isAuthor(tree) && tree.value.toLowerCase() === currentNpub.toLowerCase()) return '';
    } catch { /* Preserve invalid editor text for the parser's diagnostic. */ }
  }
  return query;
}

export function toExplicitInputFromUrl(urlQuery: string, currentNpub: string | null, displayIdentifier?: string | null): string {
  return currentNpub ? withAuthor(urlQuery, displayIdentifier || currentNpub, true) : urlQuery.trim();
}

export function ensureAuthorForBackend(query: string, currentNpub: string | null): string {
  return currentNpub ? withAuthor(query, currentNpub, true) : query.trim();
}

// Decode a URL query parameter safely, also mapping '+' back to spaces
export function decodeUrlQuery(input: string): string {
  const raw = (input || '').toString();
  if (!raw) return '';
  // URLSearchParams encodes spaces as '+', manual encodes use '%20'
  const plusAsSpace = raw.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(plusAsSpace);
  } catch {
    return plusAsSpace;
  }
}

/**
 * Split query by " OR " (case-insensitive) while preserving quoted segments
 */
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

/**
 * Expand queries with parenthesized OR blocks by distributing surrounding terms.
 * Example: "GM (.mp4 OR .jpg)" -> ["GM .mp4", "GM .jpg"]
 */
export function expandParenthesizedOr(query: string): string[] {
  const normalize = (s: string) => s.replace(/\s{2,}/g, ' ').trim();
  const needsSpace = (leftLast: string | undefined, rightFirst: string | undefined): boolean => {
    if (!leftLast || !rightFirst) return false;
    if (/\s/.test(leftLast)) return false; // already spaced
    if (/\s/.test(rightFirst)) return false; // already spaced
    // Do not insert a space after a scope token like 'p:' or 'by:'
    if (leftLast === ':') return false;
    // If right begins with a dot or alphanumeric, and left ends with alphanumeric,
    // insert a space to avoid unintended token merge like "GM.png".
    const leftWordy = /[A-Za-z0-9_]$/.test(leftLast);
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

