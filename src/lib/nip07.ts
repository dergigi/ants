import { NostrEvent } from 'nostr-tools';
import { NDKNip07Signer, NDKUser } from '@nostr-dev-kit/ndk';
import { ndk } from './ndk';

type Nip07RelayMap = { [url: string]: { read: boolean; write: boolean } };

interface Nip04 {
  encrypt(pubkey: string, plaintext: string): Promise<string>;
  decrypt(pubkey: string, ciphertext: string): Promise<string>;
}

interface Nip44 {
  encrypt(pubkey: string, plaintext: string): Promise<string>;
  decrypt(pubkey: string, ciphertext: string): Promise<string>;
}

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: NostrEvent): Promise<{ sig: string }>;
      getRelays?(): Promise<Nip07RelayMap>;
      nip04?: Nip04;
      nip44?: Nip44;
    };
  }
}

const NIP07_PUBKEY_KEY = 'nip07_pubkey';

export async function login(): Promise<NDKUser | null> {
  if (!window.nostr) {
    throw new Error('NIP-07 extension not found');
  }

  try {
    const signer = new NDKNip07Signer();
    const user = await signer.blockUntilReady();
    
    // Store the pubkey in localStorage
    localStorage.setItem(NIP07_PUBKEY_KEY, user.pubkey);
    
    // Set the signer on the NDK instance
    ndk.signer = signer;
    
    // Set the NDK instance on the user object
    user.ndk = ndk;
    
    return user;
  } catch (error) {
    console.error('Error getting public key:', error);
    throw error;
  }
}

export function isLoggedIn(): boolean {
  return !!localStorage.getItem(NIP07_PUBKEY_KEY);
}

export function getStoredPubkey(): string | null {
  return localStorage.getItem(NIP07_PUBKEY_KEY);
}

export function logout(): void {
  localStorage.removeItem(NIP07_PUBKEY_KEY);
  ndk.signer = undefined;
}

export async function restoreLogin(): Promise<NDKUser | null> {
  const storedPubkey = getStoredPubkey();
  if (!storedPubkey) {
    return null;
  }

  try {
    // Check if NIP-07 extension is available
    if (!window.nostr) {
      console.warn('NIP-07 extension not available, cannot restore login');
      return null;
    }

    // Create a new signer and restore the connection
    const signer = new NDKNip07Signer();
    const user = await signer.blockUntilReady();
    
    // Verify the pubkey matches what we stored
    if (user.pubkey !== storedPubkey) {
      console.warn('Stored pubkey does not match current user, logging out');
      logout();
      return null;
    }
    
    // Set the signer on the NDK instance
    ndk.signer = signer;
    
    // Set the NDK instance on the user object
    user.ndk = ndk;
    
    return user;
  } catch (error) {
    console.error('Error restoring login:', error);
    // If restoration fails, clear the stored data
    logout();
    return null;
  }
} 