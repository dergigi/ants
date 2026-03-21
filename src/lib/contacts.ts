import { ndk } from './ndk';
import { getStoredPubkey } from './nip07';

let cachedContacts: string[] | null = null;
let cachedForPubkey: string | null = null;

/**
 * Fetch the logged-in user's contact list (kind:3 follow list).
 * Returns an array of hex pubkeys. Caches per session/pubkey.
 */
export async function getContactPubkeys(): Promise<string[]> {
  const pubkey = getStoredPubkey();
  if (!pubkey) return [];

  if (cachedContacts && cachedForPubkey === pubkey) {
    return cachedContacts;
  }

  try {
    const user = ndk.getUser({ pubkey });
    const follows = await user.follows();
    const pubkeys = Array.from(follows).map((u) => u.pubkey);
    cachedContacts = pubkeys;
    cachedForPubkey = pubkey;
    return pubkeys;
  } catch (error) {
    console.warn('Failed to fetch contacts:', error);
    return [];
  }
}

/** Clear the contacts cache (e.g. on logout). */
export function clearContactsCache(): void {
  cachedContacts = null;
  cachedForPubkey = null;
}
