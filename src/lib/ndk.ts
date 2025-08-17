import NDK from '@nostr-dev-kit/ndk';
import NDKCacheAdapterDexie from '@nostr-dev-kit/ndk-cache-dexie';
import { searchExamples } from './examples';

const RELAYS = [
  'wss://relay.nostr.band',
  'wss://relay.vertexlab.io',
  'wss://purplepag.es'
];

const cacheAdapter = new NDKCacheAdapterDexie({ dbName: 'ants' });

export const ndk = new NDK({
  explicitRelayUrls: RELAYS,
  cacheAdapter,
  clientName: 'Ants'
});

// Store the selected example
let currentSearchExample: string;

export const getCurrentExample = () => currentSearchExample;

export const connect = async () => {
  await ndk.connect();
  // Select a random example when we connect
  currentSearchExample = searchExamples[Math.floor(Math.random() * searchExamples.length)];
  console.log('Connected to relays, selected example:', currentSearchExample);
}; 