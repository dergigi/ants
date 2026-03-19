// Mock NDK and nip07 before importing spells
jest.mock('../ndk', () => ({
  ndk: {
    getUser: jest.fn(() => ({
      fetchProfile: jest.fn(),
      follows: jest.fn(() => Promise.resolve(new Set([
        { pubkey: 'aabbccdd' },
        { pubkey: 'eeff0011' },
      ]))),
    })),
  },
}));

jest.mock('../nip07', () => ({
  getStoredPubkey: jest.fn(() => 'deadbeef01234567890abcdef'),
}));

import { NDKEvent } from '@nostr-dev-kit/ndk';
import { parseSpell, resolveTimestamp, isSpellEvent, SpellError, SPELL_KIND } from '../spells';

function makeSpellEvent(tags: string[][], content = ''): NDKEvent {
  const event = {
    kind: SPELL_KIND,
    content,
    tags,
    id: 'test-id',
    pubkey: 'test-pubkey',
    created_at: Math.floor(Date.now() / 1000),
    sig: 'test-sig',
  } as unknown as NDKEvent;
  return event;
}

describe('isSpellEvent', () => {
  it('returns true for kind 777', () => {
    expect(isSpellEvent({ kind: 777 } as NDKEvent)).toBe(true);
  });

  it('returns false for other kinds', () => {
    expect(isSpellEvent({ kind: 1 } as NDKEvent)).toBe(false);
    expect(isSpellEvent({ kind: 0 } as NDKEvent)).toBe(false);
  });
});

describe('resolveTimestamp', () => {
  it('resolves "now" to current time', () => {
    const before = Math.floor(Date.now() / 1000);
    const result = resolveTimestamp('now');
    const after = Math.floor(Date.now() / 1000);
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });

  it('resolves absolute timestamps', () => {
    expect(resolveTimestamp('1704067200')).toBe(1704067200);
  });

  it('resolves relative timestamps', () => {
    const now = Math.floor(Date.now() / 1000);
    const result7d = resolveTimestamp('7d');
    expect(result7d).toBeCloseTo(now - 7 * 86400, -1);

    const result1h = resolveTimestamp('1h');
    expect(result1h).toBeCloseTo(now - 3600, -1);

    const result30m = resolveTimestamp('30m');
    expect(result30m).toBeCloseTo(now - 30 * 60, -1);

    const result2mo = resolveTimestamp('2mo');
    expect(result2mo).toBeCloseTo(now - 2 * 2592000, -1);

    const result1y = resolveTimestamp('1y');
    expect(result1y).toBeCloseTo(now - 31536000, -1);
  });

  it('throws on invalid timestamps', () => {
    expect(() => resolveTimestamp('invalid')).toThrow(SpellError);
    expect(() => resolveTimestamp('7x')).toThrow(SpellError);
    expect(() => resolveTimestamp('')).toThrow(SpellError);
  });
});

describe('parseSpell', () => {
  it('parses a basic REQ spell with kinds and search', async () => {
    const event = makeSpellEvent([
      ['cmd', 'REQ'],
      ['k', '1'],
      ['search', 'nostr development'],
      ['limit', '100'],
    ], 'Search for nostr dev discussions');

    const spell = await parseSpell(event);
    expect(spell.cmd).toBe('REQ');
    expect(spell.filter.kinds).toEqual([1]);
    expect(spell.filter.search).toBe('nostr development');
    expect(spell.filter.limit).toBe(100);
    expect(spell.description).toBe('Search for nostr dev discussions');
    expect(spell.closeOnEose).toBe(false);
  });

  it('parses multiple kind tags', async () => {
    const event = makeSpellEvent([
      ['cmd', 'COUNT'],
      ['k', '1'],
      ['k', '6'],
      ['k', '7'],
      ['close-on-eose'],
    ]);

    const spell = await parseSpell(event);
    expect(spell.cmd).toBe('COUNT');
    expect(spell.filter.kinds).toEqual([1, 6, 7]);
    expect(spell.closeOnEose).toBe(true);
  });

  it('parses tag filters correctly', async () => {
    const event = makeSpellEvent([
      ['cmd', 'REQ'],
      ['k', '1'],
      ['tag', 't', 'bitcoin', 'nostr'],
      ['tag', 'e', 'abcd1234'],
    ]);

    const spell = await parseSpell(event);
    expect((spell.filter as Record<string, unknown>)['#t']).toEqual(['bitcoin', 'nostr']);
    expect((spell.filter as Record<string, unknown>)['#e']).toEqual(['abcd1234']);
  });

  it('resolves $me variable', async () => {
    const event = makeSpellEvent([
      ['cmd', 'REQ'],
      ['k', '1'],
      ['authors', '$me'],
    ]);

    const spell = await parseSpell(event);
    expect(spell.filter.authors).toEqual(['deadbeef01234567890abcdef']);
  });

  it('resolves $contacts variable', async () => {
    const event = makeSpellEvent([
      ['cmd', 'REQ'],
      ['k', '1'],
      ['authors', '$contacts'],
    ]);

    const spell = await parseSpell(event);
    expect(spell.filter.authors).toEqual(['aabbccdd', 'eeff0011']);
  });

  it('parses relay URLs', async () => {
    const event = makeSpellEvent([
      ['cmd', 'REQ'],
      ['k', '1'],
      ['relays', 'wss://relay.damus.io', 'wss://nos.lol'],
      ['search', 'test'],
    ]);

    const spell = await parseSpell(event);
    expect(spell.relays).toEqual(['wss://relay.damus.io', 'wss://nos.lol']);
  });

  it('parses name and since/until', async () => {
    const event = makeSpellEvent([
      ['cmd', 'REQ'],
      ['name', 'My saved search'],
      ['k', '1'],
      ['since', '1704067200'],
      ['until', '1704153600'],
    ]);

    const spell = await parseSpell(event);
    expect(spell.name).toBe('My saved search');
    expect(spell.filter.since).toBe(1704067200);
    expect(spell.filter.until).toBe(1704153600);
  });

  it('throws on missing cmd tag', async () => {
    const event = makeSpellEvent([['k', '1']]);
    await expect(parseSpell(event)).rejects.toThrow('missing required "cmd" tag');
  });

  it('throws on invalid cmd value', async () => {
    const event = makeSpellEvent([['cmd', 'SUBSCRIBE'], ['k', '1']]);
    await expect(parseSpell(event)).rejects.toThrow('Invalid cmd value');
  });

  it('throws on wrong kind', async () => {
    const event = { kind: 1, tags: [['cmd', 'REQ']], content: '' } as unknown as NDKEvent;
    await expect(parseSpell(event)).rejects.toThrow('Expected kind 777');
  });

  it('throws on spell with no filter tags', async () => {
    const event = makeSpellEvent([['cmd', 'REQ']]);
    await expect(parseSpell(event)).rejects.toThrow('no filter tags');
  });

  it('parses ids tag', async () => {
    const event = makeSpellEvent([
      ['cmd', 'REQ'],
      ['ids', 'abc123', 'def456'],
    ]);

    const spell = await parseSpell(event);
    expect(spell.filter.ids).toEqual(['abc123', 'def456']);
  });
});
