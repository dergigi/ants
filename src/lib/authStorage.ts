export const NIP07_PUBKEY_KEY = 'nip07_pubkey';

export function getStoredPubkey(): string | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return null;
  }

  return localStorage.getItem(NIP07_PUBKEY_KEY);
}
