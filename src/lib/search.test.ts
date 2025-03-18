import { ndk, connect } from './ndk';
import { searchEvents } from './search';
import { beforeAll, afterAll } from '@jest/globals';
import { NDKEvent } from '@nostr-dev-kit/ndk';

beforeAll(async () => {
  await connect();
});

describe('Search Events', () => {
  it('should find events with regular search', async () => {
    const events = await searchEvents('hello world');
    expect(events.length).toBeGreaterThan(0);
  });

  it('should find events with author filter and search term', async () => {
    const events = await searchEvents('from:pablo ndk', 50);
    
    // Ensure we got some results
    expect(events.length).toBeGreaterThan(0);
    
    // Check if specific known note is in results
    const knownNoteId = 'note1qzyavjt8cyr5ztna33p060dk5gfxypvcx7lfskze56su8mm73myqpjqlqr';
    const foundNote = events.find((event: NDKEvent) => event.id === knownNoteId);
    expect(foundNote).toBeDefined();
    
    // Verify all events are from pablo
    const pabloNpub = 'npub1l2vyh47mk2p0qlsku7hg0vn29faehy9hy34ygaclpn66ukqp3afqutajft';
    events.forEach((event: NDKEvent) => {
      expect(event.pubkey).toBe(pabloNpub);
    });
  });
});

describe('Regular Search', () => {
  it('should find at least 3 results for "vibe coding"', async () => {
    const events = await ndk.fetchEvents({
      kinds: [1],
      search: 'vibe coding',
      limit: 10
    });

    expect(events.size).toBeGreaterThanOrEqual(3);
    
    // Verify each event is a text note
    Array.from(events).forEach(event => {
      expect(event.kind).toBe(1);
      expect(event.content).toBeTruthy();
    });
  }, 30000); // 30 second timeout
}); 