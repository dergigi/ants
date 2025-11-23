import { expandParenthesizedOr } from '../../search';
import { applySimpleReplacements } from '../replacements';

describe('Query to Filter Transformation', () => {

  describe('expandParenthesizedOr examples', () => {
    it('handles is:highlight (by:fiatjaf.com OR by:@f7z.io)', () => {
      const query = 'is:highlight (by:fiatjaf.com OR by:@f7z.io)';
      const expanded = expandParenthesizedOr(query);
      
      expect(expanded.length).toBeGreaterThanOrEqual(2);
      expect(expanded.some(e => e.includes('by:fiatjaf.com'))).toBe(true);
      expect(expanded.some(e => e.includes('by:@f7z.io'))).toBe(true);
    });

    it('handles NIP-EE (by:jeffg OR by:futurepaul OR by:franzap)', () => {
      const query = 'NIP-EE (by:jeffg OR by:futurepaul OR by:franzap)';
      const expanded = expandParenthesizedOr(query);
      
      expect(expanded.length).toBeGreaterThanOrEqual(3);
      expect(expanded.every(e => e.includes('NIP-EE'))).toBe(true);
    });

    it('handles (GM OR GN) by:dergigi has:image', () => {
      const query = '(GM OR GN) by:dergigi has:image';
      const expanded = expandParenthesizedOr(query);
      
      expect(expanded.length).toBeGreaterThanOrEqual(2);
      expect(expanded.every(e => e.includes('by:dergigi'))).toBe(true);
      expect(expanded.every(e => e.includes('has:image'))).toBe(true);
    });
  });

  describe('applySimpleReplacements examples', () => {
    it('expands is:highlight to kind:9802', async () => {
      const result = await applySimpleReplacements('is:highlight');
      expect(result).toContain('kind:9802');
    });

    it('expands is:image to kind:20', async () => {
      const result = await applySimpleReplacements('is:image');
      expect(result).toContain('kind:20');
    });

    it('handles combined queries', async () => {
      const result = await applySimpleReplacements('is:highlight by:dergigi');
      expect(result).toContain('kind:9802');
      expect(result).toContain('by:dergigi');
    });
  });

  describe('Golden examples from searchExamples', () => {
    const testCases = [
      'is:highlight (by:fiatjaf.com OR by:@f7z.io)',
      'is:highlight by:dergigi',
      'is:highlight "proof of work"',
      'is:highlight (bitcoin OR nostr)',
      'NIP-EE (by:jeffg OR by:futurepaul OR by:franzap)',
      '(GM OR GN) by:dergigi has:image',
    ];

    testCases.forEach(query => {
      it(`handles example: ${query}`, () => {
        const expanded = expandParenthesizedOr(query);
        expect(expanded.length).toBeGreaterThan(0);
        expect(expanded.every(e => typeof e === 'string')).toBe(true);
      });
    });
  });
});

