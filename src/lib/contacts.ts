import { ndk } from './ndk';

const NIP07_PUBKEY_KEY = 'nip07_pubkey';

let cachedContacts: string[] | null = null;
let cachedForPubkey: string | null = null;

/**
 * Fetch the logged-in user's kind:3 contact list as hex pubkeys.
 */
export async function getContactPubkeys(): Promise<string[]> {
  const pubkey = getStoredContactOwnerPubkey();
  if (!pubkey) return [];

  if (cachedContacts && cachedForPubkey === pubkey) {
    return cachedContacts;
  }

  try {
    const user = ndk.getUser({ pubkey });
    const follows = await user.follows();
    const pubkeys = Array.from(follows)
      .map((contact) => contact.pubkey)
      .filter((value): value is string => /^[0-9a-f]{64}$/i.test(value));

    cachedContacts = Array.from(new Set(pubkeys));
    cachedForPubkey = pubkey;
    return cachedContacts;
  } catch (error) {
    console.warn('Failed to fetch contacts:', error);
    return [];
  }
}

export function clearContactsCache(): void {
  cachedContacts = null;
  cachedForPubkey = null;
}

function getStoredContactOwnerPubkey(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(NIP07_PUBKEY_KEY);
  } catch {
    return null;
  }
}
