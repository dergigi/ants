import { ndk, connect } from './ndk';

describe('Relay Connection', () => {
  it('should connect to both relays successfully', async () => {
    // Connect to relays
    await connect();

    // Verify connections
    const relays = ndk.pool.relays;
    expect(relays.size).toBe(2);

    // Check if both relays are connected
    const relayUrls = Array.from(relays.keys());
    expect(relayUrls).toContain('wss://relay.nostr.band/');
    expect(relayUrls).toContain('wss://relay.vertexlab.io/');

    // Verify each relay is in connected state
    for (const relay of relays.values()) {
      expect(relay.status).toBe(4); // 4 means connected in NDK
    }
  }, 10000); // 10 second timeout
}); 