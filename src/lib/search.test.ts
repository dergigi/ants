import { ndk, connect } from './ndk';
import { searchEvents } from './search';
import { beforeAll, afterAll } from '@jest/globals';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { lookupVertexProfile } from './vertex';

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
    // First get Pablo's pubkey
    const pabloProfile = await lookupVertexProfile('p:pablo');
    expect(pabloProfile).toBeTruthy();
    const pabloPubkey = pabloProfile!.pubkey;

    // Search for events
    const events = await searchEvents('from:pablo ndk');
    expect(events.length).toBeGreaterThan(0);
    
    // Verify each event
    events.forEach((event: NDKEvent) => {
      // Check that the event contains 'ndk' in its content
      expect(event.content.toLowerCase()).toContain('ndk');
      // Check that the event was authored by Pablo
      expect(event.pubkey).toBe(pabloPubkey);
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

describe('Search Examples', () => {
  it('should find events with "vibe coding"', async () => {
    const events = await searchEvents('vibe coding');
    expect(events.length).toBeGreaterThan(0);
    events.forEach((event: NDKEvent) => {
      const content = event.content.toLowerCase();
      expect(content.includes('vibe') || content.includes('coding')).toBe(true);
    });
  });

  it('should find events with #SovEng hashtag', async () => {
    const events = await searchEvents('#SovEng');
    expect(events.length).toBeGreaterThan(0);
    events.forEach((event: NDKEvent) => {
      const content = event.content.toLowerCase();
      expect(content.includes('soveng') || content.includes('#soveng')).toBe(true);
    });
  });

  it('should find NDK-related events from pablo', async () => {
    const events = await searchEvents('ndk from:pablo');
    expect(events.length).toBeGreaterThan(0);
    events.forEach((event: NDKEvent) => {
      expect(event.content.toLowerCase()).toContain('ndk');
    });
  });

  it('should find events from gigi with 👀', async () => {
    const events = await searchEvents('👀 by:gigi');
    expect(events.length).toBeGreaterThan(0);
    events.forEach((event: NDKEvent) => {
      expect(event.content).toContain('👀');
    });
  });

  it('should find fiatjaf profile', async () => {
    const events = await searchEvents('p:fiatjaf');
    expect(events.length).toBeGreaterThan(0);
    // Profile events are kind 0
    events.forEach((event: NDKEvent) => {
      expect(event.kind).toBe(0);
    });
  });

  it('should find events with #PenisButter hashtag', async () => {
    const events = await searchEvents('#PenisButter');
    expect(events.length).toBeGreaterThan(0);
    events.forEach((event: NDKEvent) => {
      const content = event.content.toLowerCase();
      expect(content.includes('penisbutter') || content.includes('#penisbutter')).toBe(true);
    });
  });

  it('should find GM events from dergigi', async () => {
    const events = await searchEvents('GM from:dergigi');
    expect(events.length).toBeGreaterThan(0);
    events.forEach((event: NDKEvent) => {
      const content = event.content.toLowerCase();
      expect(content.includes('gm')).toBe(true);
    });
  });
});

describe('Author Filter Aliases', () => {
  it('should work with all author filter aliases', async () => {
    const aliases = ['by:', 'from:', 'author:'];
    for (const alias of aliases) {
      const events = await searchEvents(`${alias}pablo ndk`);
      expect(events.length).toBeGreaterThan(0);
      events.forEach((event: NDKEvent) => {
        expect(event.content.toLowerCase()).toContain('ndk');
      });
    }
  });
}); 