import { extractContentSearchTerms, filterByContent } from '../contentFilter';
import { NDKEvent } from '@nostr-dev-kit/ndk';

describe('extractContentSearchTerms', () => {
  it('extracts terms from a simple query', () => {
    expect(extractContentSearchTerms('bitcoin lightning')).toEqual(['bitcoin', 'lightning']);
  });

  it('returns null for a pure hashtag query', () => {
    expect(extractContentSearchTerms('#bitcoin #nostr')).toBeNull();
  });

  it('returns null for a pure author query', () => {
    expect(extractContentSearchTerms('by:jb55')).toBeNull();
  });

  it('returns null for a pure hashtag + author query', () => {
    expect(extractContentSearchTerms('#nostr by:jb55')).toBeNull();
  });

  it('strips structured tokens from a mixed query', () => {
    expect(extractContentSearchTerms('bitcoin by:jb55 #nostr since:2024-01-01')).toEqual(['bitcoin']);
  });

  it('strips all known structured token types', () => {
    const query = 'hello kind:1 kinds:1,30023 by:someone #tag since:123 until:456 mentions:abc a:30023:pub:id domain:example.com language:en sentiment:positive nsfw:false include:spam';
    expect(extractContentSearchTerms(query)).toEqual(['hello']);
  });

  it('returns null for an empty query', () => {
    expect(extractContentSearchTerms('')).toBeNull();
  });

  it('returns null when only whitespace remains', () => {
    expect(extractContentSearchTerms('by:alice by:bob')).toBeNull();
  });

  it('handles multiple content terms with structured tokens interspersed', () => {
    expect(extractContentSearchTerms('foo by:alice bar #tag baz')).toEqual(['foo', 'bar', 'baz']);
  });

  it('strips boolean operators (OR/AND/NOT)', () => {
    expect(extractContentSearchTerms('foo OR bar')).toEqual(['foo', 'bar']);
    expect(extractContentSearchTerms('foo AND bar')).toEqual(['foo', 'bar']);
    expect(extractContentSearchTerms('foo NOT bar')).toEqual(['foo', 'bar']);
  });

  it('strips parentheses from grouped boolean queries', () => {
    expect(extractContentSearchTerms('(GM OR GN) by:dergigi')).toEqual(['GM', 'GN']);
  });

  it('returns null for pure has: query', () => {
    expect(extractContentSearchTerms('has:image')).toBeNull();
  });

  it('returns null for pure site: query', () => {
    expect(extractContentSearchTerms('site:example.com')).toBeNull();
  });

  it('returns null for combined modifier-only queries', () => {
    expect(extractContentSearchTerms('has:image site:yt by:dergigi')).toBeNull();
    expect(extractContentSearchTerms('is:highlight has:video')).toBeNull();
  });

  it('extracts content from mixed modifier + boolean queries', () => {
    expect(extractContentSearchTerms('bitcoin OR lightning by:dergigi has:image')).toEqual(['bitcoin', 'lightning']);
  });
});

describe('filterByContent', () => {
  function makeEvent(content: string, opts?: { kind?: number; tags?: string[][] }): NDKEvent {
    return { content, kind: opts?.kind, tags: opts?.tags ?? [] } as unknown as NDKEvent;
  }

  it('keeps events that match any term', () => {
    const events = [
      makeEvent('I love bitcoin and nostr'),
      makeEvent('Just a random post'),
      makeEvent('Lightning network is great'),
    ];
    const result = filterByContent(events, ['bitcoin', 'lightning']);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('I love bitcoin and nostr');
    expect(result[1].content).toBe('Lightning network is great');
  });

  it('removes events that match no terms', () => {
    const events = [makeEvent('Nothing relevant here')];
    const result = filterByContent(events, ['bitcoin']);
    expect(result).toHaveLength(0);
  });

  it('is case insensitive', () => {
    const events = [makeEvent('BITCOIN is great'), makeEvent('Bitcoin rules')];
    const result = filterByContent(events, ['bitcoin']);
    expect(result).toHaveLength(2);
  });

  it('uses word-boundary matching for short terms (<=3 chars)', () => {
    const events = [
      makeEvent('GM everyone!'),          // "GM" as standalone word — should match
      makeEvent('GN frens'),              // "GN" as standalone word — should match
      makeEvent('This is a designer'),    // "gn" inside "designer" — should NOT match
      makeEvent('Good alignment here'),   // "gn" inside "alignment" — should NOT match
      makeEvent('Say GM, friends'),       // "GM" after comma — should match
    ];
    const result = filterByContent(events, ['GM']);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('GM everyone!');
    expect(result[1].content).toBe('Say GM, friends');
  });

  it('uses substring matching for longer terms (>3 chars)', () => {
    const events = [
      makeEvent('bitcoiner here'),    // "bitcoin" as substring — should match
      makeEvent('nothing here'),
    ];
    const result = filterByContent(events, ['bitcoin']);
    expect(result).toHaveLength(1);
  });

  it('filters out events with empty content (no searchable text)', () => {
    const events = [makeEvent(''), makeEvent('has bitcoin')];
    const result = filterByContent(events, ['bitcoin']);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('has bitcoin');
  });

  it('filters reposts/reactions with empty content (no longer exempt)', () => {
    const repost = { content: '', kind: 6, tags: [] } as unknown as NDKEvent;
    const reaction = { content: '', kind: 7, tags: [] } as unknown as NDKEvent;
    const result = filterByContent([repost, reaction], ['bitcoin']);
    expect(result).toHaveLength(0);
  });

  it('keeps reposts/reactions when content matches', () => {
    const reaction = { content: 'bitcoin!', kind: 7, tags: [] } as unknown as NDKEvent;
    const result = filterByContent([reaction], ['bitcoin']);
    expect(result).toHaveLength(1);
  });

  it('matches terms in tag values (title, description, summary)', () => {
    const event = { content: '', kind: 39089, tags: [['description', 'A list about bitcoin']] } as unknown as NDKEvent;
    const result = filterByContent([event], ['bitcoin']);
    expect(result).toHaveLength(1);
  });

  it('filters events with tags that do not match', () => {
    const event = { content: '', kind: 39089, tags: [['description', 'A list about cats']] } as unknown as NDKEvent;
    const result = filterByContent([event], ['bitcoin']);
    expect(result).toHaveLength(0);
  });

  it('returns all events when terms array is empty', () => {
    const events = [makeEvent('anything'), makeEvent('whatever')];
    const result = filterByContent(events, []);
    expect(result).toHaveLength(2);
  });

  it('handles events with undefined content gracefully', () => {
    const event = { content: undefined, tags: [] } as unknown as NDKEvent;
    const result = filterByContent([event], ['bitcoin']);
    // no content, no matching tags => filtered out
    expect(result).toHaveLength(0);
  });

  // URLs and nostr: references are kept in searchable text (#228).
  // Stripping them broke GIF, filename, URL, and NIP-05 searches.
  // The relay already matched via NIP-50 — no reason to second-guess it.

  it('matches terms in URLs and filenames', () => {
    const events = [
      makeEvent('https://i.nostr.build/Gregzaj1-ln_strike.gif'),
      makeEvent('Check out https://image.nostr.build/abc.png cool right'),
    ];
    const result = filterByContent(events, ['Gregzaj1']);
    expect(result).toHaveLength(1);
    expect(result[0].content).toContain('Gregzaj1');
  });

  it('matches terms in nostr: protocol references', () => {
    const events = [
      makeEvent('replying to nostr:npub1abc123 with a meme'),
      makeEvent('I love nostr, the protocol!'),
    ];
    const result = filterByContent(events, ['nostr']);
    expect(result).toHaveLength(2);
  });
});
