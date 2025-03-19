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
  beforeAll(async () => {
    await ndk.connect();
  }, 5000);

  afterAll(async () => {
    // No need to disconnect as it's not available in NDK type
  }, 5000);

  it('should find events with regular search', async () => {
    const events = await searchEvents('hello world');
    expect(events.length).toBeGreaterThan(0);
  });

  it('should find events from an author without search term', async () => {
    const events = await searchEvents('by:pablo', 50);
    expect(events.length).toBeGreaterThan(0);
  });

  it('should find events with author filter and search term', async () => {
    // First get Pablo's profile
    const pabloProfile = await lookupVertexProfile('p:pablo');
    expect(pabloProfile).toBeTruthy();
    const pabloNpub = pabloProfile!.author.npub;

    // Search for events
    const events = await searchEvents('by:pablo ndk');
    expect(events.length).toBeGreaterThan(0);
    
    // Verify each event
    events.forEach((event: NDKEvent) => {
      // Check that the event contains 'ndk' in its content
      expect(event.content.toLowerCase()).toContain('ndk');
      // Check that the event was authored by Pablo
      expect(event.author.npub).toBe(pabloNpub);
    });
  });

  it('should find events for "p:fiatjaf"', async () => {
    const events = await searchEvents('p:fiatjaf');
    expect(events.length).toBeGreaterThan(0);
  }, 5000);

  it('should find events containing "vibe coding"', async () => {
    const events = await searchEvents('vibe coding');
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].content.toLowerCase()).toContain('vibe coding');
  }, 5000);

  it('should find events with hashtag #PenisButter', async () => {
    const events = await searchEvents('#PenisButter');
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].content).toContain('#PenisButter');
  }, 5000);

  it('should find events from author "pablo" containing "ndk"', async () => {
    const events = await searchEvents('by:pablo ndk');
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].content.toLowerCase()).toContain('ndk');
  }, 5000);

  it('should find events with hashtag #YESTR', async () => {
    const events = await searchEvents('#YESTR');
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].content).toContain('#YESTR');
  }, 5000);

  it('should find events with hashtag #YESTR from author "gigi"', async () => {
    const events = await searchEvents('#YESTR by:gigi');
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].content).toContain('#YESTR');
  }, 5000);

  it('should find events with hashtag #SovEng', async () => {
    const events = await searchEvents('#SovEng');
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].content).toContain('#SovEng');
  }, 5000);

  it('should find events with 👀 from author "gigi"', async () => {
    const events = await searchEvents('👀 by:gigi');
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].content).toContain('👀');
  }, 5000);

  it('should find GM events from author "dergigi"', async () => {
    const events = await searchEvents('GM by:dergigi');
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].content).toContain('GM');
  }, 5000);

  it('should find events with .jpg from author "corndalorian"', async () => {
    const events = await searchEvents('.jpg by:corndalorian');
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].content).toContain('.jpg');
  }, 5000);

  it('should find GN events from dergigi using direct npub', async () => {
    const events = await searchEvents('GN by:npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc');
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].content).toContain('GN');
  }, 5000);

  it('should handle author filters with direct npub and name lookups', async () => {
    const queries = [
      'GM by:npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc',
      'GM by:dergigi',
      'GM by:gigi'
    ];

    const results = await Promise.all(queries.map(q => searchEvents(q)));
    
    // All queries should return the same number of results
    expect(results[0].length).toBeGreaterThan(0);
    expect(results[0].length).toBe(results[1].length);
    expect(results[1].length).toBe(results[2].length);

    // All results should be from the same author
    const npub = 'npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc';
    results.forEach(resultSet => {
      resultSet.forEach(event => {
        expect(event.author.npub).toBe(npub);
        expect(event.content.toLowerCase()).toContain('gm');
      });
    });
  }, 5000);

  it('should find GM notes from a specific npub', async () => {
    const npub = 'npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc';
    const query = `GM by:${npub}`;
    const events = await searchEvents(query);
    
    expect(events.length).toBeGreaterThan(0);
    events.forEach(event => {
      expect(event.author.npub).toBe(npub);
      expect(event.content.toLowerCase()).toContain('gm');
    });
  }, 5000);

  it('should handle author filter in any position', async () => {
    const npub = 'npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc';
    
    // Test with author filter at the end
    const events1 = await searchEvents('GM by:dergigi');
    expect(events1.length).toBeGreaterThan(0);
    events1.forEach(event => {
      expect(event.author.npub).toBe(npub);
      expect(event.content.toLowerCase()).toContain('gm');
    });

    // Test with author filter at the start
    const events2 = await searchEvents('by:dergigi GM');
    expect(events2.length).toBeGreaterThan(0);
    events2.forEach(event => {
      expect(event.author.npub).toBe(npub);
      expect(event.content.toLowerCase()).toContain('gm');
    });

    // Verify both searches returned the same results
    expect(events1.length).toBe(events2.length);
    expect(events1.map(e => e.id).sort()).toEqual(events2.map(e => e.id).sort());
  }, 5000);
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
  }, 5000); // 5 second timeout
});

describe('Search Examples', () => {
  it('should find fiatjaf profile', async () => {
    const events = await searchEvents('p:fiatjaf');
    expect(events.length).toBe(1);
    expect(events[0].kind).toBe(0);
  }, 5000);

  it('should find events with #PenisButter hashtag', async () => {
    const events = await searchEvents('#PenisButter');
    expect(events.length).toBeGreaterThan(0);
    events.forEach(event => {
      expect(event.content.toLowerCase()).toContain('#penisbutter');
    });
  }, 5000);

  it('should find NDK events from Pablo', async () => {
    const events = await searchEvents('by:pablo ndk');
    expect(events.length).toBeGreaterThan(0);
    events.forEach(event => {
      expect(event.content.toLowerCase()).toContain('ndk');
    });
  }, 5000);

  it('should find events with #YESTR hashtag', async () => {
    const events = await searchEvents('#YESTR');
    expect(events.length).toBeGreaterThan(0);
    events.forEach(event => {
      expect(event.content.toLowerCase()).toContain('#yestr');
    });
  }, 5000);

  it('should find #YESTR events from gigi', async () => {
    const events = await searchEvents('#YESTR by:gigi');
    expect(events.length).toBeGreaterThan(0);
    events.forEach(event => {
      expect(event.content.toLowerCase()).toContain('#yestr');
    });
  }, 5000);

  it('should find events with #SovEng hashtag', async () => {
    const events = await searchEvents('#SovEng');
    expect(events.length).toBeGreaterThan(0);
    events.forEach(event => {
      expect(event.content.toLowerCase()).toContain('#soveng');
    });
  }, 5000);

  it('should find 👀 events from gigi', async () => {
    const events = await searchEvents('👀 by:gigi');
    expect(events.length).toBeGreaterThan(0);
    events.forEach(event => {
      expect(event.content).toContain('👀');
    });
  }, 5000);

  it('should find GM events from dergigi', async () => {
    const events = await searchEvents('GM by:dergigi');
    expect(events.length).toBeGreaterThan(0);
    events.forEach(event => {
      expect(event.content).toContain('GM');
      expect(event.author.npub).toBe('npub1dergggklka99wwrs92xn8ldenl8fl6z57y2y3lxjcupsa46l8t5qscxusaj');
    });
  }, 5000);

  it('should find .jpg events from corndalorian', async () => {
    const events = await searchEvents('.jpg by:corndalorian');
    expect(events.length).toBeGreaterThan(0);
    events.forEach(event => {
      expect(event.content).toContain('.jpg');
    });
  }, 5000);

  it('should find GN events from dergigi using direct npub', async () => {
    const events = await searchEvents('GN by:npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc');
    expect(events.length).toBeGreaterThan(0);
    events.forEach(event => {
      expect(event.content).toContain('GN');
      expect(event.author.npub).toBe('npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc');
    });
  }, 5000);
});

describe('Author Search Patterns', () => {
  const dergigiNpub = 'npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc';

  it('should find events using different search patterns for the same author', async () => {
    // Test 1: Direct npub search
    const directNpubEvents = await searchEvents(dergigiNpub);
    expect(directNpubEvents.length).toBeGreaterThan(0);
    expect(directNpubEvents[0].author.npub).toBe(dergigiNpub);

    // Test 2: by:npub search
    const byNpubEvents = await searchEvents(`by:${dergigiNpub}`);
    expect(byNpubEvents.length).toBeGreaterThan(0);
    expect(byNpubEvents[0].author.npub).toBe(dergigiNpub);

    // Test 3: by:dergigi search (should resolve to the same npub)
    const byDergigiEvents = await searchEvents('by:dergigi');
    expect(byDergigiEvents.length).toBeGreaterThan(0);
    expect(byDergigiEvents[0].author.npub).toBe(dergigiNpub);

    // Test 4: by:gigi search (should resolve to the same npub)
    const byGigiEvents = await searchEvents('by:gigi');
    expect(byGigiEvents.length).toBeGreaterThan(0);
    expect(byGigiEvents[0].author.npub).toBe(dergigiNpub);

    // Verify that all searches returned similar results
    const eventIds = new Set([
      ...directNpubEvents.map(e => e.id),
      ...byNpubEvents.map(e => e.id),
      ...byDergigiEvents.map(e => e.id),
      ...byGigiEvents.map(e => e.id)
    ]);

    // We expect significant overlap in results
    expect(eventIds.size).toBeLessThan(
      directNpubEvents.length + byNpubEvents.length + byDergigiEvents.length + byGigiEvents.length
    );
  }, 5000);
}); 