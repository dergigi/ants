import { NDKEvent } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';

/** Kind number for spell events (NIP-A7) */
export const SPELL_KIND = 777;

/**
 * Kind shortcuts matching replacements.txt entries.
 * Only includes tokens that actually exist in the replacement engine.
 * Notably, kind:1 has no is: shortcut (is:tweet exists but is:note does not).
 */
const KIND_SHORTCUTS: Record<number, string> = {
  0: 'is:profile',
  6: 'is:repost',
  7: 'is:reaction',
  20: 'is:image',
  1063: 'is:file',
  1337: 'is:code',
  1617: 'is:patch',
  1621: 'is:issue',
  9321: 'is:nutzap',
  9735: 'is:zap',
  9802: 'is:highlight',
  30023: 'is:article',
  39089: 'is:followpack',
};

/** Check if an NDKEvent is a spell (kind:777) */
export function isSpellEvent(event: NDKEvent): boolean {
  return event.kind === SPELL_KIND;
}

/**
 * Translate a kind:777 spell event's tags into an ants query string.
 * Returns null if the spell has no translatable filter tags.
 */
export function spellToQuery(event: NDKEvent): string | null {
  if (event.kind !== SPELL_KIND) return null;

  const tags = event.tags;
  const parts: string[] = [];

  // search → raw search terms
  const searchTag = tags.find((t) => t[0] === 'search' && t[1]);
  if (searchTag) parts.push(searchTag[1]);

  // kinds → kind: or is: shortcuts
  const kindTags = tags.filter((t) => t[0] === 'k' && t[1]);
  for (const kt of kindTags) {
    const k = parseInt(kt[1], 10);
    if (isNaN(k)) continue;
    const shortcut = KIND_SHORTCUTS[k];
    parts.push(shortcut || `kind:${k}`);
  }

  // authors → by: (hex pubkeys encoded as npub)
  const authorsTag = tags.find((t) => t[0] === 'authors');
  if (authorsTag) {
    for (const val of authorsTag.slice(1).filter(Boolean)) {
      parts.push(`by:${formatAuthor(val)}`);
    }
  }

  // ids → id:
  const idsTag = tags.find((t) => t[0] === 'ids');
  if (idsTag) {
    for (const val of idsTag.slice(1).filter(Boolean)) {
      parts.push(`id:${val}`);
    }
  }

  // tag filters → mapped to ants keywords
  // Multiple values in a single tag array are OR in Nostr REQ semantics
  const tagFilters = tags.filter((t) => t[0] === 'tag' && t[1] && t.length >= 3);
  for (const tf of tagFilters) {
    const letter = tf[1];
    const values = tf.slice(2).filter(Boolean);
    if (values.length === 0) continue;
    const translated = values.map((val) => translateTagFilter(letter, val));
    if (translated.length === 1) {
      parts.push(translated[0]);
    } else {
      parts.push(`(${translated.join(' OR ')})`);
    }
  }

  // since/until → since: / until:
  const sinceTag = tags.find((t) => t[0] === 'since' && t[1]);
  if (sinceTag) parts.push(`since:${translateTimestamp(sinceTag[1])}`);

  const untilTag = tags.find((t) => t[0] === 'until' && t[1]);
  if (untilTag) parts.push(`until:${translateTimestamp(untilTag[1])}`);

  if (parts.length === 0) return null;
  return parts.join(' ');
}

/** Translate a single tag filter letter + value to an ants keyword */
function translateTagFilter(letter: string, value: string): string {
  switch (letter) {
    case 't': return `#${value}`;
    case 'p': return `mentions:${formatAuthor(value)}`;
    case 'e': return `reply:${value}`;
    case 'a': return `ref:${value}`;
    case 'r': return `link:${value}`;
    case 'd': return `d:${value}`;
    default: return `#${letter}:${value}`;
  }
}

/**
 * Format an author value for ants query.
 * $me → @me, hex pubkey → npub, anything else → passthrough.
 */
function formatAuthor(value: string): string {
  if (value === '$me') return '@me';
  if (value === '$contacts') return '@contacts';
  if (/^[0-9a-f]{64}$/i.test(value)) {
    try {
      return nip19.npubEncode(value);
    } catch {
      return value;
    }
  }
  return value;
}

/**
 * Translate a spell timestamp to ants format.
 * Relative durations (7d, 2w, etc.) pass through as ants supports them.
 * "now" passes through. Absolute unix timestamps become ISO dates.
 */
function translateTimestamp(value: string): string {
  const trimmed = value.trim();
  if (trimmed === 'now') return trimmed;
  // Relative durations: ants supports since:7d, since:2w, etc.
  if (/^\d+(mo|[smhdwy])$/.test(trimmed)) return trimmed;
  // Absolute unix timestamp → YYYY-MM-DD
  if (/^\d+$/.test(trimmed)) {
    const ts = parseInt(trimmed, 10);
    const date = new Date(ts * 1000);
    return date.toISOString().slice(0, 10);
  }
  return trimmed;
}
