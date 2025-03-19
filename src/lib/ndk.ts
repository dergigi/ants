import NDK from '@nostr-dev-kit/ndk';
import { searchExamples } from './examples';

const RELAYS = [
  'wss://relay.nostr.band/',
  'wss://relay.vertexlab.io/'
];

export const ndk = new NDK({
  explicitRelayUrls: RELAYS
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