import NDK from '@nostr-dev-kit/ndk';
import NDKCacheAdapterDexie from '@nostr-dev-kit/ndk-cache-dexie';
import { searchExamples } from './examples';
import { RELAYS } from './relays';

const cacheAdapter = new NDKCacheAdapterDexie({ dbName: 'ants' });

export const ndk = new NDK({
  explicitRelayUrls: [...RELAYS.DEFAULT],
  cacheAdapter,
  clientName: 'Ants'
});

// Store the selected example
let currentSearchExample: string;

export const getCurrentExample = () => currentSearchExample;

export const nextExample = (): string => {
  currentSearchExample = searchExamples[Math.floor(Math.random() * searchExamples.length)];
  return currentSearchExample;
};

export const connect = async (timeoutMs: number = 5000): Promise<boolean> => {
  try {
    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout')), timeoutMs);
    });

    // Race between connection and timeout
    await Promise.race([
      ndk.connect(),
      timeoutPromise
    ]);

    // Select a random example when we connect
    currentSearchExample = searchExamples[Math.floor(Math.random() * searchExamples.length)];
    console.log('Connected to relays, selected example:', currentSearchExample);
    return true;
  } catch (error) {
    console.warn('NDK connection failed or timed out:', error);
    // Still select an example even if connection failed
    currentSearchExample = searchExamples[Math.floor(Math.random() * searchExamples.length)];
    console.log('Using fallback example:', currentSearchExample);
    return false;
  }
}; 