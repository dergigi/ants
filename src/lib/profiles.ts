import { NDKEvent } from '@nostr-dev-kit/ndk';

const PROFILE_CACHE_KEY = 'nostr_profiles';

interface ProfileCache {
  [npub: string]: {
    event: NDKEvent;
    timestamp: number;
  };
}

export function storeProfile(event: NDKEvent): void {
  try {
    const npub = event.author.npub;
    if (!npub) return;

    const cache: ProfileCache = JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY) || '{}');
    cache[npub] = {
      event,
      timestamp: Date.now()
    };
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error('Error storing profile:', error);
  }
}

export function getProfile(npub: string): NDKEvent | null {
  try {
    const cache: ProfileCache = JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY) || '{}');
    const cached = cache[npub];
    
    if (!cached) return null;
    
    // Check if cache is older than 24 hours
    if (Date.now() - cached.timestamp > 24 * 60 * 60 * 1000) {
      delete cache[npub];
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(cache));
      return null;
    }
    
    return cached.event;
  } catch (error) {
    console.error('Error retrieving profile:', error);
    return null;
  }
} 