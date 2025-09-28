import { decodeMaybe } from '@/lib/utils';

const NIP19_PREFIXES = [
  'npub',
  'nsec',
  'note',
  'nprofile',
  'nevent',
  'nrelay',
  'naddr'
] as const;

const BECH32_CHARSET = '023456789acdefghjklmnpqrstuvwxyz';
const CORE_NIP19_PATTERN = `(?:${NIP19_PREFIXES.join('|')})1[${BECH32_CHARSET}]+`;

/**
 * Precompile the guard-boundary regex fragment so we can build fresh regex instances on demand.
 */
const BOUNDED_NIP19_PATTERN = `(^|[^0-9a-z])(${CORE_NIP19_PATTERN})(?=$|[^0-9a-z])`;

function findNip19Matches(text: string): string[] {
  if (!text) return [];

  const regex = new RegExp(BOUNDED_NIP19_PATTERN, 'gi');
  const matches: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const candidate = match[2];
    if (candidate) {
      matches.push(candidate);
    }
  }

  return matches;
}

function addMatches(source: string, seen: Set<string>, results: string[]): void {
  if (!source) return;

  for (const candidate of findNip19Matches(source)) {
    const normalized = candidate.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    results.push(candidate);
  }
}

function tryParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * Extracts any NIP-19 identifiers embedded within an HTTP(S) URL.
 * Handles identifiers found in path segments, query parameters and fragments,
 * and gracefully de-duplicates results.
 */
export function extractNip19IdentifiersFromUrl(url: string): string[] {
  if (typeof url !== 'string') return [];

  const trimmed = url.trim();
  if (!trimmed) return [];

  const seen = new Set<string>();
  const results: string[] = [];

  const candidates = new Set<string>();
  candidates.add(trimmed);

  const decodedWhole = decodeMaybe(trimmed);
  if (decodedWhole !== trimmed) {
    candidates.add(decodedWhole);
  }

  const parsed = tryParseUrl(trimmed) ?? tryParseUrl(`https://${trimmed}`);
  if (parsed) {
    candidates.add(parsed.href);
    if (parsed.pathname) {
      candidates.add(parsed.pathname);
    }
    if (parsed.hash) {
      candidates.add(parsed.hash);
    }
    for (const value of parsed.searchParams.values()) {
      if (value) {
        candidates.add(value);
        const decoded = decodeMaybe(value);
        if (decoded !== value) {
          candidates.add(decoded);
        }
      }
    }
  }

  for (const candidate of candidates) {
    addMatches(candidate, seen, results);

    const decodedCandidate = decodeMaybe(candidate);
    if (decodedCandidate !== candidate) {
      addMatches(decodedCandidate, seen, results);
    }
  }

  return results;
}

export const NIP19_BOUNDARY_REGEX = new RegExp(BOUNDED_NIP19_PATTERN, 'gi');

export type Nip19Prefix = typeof NIP19_PREFIXES[number];

