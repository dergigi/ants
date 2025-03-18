import NDK from '@nostr-dev-kit/ndk';

// Initialize NDK with basic relays
export const ndk = new NDK({
  explicitRelayUrls: [
    'wss://relay.nostr.band',
    'wss://relay.vertexlab.io'  // Vertex relay for profile lookups
  ]
});

// Connect to the relay
export const connect = async () => {
  try {
    await ndk.connect();
    console.log('Connected to relays');
  } catch (error) {
    console.error('Failed to connect to relays:', error);
  }
}; 