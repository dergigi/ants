import { expandParenthesizedOr } from '../../search';

describe('expandParenthesizedOr', () => {
  it('returns input unchanged when no parentheses', () => {
    expect(expandParenthesizedOr('simple query')).toEqual(['simple query']);
  });

  it('expands simple OR in parentheses', () => {
    const result = expandParenthesizedOr('(GM OR GN)');
    expect(result).toContain('GM');
    expect(result).toContain('GN');
    expect(result).toHaveLength(2);
  });

  it('distributes surrounding context', () => {
    const result = expandParenthesizedOr('(GM OR GN) by:dergigi');
    expect(result).toContain('GM by:dergigi');
    expect(result).toContain('GN by:dergigi');
    expect(result).toHaveLength(2);
  });

  it('handles nested parentheses', () => {
    const result = expandParenthesizedOr('(GM OR (GN OR GN2)) by:dergigi');
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.every(r => r.includes('by:dergigi'))).toBe(true);
  });

  it('handles multiple OR terms', () => {
    const result = expandParenthesizedOr('(A OR B OR C)');
    expect(result).toContain('A');
    expect(result).toContain('B');
    expect(result).toContain('C');
    expect(result).toHaveLength(3);
  });

  it('preserves by: tokens correctly', () => {
    const result = expandParenthesizedOr('is:highlight (by:fiatjaf.com OR by:@f7z.io)');
    expect(result).toContain('is:highlight by:fiatjaf.com');
    expect(result).toContain('is:highlight by:@f7z.io');
  });

  it('deduplicates results', () => {
    const result = expandParenthesizedOr('(A OR A)');
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('A');
  });
});

