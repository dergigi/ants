import { getStoredPubkey } from './nip07';
import { ndk } from './ndk';

/** Error thrown when a spell cannot be parsed or resolved */
export class SpellError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpellError';
  }
}

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

/**
 * Resolve a relative timestamp string to an absolute Unix timestamp.
 * Accepts: "now", a relative duration like "7d", or an absolute Unix timestamp string.
 */
export function resolveTimestamp(value: string): number {
  const trimmed = value.trim();

  if (trimmed === 'now') return Math.floor(Date.now() / 1000);

  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);

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
 */
export async function resolveVariables(values: string[]): Promise<string[]> {
  const resolved: string[] = [];

  for (const val of values) {
    if (val === '$me') {
      const pubkey = getStoredPubkey();
      if (!pubkey) throw new SpellError('Cannot resolve $me: not logged in');
      resolved.push(pubkey);
    } else if (val === '$contacts') {
      const pubkey = getStoredPubkey();
      if (!pubkey) throw new SpellError('Cannot resolve $contacts: not logged in');
      const contacts = await fetchContacts(pubkey);
      if (contacts.length === 0) throw new SpellError('Cannot resolve $contacts: no contacts found');
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
    const follows = await user.follows();
    return Array.from(follows).map((u) => u.pubkey);
  } catch (error) {
    console.warn('Failed to fetch contacts for $contacts resolution:', error);
    return [];
  }
}
