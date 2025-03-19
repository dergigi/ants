import { ndk, connect } from './ndk';
import { searchEvents } from './search';
import { beforeAll, afterAll } from '@jest/globals';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { lookupVertexProfile } from './vertex';
import { searchExamples } from './examples';

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
    // First get Pablo's profile
    const pabloProfile = await lookupVertexProfile('p:pablo');
    expect(pabloProfile).toBeTruthy();
    const pabloNpub = pabloProfile!.author.npub;

    // Search for events
    const events = await searchEvents('from:pablo ndk');
    expect(events.length).toBeGreaterThan(0);
    
    // Verify each event
    events.forEach((event: NDKEvent) => {
      // Check that the event contains 'ndk' in its content
      expect(event.content.toLowerCase()).toContain('ndk');
      // Check that the event was authored by Pablo
      expect(event.author.npub).toBe(pabloNpub);
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
  it('should find fiatjaf profile', async () => {
    const events = await searchEvents('p:fiatjaf');
    expect(events.length).toBe(1);
    expect(events[0].kind).toBe(0);
  });

  it('should find events containing "vibe coding"', async () => {
    const events = await searchEvents('vibe coding');
    expect(events.length).toBeGreaterThan(0);
    events.forEach(event => {
      expect(event.content.toLowerCase()).toContain('vibe coding');
    });
  });

  it('should find events with #PenisButter hashtag', async () => {
    const events = await searchEvents('#PenisButter');
    expect(events.length).toBeGreaterThan(0);
    events.forEach(event => {
      expect(event.content.toLowerCase()).toContain('#penisbutter');
    });
  });

  it('should find NDK events from Pablo', async () => {
    const events = await searchEvents('from:pablo ndk');
    expect(events.length).toBeGreaterThan(0);
    events.forEach(event => {
      expect(event.content.toLowerCase()).toContain('ndk');
    });
  });

  it('should find events with #YESTR hashtag', async () => {
    const events = await searchEvents('#YESTR');
    expect(events.length).toBeGreaterThan(0);
    events.forEach(event => {
      expect(event.content.toLowerCase()).toContain('#yestr');
    });
  });

  it('should find #YESTR events from gigi', async () => {
    const events = await searchEvents('#YESTR by:gigi');
    expect(events.length).toBeGreaterThan(0);
    events.forEach(event => {
      expect(event.content.toLowerCase()).toContain('#yestr');
    });
  });

  it('should find events with #SovEng hashtag', async () => {
    const events = await searchEvents('#SovEng');
    expect(events.length).toBeGreaterThan(0);
    events.forEach(event => {
      expect(event.content.toLowerCase()).toContain('#soveng');
    });
  });

  it('should find 👀 events from gigi', async () => {
    const events = await searchEvents('👀 by:gigi');
    expect(events.length).toBeGreaterThan(0);
    events.forEach(event => {
      expect(event.content).toContain('👀');
    });
  });

  it('should find GM events from dergigi', async () => {
    const events = await searchEvents('GM from:dergigi');
    expect(events.length).toBeGreaterThan(0);
    events.forEach(event => {
      expect(event.content).toContain('GM');
      expect(event.author.npub).toBe('npub1dergggklka99wwrs92xn8ldenl8fl6z57y2y3lxjcupsa46l8t5qscxusaj');
    });
  });

  it('should find .jpg events from corndalorian', async () => {
    const events = await searchEvents('.jpg by:corndalorian');
    expect(events.length).toBeGreaterThan(0);
    events.forEach(event => {
      expect(event.content).toContain('.jpg');
    });
  });

  it('should find GN events from dergigi using direct npub', async () => {
    const events = await searchEvents('GN author:npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc');
    expect(events.length).toBeGreaterThan(0);
    events.forEach(event => {
      expect(event.content).toContain('GN');
      expect(event.author.npub).toBe('npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc');
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