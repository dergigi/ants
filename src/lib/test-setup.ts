import { connect, ndk } from './ndk';
import type { NDKRelay } from '@nostr-dev-kit/ndk';

declare global {
  var ndk: {
    pool: {
      relays: Map<string, NDKRelay>;
    };
  };
}

// Make ndk available globally for tests
global.ndk = ndk as any;

beforeAll(async () => {
  await connect();
}, 5000); // 5 second timeout for initial connection

afterAll(async () => {
  // Clean up connections after all tests
  const relays = Array.from(global.ndk.pool.relays.values());
  await Promise.all(relays.map((relay: NDKRelay) => relay.close('Test cleanup')));
}); 