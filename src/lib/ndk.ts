import NDK from '@nostr-dev-kit/ndk';

// Initialize NDK with a basic relay
export const ndk = new NDK({
  explicitRelayUrls: ['wss://relay.nostr.band']
});

// Connect to the relay
export const connect = async () => {
  try {
    await ndk.connect();
    console.log('Connected to relay');
  } catch (error) {
    console.error('Failed to connect to relay:', error);
  }
}; 