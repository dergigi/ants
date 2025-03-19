import NDK from '@nostr-dev-kit/ndk';
import { searchExamples } from './examples';

export const ndk = new NDK({
  explicitRelayUrls: [
    'wss://relay.nostr.band/',
    'wss://relay.vertexlab.io/'
  ]
});

export async function connect() {
  if (!ndk.explicitRelayUrls) {
    throw new Error('No relay URLs configured');
  }

  await ndk.connect();

  // Select a random example for the placeholder
  const randomIndex = Math.floor(Math.random() * searchExamples.length);
  const selectedExample = searchExamples[randomIndex];
  console.log('Connected to relays, selected example:', selectedExample);

  return selectedExample;
} 