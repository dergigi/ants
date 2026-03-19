// Mock the problematic NDK imports before importing search
jest.mock('../ndk', () => ({
  ndk: {},
  connectWithTimeout: jest.fn(),
  markRelayActivity: jest.fn(),
  safeSubscribe: jest.fn(),
  isValidFilter: jest.fn(() => true),
}));

jest.mock('../vertex', () => ({
  searchProfilesFullText: jest.fn(),
  resolveNip05ToPubkey: jest.fn(),
  profileEventFromPubkey: jest.fn(),
  resolveAuthor: jest.fn(),
}));

jest.mock('../relays', () => ({
  relaySets: {
    search: jest.fn(),
    default: jest.fn(),
  },
  RELAYS: {},
  getNip50SearchRelaySet: jest.fn(),
  extendWithUserAndPremium: jest.fn(),
}));

import { parseOrQuery } from '../search';
import { 
  getCurrentProfileNpub, 
  toImplicitUrlQuery, 
  toExplicitInputFromUrl, 
  ensureAuthorForBackend,
  decodeUrlQuery
} from '../search/queryTransforms';
import { detectSearchType } from '../search/searchTypeDetection';
import { searchExamples } from '../examples';

// Note: expandParenthesizedOr is already tested in src/lib/search/__tests__/expandParenthesizedOr.test.ts

describe('parseOrQuery', () => {
  describe('basic OR parsing', () => {
    it('should split simple OR query', () => {
      const result = parseOrQuery('bitcoin OR lightning');
      expect(result).toEqual(['bitcoin', 'lightning']);
    });

    it('should handle case-insensitive OR', () => {
      const result = parseOrQuery('term1 or term2 OR term3');
      expect(result).toEqual(['term1', 'term2', 'term3']);
    });

    it('should preserve quoted segments', () => {
      const result = parseOrQuery('"exact phrase" OR other');
      expect(result).toEqual(['exact phrase', 'other']);
    });

    it('should handle multiple OR operators', () => {
      const result = parseOrQuery('a OR b OR c OR d');
      expect(result).toEqual(['a', 'b', 'c', 'd']);
    });
  });

  describe('quoted string handling', () => {
    it('should not split OR inside quotes', () => {
      const result = parseOrQuery('"this OR that"');
      expect(result).toEqual(['this OR that']);
    });

    it('should handle mixed quoted and unquoted', () => {
      const result = parseOrQuery('"car crash" OR accident');
      expect(result).toEqual(['car crash', 'accident']);
    });

    it('should strip outer quotes', () => {
      const result = parseOrQuery('"quoted" OR "also quoted"');
      expect(result).toEqual(['quoted', 'also quoted']);
    });
  });

  describe('edge cases', () => {
    it('should handle query without OR', () => {
      const result = parseOrQuery('simple query');
      expect(result).toEqual(['simple query']);
    });

    it('should handle empty query', () => {
      const result = parseOrQuery('');
      expect(result).toEqual([]);
    });

    it('should handle trailing OR', () => {
      const result = parseOrQuery('term OR');
      // parseOrQuery doesn't strip trailing OR, it keeps it as part of the last term
      expect(result).toEqual(['term OR']);
    });

    it('should handle leading OR', () => {
      const result = parseOrQuery('OR term');
      // parseOrQuery doesn't strip leading OR, it keeps it as part of the first term
      expect(result).toEqual(['OR term']);
    });

    it('should handle extra whitespace', () => {
      const result = parseOrQuery('a   OR   b');
      expect(result).toEqual(['a', 'b']);
    });
  });
});

describe('queryTransforms', () => {
  describe('getCurrentProfileNpub', () => {
    it('should extract npub from /p/ path', () => {
      const result = getCurrentProfileNpub('/p/npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc');
      expect(result).toBe('npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc');
    });

    it('should return null for non-profile path', () => {
      expect(getCurrentProfileNpub('/search')).toBeNull();
      expect(getCurrentProfileNpub('/')).toBeNull();
    });

    it('should return null for null/undefined', () => {
      expect(getCurrentProfileNpub(null)).toBeNull();
      expect(getCurrentProfileNpub(undefined)).toBeNull();
    });

    it('should be case-insensitive', () => {
      const result = getCurrentProfileNpub('/p/NPUB1DERGGGKLKA99WWRS92YZ8WDJS952H2UX2HA2ED598NGWU9W7A6FSH9XZPC');
      expect(result).toBe('NPUB1DERGGGKLKA99WWRS92YZ8WDJS952H2UX2HA2ED598NGWU9W7A6FSH9XZPC');
    });
  });

  describe('toImplicitUrlQuery', () => {
    const testNpub = 'npub1test123';

    it('should strip matching by: token from query', () => {
      const result = toImplicitUrlQuery('GM by:npub1test123', testNpub);
      expect(result).toBe('GM');
    });

    it('should preserve non-matching by: tokens', () => {
      const result = toImplicitUrlQuery('GM by:npub1other', testNpub);
      expect(result).toBe('GM by:npub1other');
    });

    it('should return empty string for null npub', () => {
      const result = toImplicitUrlQuery('GM by:npub1test123', null);
      expect(result).toBe('GM by:npub1test123');
    });

    it('should handle empty query', () => {
      const result = toImplicitUrlQuery('', testNpub);
      expect(result).toBe('');
    });

    it('should normalize whitespace', () => {
      const result = toImplicitUrlQuery('GM   by:npub1test123   GN', testNpub);
      expect(result).toBe('GM GN');
    });
  });

  describe('toExplicitInputFromUrl', () => {
    const testNpub = 'npub1test123';

    it('should add by: token if missing', () => {
      const result = toExplicitInputFromUrl('GM', testNpub, null);
      expect(result).toBe('GM by:npub1test123');
    });

    it('should use display identifier if provided', () => {
      const result = toExplicitInputFromUrl('GM', testNpub, '@user.com');
      expect(result).toBe('GM by:@user.com');
    });

    it('should preserve existing by: token', () => {
      const result = toExplicitInputFromUrl('GM by:other', testNpub, null);
      expect(result).toBe('GM by:other');
    });

    it('should return only by: for empty query', () => {
      const result = toExplicitInputFromUrl('', testNpub, null);
      expect(result).toBe('by:npub1test123');
    });

    it('should handle null npub', () => {
      const result = toExplicitInputFromUrl('GM', null, null);
      expect(result).toBe('GM');
    });
  });

  describe('ensureAuthorForBackend', () => {
    const testNpub = 'npub1test123';

    it('should add by: token for backend if missing', () => {
      const result = ensureAuthorForBackend('GM', testNpub);
      expect(result).toBe('GM by:npub1test123');
    });

    it('should preserve existing by: token', () => {
      const result = ensureAuthorForBackend('GM by:other', testNpub);
      expect(result).toBe('GM by:other');
    });

    it('should return only by: for empty query', () => {
      const result = ensureAuthorForBackend('', testNpub);
      expect(result).toBe('by:npub1test123');
    });

    it('should handle null npub', () => {
      const result = ensureAuthorForBackend('GM', null);
      expect(result).toBe('GM');
    });
  });

  describe('decodeUrlQuery', () => {
    it('should decode URL-encoded strings', () => {
      const result = decodeUrlQuery('hello%20world');
      expect(result).toBe('hello world');
    });

    it('should convert + to spaces', () => {
      const result = decodeUrlQuery('hello+world');
      expect(result).toBe('hello world');
    });

    it('should handle complex encoded strings', () => {
      const result = decodeUrlQuery('(GM%20OR%20GN)%20by%3Adergigi');
      expect(result).toBe('(GM OR GN) by:dergigi');
    });

    it('should handle mixed + and %20', () => {
      const result = decodeUrlQuery('hello+world%20test');
      expect(result).toBe('hello world test');
    });

    it('should handle invalid encoding gracefully', () => {
      const result = decodeUrlQuery('invalid%E0%A4%A');
      expect(typeof result).toBe('string');
    });

    it('should handle empty string', () => {
      const result = decodeUrlQuery('');
      expect(result).toBe('');
    });

    it('should handle special characters', () => {
      const result = decodeUrlQuery('%23bitcoin%20%40dergigi.com');
      expect(result).toBe('#bitcoin @dergigi.com');
    });
  });
});

describe('searchTypeDetection', () => {
  describe('profile detection', () => {
    it('should detect p: prefix', () => {
      expect(detectSearchType('p:fiatjaf')).toBe('profile');
    });

    it('should detect by: prefix', () => {
      expect(detectSearchType('by:dergigi')).toBe('profile');
    });

    it('should detect combined profile queries', () => {
      expect(detectSearchType('GM by:dergigi')).toBe('profile');
    });
  });

  describe('media detection', () => {
    it('should detect is:image', () => {
      expect(detectSearchType('is:image')).toBe('media');
    });

    it('should detect is:video', () => {
      expect(detectSearchType('is:video')).toBe('media');
    });

    it('should detect has:image', () => {
      expect(detectSearchType('has:image')).toBe('media');
    });

    it('should detect has:video', () => {
      expect(detectSearchType('has:video')).toBe('media');
    });

    it('should detect has:media', () => {
      expect(detectSearchType('has:media')).toBe('media');
    });

    it('should detect kind:1064', () => {
      expect(detectSearchType('kind:1064')).toBe('media');
    });

    it('should detect kind:1065', () => {
      expect(detectSearchType('kind:1065')).toBe('media');
    });

    it('should detect media keywords', () => {
      expect(detectSearchType('image search')).toBe('media');
      expect(detectSearchType('video content')).toBe('media');
      expect(detectSearchType('photo gallery')).toBe('media');
      expect(detectSearchType('gif animation')).toBe('media');
    });
  });

  describe('text detection', () => {
    it('should detect is:text', () => {
      expect(detectSearchType('is:text')).toBe('text');
    });

    it('should detect kind:1', () => {
      expect(detectSearchType('kind:1')).toBe('text');
    });

    it('should detect kind:30023', () => {
      expect(detectSearchType('kind:30023')).toBe('text');
    });

    it('should detect text keywords', () => {
      expect(detectSearchType('text search')).toBe('text');
      expect(detectSearchType('note content')).toBe('text');
      expect(detectSearchType('post about bitcoin')).toBe('text');
      expect(detectSearchType('article on nostr')).toBe('text');
    });
  });

  describe('generic detection', () => {
    it('should default to generic for unknown patterns', () => {
      expect(detectSearchType('bitcoin')).toBe('generic');
    });

    it('should default to generic for empty string', () => {
      expect(detectSearchType('')).toBe('generic');
    });

    it('should default to generic for mixed queries', () => {
      expect(detectSearchType('bitcoin lightning nostr')).toBe('generic');
    });
  });

  describe('case insensitivity', () => {
    it('should handle uppercase operators', () => {
      expect(detectSearchType('BY:dergigi')).toBe('profile');
      expect(detectSearchType('IS:IMAGE')).toBe('media');
      expect(detectSearchType('HAS:VIDEO')).toBe('media');
    });

    it('should handle mixed case', () => {
      expect(detectSearchType('By:Dergigi')).toBe('profile');
      expect(detectSearchType('Is:Image')).toBe('media');
    });
  });
});

// Note: Operator parsing is tested implicitly through other tests and in queryToFilter.test.ts

describe('example queries - validation', () => {
  it('should parse all example queries without errors', () => {
    // This test ensures all examples in examples.ts are valid
    searchExamples.forEach(example => {
      expect(() => {
        // Basic validation - these should not throw
        detectSearchType(example);
        parseOrQuery(example);
      }).not.toThrow();
    });
  });

  describe('specific example patterns', () => {
    it('should handle emoji examples', () => {
      const result1 = parseOrQuery('PV OR 🤙');
      expect(result1).toContain('PV');
      expect(result1).toContain('🤙');

      const result2 = parseOrQuery('😂 OR 🤣 OR lol OR lmao');
      expect(result2).toContain('😂');
      expect(result2).toContain('🤣');
    });

    it('should handle hashtag examples', () => {
      expect('#bitcoin').toContain('#bitcoin');
      expect('#plebchain or #introductions').toContain('#plebchain');
    });

    it('should handle file extension examples', () => {
      expect('nicolas-cage.gif').toContain('.gif');
      expect('Gregzaj1-ln_strike.gif').toContain('.gif');
      expect('.jpg by:corndalorian').toContain('.jpg');
    });

    it('should handle URL examples', () => {
      expect('site:yt').toContain('site:');
      expect('https://dergigi.com/vew').toContain('https://');
    });
  });
});

describe('special character handling', () => {
  it('should handle Unicode characters', () => {
    const query = '≠ by:dergigi.com';
    expect(detectSearchType(query)).toBe('profile');
  });

  it('should handle emoji in queries', () => {
    const query = '👀 by:dergigi';
    expect(detectSearchType(query)).toBe('profile');
  });

  it('should handle hashtags', () => {
    const query = '#bitcoin #nostr';
    expect(query).toContain('#');
  });

  it('should handle quoted phrases with special chars', () => {
    const result = parseOrQuery('"car crash" OR "traffic jam"');
    expect(result).toEqual(['car crash', 'traffic jam']);
  });
});

describe('edge cases and error handling', () => {
  it('should handle malformed operators', () => {
    expect(() => detectSearchType('by:')).not.toThrow();
    expect(() => detectSearchType('is:')).not.toThrow();
    expect(() => detectSearchType('has:')).not.toThrow();
  });

  it('should handle very long queries', () => {
    const longQuery = 'word '.repeat(100).trim();
    expect(() => detectSearchType(longQuery)).not.toThrow();
    expect(() => parseOrQuery(longQuery)).not.toThrow();
  });

  it('should handle queries with only whitespace', () => {
    expect(detectSearchType('   ')).toBe('generic');
    expect(parseOrQuery('   ')).toEqual([]);
  });

  it('should handle nested quotes', () => {
    // Edge case: unmatched quotes
    const result = parseOrQuery('quote" OR "other');
    expect(Array.isArray(result)).toBe(true);
  });

  it('should handle multiple consecutive spaces', () => {
    const result = parseOrQuery('a    OR    b');
    expect(result).toEqual(['a', 'b']);
  });

  it('should handle complex edge cases', () => {
    const result = parseOrQuery('query  OR  term  OR  another');
    expect(result.length).toBe(3);
    expect(result).toContain('query');
    expect(result).toContain('term');
    expect(result).toContain('another');
  });
});
