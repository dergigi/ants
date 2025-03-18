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

  it('should find events from an author without search term', async () => {
    const events = await searchEvents('from:pablo', 50);
    expect(events.length).toBeGreaterThan(0);
  });

  it('should find events with author filter and search term', async () => {
    const events = await searchEvents('from:pablo ndk');
    expect(events.length).toBeGreaterThan(0);
    events.forEach((event: NDKEvent) => {
      expect(event.content.toLowerCase()).toContain('ndk');
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