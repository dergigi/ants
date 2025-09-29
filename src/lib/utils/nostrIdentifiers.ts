import { decodeMaybe } from '@/lib/utils';
import { nip19 } from 'nostr-tools';

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
export function extractNip19Identifiers(urlLike: string): string[] {
  if (typeof urlLike !== 'string') return [];

  const trimmed = urlLike.trim();
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

// Shared regex patterns for nostr identifiers in content
export const NOSTR_IDENTIFIER_TYPES = '(?:nprofile1|npub1|nevent1|naddr1|note1)';

// Regex to match nostr tokens (with or without 'nostr:' prefix)
const NOSTR_TOKEN_REGEX_SOURCE = `(nostr:${NOSTR_IDENTIFIER_TYPES}[0-9a-z]+|${NOSTR_IDENTIFIER_TYPES}[0-9a-z]+)(?!\\w)`;
const NOSTR_TOKEN_REGEX_FLAGS = 'gi';

export const NOSTR_TOKEN_REGEX = new RegExp(NOSTR_TOKEN_REGEX_SOURCE, NOSTR_TOKEN_REGEX_FLAGS);

export function createNostrTokenRegex(): RegExp {
  return new RegExp(NOSTR_TOKEN_REGEX_SOURCE, NOSTR_TOKEN_REGEX_FLAGS);
}

// Regex to match and parse nostr tokens with optional suffix
export const NOSTR_TOKEN_PARSE_REGEX = new RegExp(
  `^(nostr:${NOSTR_IDENTIFIER_TYPES}[0-9a-z]+|${NOSTR_IDENTIFIER_TYPES}[0-9a-z]+)([),.;]*)$`,
  'i'
);

export type Nip19Prefix = typeof NIP19_PREFIXES[number];

export type Nip19Pointer =
  | { type: 'nevent'; id: string; relays?: string[]; author?: string; kind?: number }
  | { type: 'note'; id: string }
  | { type: 'naddr'; pubkey: string; identifier: string; kind: number; relays?: string[] }
  | { type: 'nprofile'; pubkey: string; relays?: string[] }
  | { type: 'npub'; pubkey: string }
  | { type: 'nsec' };

export function decodeNip19Pointer(identifier: string): Nip19Pointer | null {
  const trimmed = identifier.trim();
  if (!trimmed) return null;

  try {
    const decoded = nip19.decode(trimmed);
    switch (decoded.type) {
      case 'nevent': {
        const data = decoded.data as { id: string; relays?: string[]; author?: string; kind?: number };
        return {
          type: 'nevent',
          id: typeof data.id === 'string' ? data.id : '',
          relays: Array.isArray(data.relays) ? data.relays : undefined,
          author: typeof data.author === 'string' ? data.author : undefined,
          kind: typeof data.kind === 'number' ? data.kind : undefined
        };
      }
      case 'note':
        return { type: 'note', id: decoded.data as string };
      case 'naddr':
        return {
          type: 'naddr',
          pubkey: (decoded.data as { pubkey: string }).pubkey,
          identifier: (decoded.data as { identifier: string }).identifier,
          kind: (decoded.data as { kind: number }).kind,
          relays: (decoded.data as { relays?: string[] }).relays
        };
      case 'nprofile':
        return {
          type: 'nprofile',
          pubkey: (decoded.data as { pubkey: string }).pubkey,
          relays: (decoded.data as { relays?: string[] }).relays
        };
      case 'npub':
        return { type: 'npub', pubkey: decoded.data as string };
      case 'nsec':
        return { type: 'nsec' };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * Normalizes a raw identifier by removing nostr: prefix and handling common cases
 */
export function normalizeNostrIdentifier(rawId: string): string {
  let token = decodeMaybe(rawId).trim();
  if (!token) return '';
  if (/^nostr:/i.test(token)) token = token.replace(/^nostr:/i, '');
  return token.toLowerCase();
}

/**
 * Parses an identifier for event pages (/e/[id]) - handles nevent, note, and hex event IDs
 */
export function parseEventIdentifier(rawId: string): string {
  const token = normalizeNostrIdentifier(rawId);
  if (!token) return '';

  // If it's bech32 nevent/note, pass through unchanged
  try {
    const decoded = nip19.decode(token);
    if (decoded?.type === 'nevent' || decoded?.type === 'note') {
      return token;
    }
  } catch {}

  // If it's a 64-char hex event id, encode as nevent so search can fetch by id
  if (/^[0-9a-fA-F]{64}$/.test(token)) {
    try {
      const nevent = nip19.neventEncode({ id: token.toLowerCase() });
      return nevent;
    } catch {}
  }

  // Fallback: use whatever was passed
  return token;
}

/**
 * Parses an identifier for profile pages (/p/[id]) - handles nprofile, npub, and other identifiers
 */
export function parseProfileIdentifier(rawId: string): string {
  const token = normalizeNostrIdentifier(rawId);
  if (!token) return '';

  try {
    const decoded = nip19.decode(token);
    if (decoded?.type === 'nprofile') {
      const pk = (decoded.data as { pubkey: string }).pubkey;
      return nip19.npubEncode(pk);
    }
    if (decoded?.type === 'npub') {
      return token;
    }
  } catch {}

  return token;
}

/**
 * Checks if an identifier is a valid nevent or note
 */
export function isValidEventIdentifier(identifier: string): boolean {
  if (!identifier) return false;
  try {
    const decoded = nip19.decode(identifier);
    return decoded?.type === 'nevent' || decoded?.type === 'note';
  } catch {
    return false;
  }
}

/**
 * Checks if an identifier is a valid npub
 */
export function isValidNpub(identifier: string): boolean {
  if (!identifier) return false;
  try {
    const decoded = nip19.decode(identifier);
    return decoded?.type === 'npub' && typeof decoded.data === 'string';
  } catch {
    return false;
  }
}

