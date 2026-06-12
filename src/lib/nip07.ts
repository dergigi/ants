import { NDKNip07Signer, NDKUser } from '@nostr-dev-kit/ndk';
import { ndk } from './ndk';
import { clearAllProfileCaches } from './profile/cache';
import { clearRelayCaches } from './relays';

const NIP07_PUBKEY_KEY = 'nip07_pubkey';

function emitAuthChange(): void {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nip07:auth-change'));
    }
  } catch {}
}

export async function login(): Promise<NDKUser | null> {
  if (!(window as { nostr?: unknown }).nostr) {
    throw new Error('NIP-07 extension not found');
  }

  try {
    // No need to wait for relays here; the signer only talks to the extension
    const signer = new NDKNip07Signer();
    const user = await signer.blockUntilReady();
    
    // Store the pubkey in localStorage
    localStorage.setItem(NIP07_PUBKEY_KEY, user.pubkey);
    
    // Set the signer on the NDK instance
    ndk.signer = signer;
    
    // Ensure the user has the NDK instance set
    user.ndk = ndk;

    // Clear all caches on successful login to avoid stale profile resolution
    try {
      clearRelayCaches();
      clearAllProfileCaches();
      if (typeof window !== 'undefined') {
        localStorage.removeItem('ants_nip50_support_cache');
        localStorage.removeItem('ants_nip50_cache');
        localStorage.removeItem('ants_relay_info_cache');
      }
    } catch {}
    emitAuthChange();
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
  try {
    clearRelayCaches();
    clearAllProfileCaches();
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ants_nip50_support_cache');
      localStorage.removeItem('ants_nip50_cache');
      localStorage.removeItem('ants_relay_info_cache');
    }
  } catch {}
  emitAuthChange();
}

// Extensions inject window.nostr asynchronously; poll briefly instead of
// failing when restore runs before the injection happened.
async function waitForNip07Extension(timeoutMs: number = 3000): Promise<boolean> {
  const start = Date.now();
  while (!(window as { nostr?: unknown }).nostr) {
    if (Date.now() - start >= timeoutMs) return false;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return true;
}

export async function restoreLogin(): Promise<NDKUser | null> {
  const storedPubkey = getStoredPubkey();
  if (!storedPubkey) {
    return null;
  }

  try {
    if (!(await waitForNip07Extension())) {
      console.warn('NIP-07 extension not available, cannot restore login');
      return null;
    }

    // Restore the signer; no need to wait for relay connections
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
    
    // Ensure the user has the NDK instance set
    user.ndk = ndk;
    
    return user;
  } catch (error) {
    console.error('Error restoring login:', error);
    // If restoration fails, clear the stored data
    logout();
    return null;
  }
} 