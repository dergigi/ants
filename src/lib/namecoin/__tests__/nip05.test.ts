import {
  isValidIdentifier,
  isDotBit,
  parseIdentifier,
  extractNostrFromValue,
  extractImports,
} from '../nip05';

describe('namecoin/nip05 parser', () => {
  describe('isValidIdentifier', () => {
    it('accepts .bit shapes', () => {
      expect(isValidIdentifier('alice.bit')).toBe(true);
      expect(isValidIdentifier('ALICE.BIT')).toBe(true);
      expect(isValidIdentifier('alice@example.bit')).toBe(true);
      expect(isValidIdentifier('d/example')).toBe(true);
      expect(isValidIdentifier('id/alice')).toBe(true);
      expect(isValidIdentifier('nostr:d/example')).toBe(true);
      expect(isValidIdentifier('  alice@example.bit  ')).toBe(true);
    });

    it('rejects DNS NIP-05 and empty input', () => {
      expect(isValidIdentifier('')).toBe(false);
      expect(isValidIdentifier(null)).toBe(false);
      expect(isValidIdentifier(undefined)).toBe(false);
      expect(isValidIdentifier('alice@example.com')).toBe(false);
      expect(isValidIdentifier('example.com')).toBe(false);
      expect(isValidIdentifier('d')).toBe(false);
      expect(isValidIdentifier('d/')).toBe(false);
      expect(isValidIdentifier('.bit')).toBe(false);
    });

    it('isDotBit is an alias', () => {
      expect(isDotBit('alice.bit')).toBe(true);
      expect(isDotBit('alice@example.com')).toBe(false);
    });
  });

  describe('parseIdentifier', () => {
    it('parses bare .bit names', () => {
      expect(parseIdentifier('example.bit')).toEqual({
        namecoinName: 'd/example',
        localPart: '_',
        isDomain: true,
      });
    });

    it('parses user@example.bit', () => {
      expect(parseIdentifier('alice@example.bit')).toEqual({
        namecoinName: 'd/example',
        localPart: 'alice',
        isDomain: true,
      });
    });

    it('parses d/<name> and id/<name>', () => {
      expect(parseIdentifier('d/testls')).toEqual({
        namecoinName: 'd/testls',
        localPart: '_',
        isDomain: true,
      });
      expect(parseIdentifier('id/alice')).toEqual({
        namecoinName: 'id/alice',
        localPart: '_',
        isDomain: false,
      });
    });

    it('tolerates nostr: prefix', () => {
      expect(parseIdentifier('nostr:alice@example.bit')).toEqual({
        namecoinName: 'd/example',
        localPart: 'alice',
        isDomain: true,
      });
    });

    it('lowercases on parse', () => {
      const p = parseIdentifier('Alice@EXAMPLE.bit');
      expect(p?.localPart).toBe('alice');
      expect(p?.namecoinName).toBe('d/example');
    });

    it('returns null for malformed input', () => {
      expect(parseIdentifier('')).toBeNull();
      expect(parseIdentifier('@example.bit')).toEqual({
        namecoinName: 'd/example',
        localPart: '_',
        isDomain: true,
      });
      expect(parseIdentifier('alice@.bit')).toBeNull();
    });
  });

  describe('extractNostrFromValue', () => {
    const pk = 'a'.repeat(64);
    const pkB = 'b'.repeat(64);

    it('handles the simple nostr: <hex> form for the root entry', () => {
      const v = JSON.stringify({ nostr: pk });
      const got = extractNostrFromValue(v, {
        namecoinName: 'd/example',
        localPart: '_',
        isDomain: true,
      });
      expect(got).toEqual({ pubkey: pk });
    });

    it('rejects simple form when the localpart is not _', () => {
      const v = JSON.stringify({ nostr: pk });
      const got = extractNostrFromValue(v, {
        namecoinName: 'd/example',
        localPart: 'alice',
        isDomain: true,
      });
      expect(got).toBeNull();
    });

    it('handles the extended object form with names map + relays', () => {
      const v = JSON.stringify({
        nostr: {
          names: { alice: pk, _: pkB },
          relays: { [pk]: ['wss://one.example', 'wss://two.example'] },
        },
      });
      const got = extractNostrFromValue(v, {
        namecoinName: 'd/example',
        localPart: 'alice',
        isDomain: true,
      });
      expect(got).toEqual({
        pubkey: pk,
        relays: ['wss://one.example', 'wss://two.example'],
      });
    });

    it('falls back to the _ entry when the requested localpart is missing', () => {
      const v = JSON.stringify({ nostr: { names: { _: pk } } });
      const got = extractNostrFromValue(v, {
        namecoinName: 'd/example',
        localPart: 'bob',
        isDomain: true,
      });
      expect(got).toEqual({ pubkey: pk });
    });

    it('handles the id/<name> identity object shape', () => {
      const v = JSON.stringify({
        nostr: { pubkey: pk, relays: ['wss://relay.example'] },
      });
      const got = extractNostrFromValue(v, {
        namecoinName: 'id/alice',
        localPart: '_',
        isDomain: false,
      });
      expect(got).toEqual({ pubkey: pk, relays: ['wss://relay.example'] });
    });

    it('returns null on malformed JSON or missing nostr field', () => {
      const ctx = { namecoinName: 'd/x', localPart: '_', isDomain: true };
      expect(extractNostrFromValue('not json', ctx)).toBeNull();
      expect(extractNostrFromValue(JSON.stringify({ other: 'field' }), ctx)).toBeNull();
      expect(extractNostrFromValue(JSON.stringify({ nostr: 'not-a-pubkey' }), ctx)).toBeNull();
      expect(extractNostrFromValue(JSON.stringify({ nostr: { names: {} } }), ctx)).toBeNull();
    });

    it('lowercases pubkeys on output', () => {
      const upper = 'A'.repeat(64);
      const v = JSON.stringify({ nostr: upper });
      const got = extractNostrFromValue(v, {
        namecoinName: 'd/example',
        localPart: '_',
        isDomain: true,
      });
      expect(got).toEqual({ pubkey: 'a'.repeat(64) });
    });
  });

  describe('extractImports', () => {
    it('returns a single import as a one-element array', () => {
      expect(extractImports(JSON.stringify({ import: 'dd/example' }))).toEqual(['dd/example']);
    });

    it('flattens an array of imports (string or [name, ...] form)', () => {
      expect(
        extractImports(
          JSON.stringify({ import: ['dd/a', ['dd/b', 'rel'], { not: 'a string' }] }),
        ),
      ).toEqual(['dd/a', 'dd/b']);
    });

    it('returns empty array on malformed input', () => {
      expect(extractImports('not json')).toEqual([]);
      expect(extractImports('{}')).toEqual([]);
    });
  });
});
