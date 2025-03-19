import { TextEncoder, TextDecoder } from 'util';
import { connect, ndk } from './ndk';

interface GlobalWithNDK {
  TextEncoder: typeof TextEncoder;
  TextDecoder: typeof TextDecoder;
  ndk: typeof ndk;
}

const global = globalThis as unknown as GlobalWithNDK;

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as unknown as typeof TextDecoder;
global.ndk = ndk;

// Add proper typing for the global object
declare global {
  interface Window {
    TextEncoder: typeof TextEncoder;
    TextDecoder: typeof TextDecoder;
    ndk: typeof ndk;
  }
}

// Connect to relays before running tests
beforeAll(async () => {
  await connect();
});

// Clean up relays after tests
afterAll(() => {
  if (global.ndk?.pool?.relays) {
    const relays = Array.from(global.ndk.pool.relays.values());
    relays.forEach((relay) => {
      relay.disconnect();
    });
  }
}); 