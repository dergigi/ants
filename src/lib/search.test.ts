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
  // Test each example from our shared examples list
  searchExamples.forEach(example => {
    it(`should find events for "${example}"`, async () => {
      const events = await searchEvents(example);
      expect(events.length).toBeGreaterThan(0);

      for (const event of events) {
        const content = event.content.toLowerCase();
        
        // Handle different types of examples
        if (example.startsWith('p:')) {
          // Profile lookup
          expect(event.kind).toBe(0);
        } else if (example.includes('#')) {
          // Hashtag search
          const hashtag = example.split(' ')[0].toLowerCase().replace('#', '');
          expect(content.includes(hashtag) || content.includes(`#${hashtag}`)).toBe(true);
        } else if (example.includes('from:') || example.includes('by:')) {
          // Author search with term
          const [author, ...terms] = example.split(' ').slice(1);
          const authorName = author.replace('from:', '').replace('by:', '');
          
          // Look up the author's pubkey
          const profile = await lookupVertexProfile(`p:${authorName}`);
          expect(profile).toBeTruthy();
          expect(event.pubkey).toBe(profile!.pubkey);
          
          // Check search terms if present
          if (terms.length > 0) {
            const searchTerms = terms.join(' ').toLowerCase();
            expect(content.includes(searchTerms)).toBe(true);
          }
        } else {
          // Regular search
          const terms = example.toLowerCase().split(' ');
          expect(terms.some(term => content.includes(term))).toBe(true);
        }
      }
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