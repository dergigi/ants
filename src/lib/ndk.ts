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

export interface ConnectionStatus {
  success: boolean;
  connectedRelays: string[];
  failedRelays: string[];
  timeout: boolean;
}

export const connect = async (timeoutMs: number = 5000): Promise<ConnectionStatus> => {
  const connectedRelays: string[] = [];
  const failedRelays: string[] = [];
  let timeout = false;

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

    // Check which relays actually connected
    const relayUrls = [...RELAYS.DEFAULT];
    for (const url of relayUrls) {
      try {
        const relay = ndk.pool?.relays?.get(url);
        if (relay && relay.status === 1) { // 1 = connected
          connectedRelays.push(url);
        } else {
          failedRelays.push(url);
        }
      } catch {
        failedRelays.push(url);
      }
    }

    // Select a random example when we connect
    currentSearchExample = searchExamples[Math.floor(Math.random() * searchExamples.length)];
    console.log('Connected to relays:', { connected: connectedRelays, failed: failedRelays, example: currentSearchExample });
    
    return {
      success: connectedRelays.length > 0,
      connectedRelays,
      failedRelays,
      timeout: false
    };
  } catch (error) {
    console.warn('NDK connection failed or timed out:', error);
    timeout = true;
    
    // Check which relays we can still access
    const relayUrls = [...RELAYS.DEFAULT];
    for (const url of relayUrls) {
      try {
        const relay = ndk.pool?.relays?.get(url);
        if (relay && relay.status === 1) {
          connectedRelays.push(url);
        } else {
          failedRelays.push(url);
        }
      } catch {
        failedRelays.push(url);
      }
    }

    // Still select an example even if connection failed
    currentSearchExample = searchExamples[Math.floor(Math.random() * searchExamples.length)];
    console.log('Using fallback example:', currentSearchExample);
    
    return {
      success: connectedRelays.length > 0,
      connectedRelays,
      failedRelays,
      timeout
    };
  }
}; 