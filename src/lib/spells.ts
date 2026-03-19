import { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import { getStoredPubkey } from './nip07';
import { ndk } from './ndk';

/** Kind number for spell events (NIP-A7) */
export const SPELL_KIND = 777;

/** Runtime variables that can appear in author/tag values */
const VARIABLE_ME = '$me';
const VARIABLE_CONTACTS = '$contacts';

/** Relative timestamp units and their seconds multiplier */
const RELATIVE_UNITS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
  mo: 2592000,   // 30 days
  y: 31536000,   // 365 days
};

/** Parsed representation of a spell event */
export interface ParsedSpell {
  /** REQ or COUNT */
  cmd: 'REQ' | 'COUNT';
  /** Constructed NDK filter ready for subscription */
  filter: NDKFilter;
  /** Target relay URLs (from relays tag), if any */
  relays?: string[];
  /** Human-readable name (from name tag) */
  name?: string;
  /** Description from content field */
  description?: string;
  /** Whether to close subscription after EOSE */
  closeOnEose: boolean;
  /** The original event */
  event: NDKEvent;
}

/** Error thrown when a spell cannot be parsed or resolved */
export class SpellError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpellError';
  }
}

/**
 * Check if an NDKEvent is a spell (kind:777)
 */
export function isSpellEvent(event: NDKEvent): boolean {
  return event.kind === SPELL_KIND;
}

/**
 * Resolve a relative timestamp string to an absolute Unix timestamp.
 * Accepts: "now", a relative duration like "7d", or an absolute Unix timestamp string.
 */
export function resolveTimestamp(value: string): number {
  const trimmed = value.trim();

  if (trimmed === 'now') {
    return Math.floor(Date.now() / 1000);
  }

  // Try absolute timestamp first (all digits)
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }

  // Try relative: <number><unit>
  // Must match units longest-first (mo before m)
  const relMatch = trimmed.match(/^(\d+)(mo|[smhdwy])$/);
  if (relMatch) {
    const amount = parseInt(relMatch[1], 10);
    const unit = relMatch[2];
    const seconds = RELATIVE_UNITS[unit];
    if (seconds !== undefined) {
      return Math.floor(Date.now() / 1000) - amount * seconds;
    }
  }

  throw new SpellError(`Invalid timestamp value: "${value}"`);
}

/**
 * Resolve runtime variables ($me, $contacts) in a list of values.
 * Returns the expanded array of pubkeys.
 */
async function resolveVariables(values: string[]): Promise<string[]> {
  const resolved: string[] = [];

  for (const val of values) {
    if (val === VARIABLE_ME) {
      const pubkey = getStoredPubkey();
      if (!pubkey) {
        throw new SpellError('Cannot resolve $me: not logged in');
      }
      resolved.push(pubkey);
    } else if (val === VARIABLE_CONTACTS) {
      const pubkey = getStoredPubkey();
      if (!pubkey) {
        throw new SpellError('Cannot resolve $contacts: not logged in');
      }
      const contacts = await fetchContacts(pubkey);
      if (contacts.length === 0) {
        throw new SpellError('Cannot resolve $contacts: no contacts found');
      }
      resolved.push(...contacts);
    } else {
      resolved.push(val);
    }
  }

  return resolved;
}

/**
 * Fetch kind:3 contact list for a pubkey and extract followed pubkeys.
 */
async function fetchContacts(pubkey: string): Promise<string[]> {
  try {
    const user = ndk.getUser({ pubkey });
    await user.fetchProfile();
    // NDK's follows() fetches the kind:3 event
    const follows = await user.follows();
    return Array.from(follows).map((u) => u.pubkey);
  } catch (error) {
    console.warn('Failed to fetch contacts for $contacts resolution:', error);
    return [];
  }
}

/**
 * Parse a kind:777 spell event into a structured ParsedSpell.
 * Resolves runtime variables and relative timestamps.
 */
export async function parseSpell(event: NDKEvent): Promise<ParsedSpell> {
  if (event.kind !== SPELL_KIND) {
    throw new SpellError(`Expected kind ${SPELL_KIND}, got ${event.kind}`);
  }

  const tags = event.tags;

  // Extract cmd tag (required)
  const cmdTag = tags.find((t) => t[0] === 'cmd');
  if (!cmdTag || !cmdTag[1]) {
    throw new SpellError('Spell is missing required "cmd" tag');
  }
  const cmd = cmdTag[1].toUpperCase();
  if (cmd !== 'REQ' && cmd !== 'COUNT') {
    throw new SpellError(`Invalid cmd value: "${cmdTag[1]}". Must be REQ or COUNT`);
  }

  // Build the filter from tags
  const filter: NDKFilter = {};

  // kinds (k tags)
  const kindTags = tags.filter((t) => t[0] === 'k' && t[1]);
  if (kindTags.length > 0) {
    filter.kinds = kindTags.map((t) => parseInt(t[1], 10)).filter((n) => !isNaN(n));
  }

  // authors (single tag, multiple values — may contain $me, $contacts)
  const authorsTag = tags.find((t) => t[0] === 'authors');
  if (authorsTag) {
    const rawAuthors = authorsTag.slice(1).filter(Boolean);
    filter.authors = await resolveVariables(rawAuthors);
  }

  // ids (single tag, multiple values)
  const idsTag = tags.find((t) => t[0] === 'ids');
  if (idsTag) {
    filter.ids = idsTag.slice(1).filter(Boolean);
  }

  // tag filters: ["tag", <letter>, <val1>, ...]
  const tagFilters = tags.filter((t) => t[0] === 'tag' && t[1] && t.length >= 3);
  for (const tagFilter of tagFilters) {
    const letter = tagFilter[1];
    const values = tagFilter.slice(2).filter(Boolean);
    const resolvedValues = await resolveVariables(values);
    const filterKey = `#${letter}` as keyof NDKFilter;
    (filter as Record<string, string[]>)[filterKey] = resolvedValues;
  }

  // search (NIP-50)
  const searchTag = tags.find((t) => t[0] === 'search' && t[1]);
  if (searchTag) {
    filter.search = searchTag[1];
  }

  // limit
  const limitTag = tags.find((t) => t[0] === 'limit' && t[1]);
  if (limitTag) {
    const n = parseInt(limitTag[1], 10);
    if (!isNaN(n) && n > 0) {
      filter.limit = n;
    }
  }

  // since (timestamp or relative)
  const sinceTag = tags.find((t) => t[0] === 'since' && t[1]);
  if (sinceTag) {
    filter.since = resolveTimestamp(sinceTag[1]);
  }

  // until (timestamp or relative)
  const untilTag = tags.find((t) => t[0] === 'until' && t[1]);
  if (untilTag) {
    filter.until = resolveTimestamp(untilTag[1]);
  }

  // relays tag
  const relaysTag = tags.find((t) => t[0] === 'relays');
  const relays = relaysTag ? relaysTag.slice(1).filter(Boolean) : undefined;

  // Metadata
  const nameTag = tags.find((t) => t[0] === 'name' && t[1]);
  const closeOnEose = tags.some((t) => t[0] === 'close-on-eose');

  // Validate: must have at least one filter field
  const hasFilter = filter.kinds || filter.authors || filter.ids || filter.search ||
    filter.since || filter.until || filter.limit ||
    Object.keys(filter).some((k) => k.startsWith('#'));
  if (!hasFilter) {
    throw new SpellError('Spell has no filter tags');
  }

  return {
    cmd: cmd as 'REQ' | 'COUNT',
    filter,
    relays,
    name: nameTag?.[1],
    description: event.content || undefined,
    closeOnEose,
    event,
  };
}
