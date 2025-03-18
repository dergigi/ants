import NDK from '@nostr-dev-kit/ndk';

// Initialize NDK with both relays
export const ndk = new NDK({
  explicitRelayUrls: [
    'wss://relay.nostr.band',  // For regular searches
    'wss://relay.vertexlab.io' // For profile lookups
  ]
});

// Connect to the relays
export const connect = async () => {
  try {
    await ndk.connect();
    console.log('Connected to relays');
  } catch (error) {
    console.error('Failed to connect to relays:', error);
  }
}; 