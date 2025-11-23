import type { NDKFilter } from '@nostr-dev-kit/ndk';
import { reduceFilters } from '../filterReduce';

describe('reduceFilters', () => {
  it('returns input unchanged for empty or single filter', () => {
    expect(reduceFilters([])).toEqual([]);
    
    const single: NDKFilter = { kinds: [1] };
    expect(reduceFilters([single])).toEqual([single]);
  });

  it('merges filters with same base but different authors', () => {
    const filters: NDKFilter[] = [
      { kinds: [9802], authors: ['author1'] },
      { kinds: [9802], authors: ['author2'] },
    ];
    
    const reduced = reduceFilters(filters);
    expect(reduced).toHaveLength(1);
    expect(reduced[0].kinds).toEqual([9802]);
    expect(reduced[0].authors).toContain('author1');
    expect(reduced[0].authors).toContain('author2');
    expect(reduced[0].authors).toHaveLength(2);
  });

  it('merges filters with same base but different kinds', () => {
    const filters: NDKFilter[] = [
      { kinds: [1], authors: ['author1'] },
      { kinds: [6], authors: ['author1'] },
    ];
    
    const reduced = reduceFilters(filters);
    expect(reduced).toHaveLength(1);
    expect(reduced[0].authors).toEqual(['author1']);
    expect(reduced[0].kinds).toContain(1);
    expect(reduced[0].kinds).toContain(6);
    expect(reduced[0].kinds).toHaveLength(2);
  });

  it('merges time ranges correctly (min since, max until)', () => {
    const filters: NDKFilter[] = [
      { kinds: [1], since: 1000, until: 2000 },
      { kinds: [1], since: 1500, until: 2500 },
    ];
    
    const reduced = reduceFilters(filters);
    expect(reduced).toHaveLength(1);
    expect(reduced[0].since).toBe(1000); // min
    expect(reduced[0].until).toBe(2500); // max
  });

  it('merges tag arrays', () => {
    const filters: NDKFilter[] = [
      { kinds: [1], '#t': ['tag1', 'tag2'] },
      { kinds: [1], '#t': ['tag2', 'tag3'] },
    ];
    
    const reduced = reduceFilters(filters);
    expect(reduced).toHaveLength(1);
    expect(reduced[0]['#t']).toContain('tag1');
    expect(reduced[0]['#t']).toContain('tag2');
    expect(reduced[0]['#t']).toContain('tag3');
    expect(reduced[0]['#t']).toHaveLength(3);
  });

  it('does not merge filters with different search queries', () => {
    const filters: NDKFilter[] = [
      { kinds: [1], search: 'query1' },
      { kinds: [1], search: 'query2' },
    ];
    
    const reduced = reduceFilters(filters);
    expect(reduced).toHaveLength(2); // Cannot merge - different search
  });

  it('does not merge filters with different scalar fields', () => {
    const filters: NDKFilter[] = [
      { kinds: [1], limit: 10 },
      { kinds: [1], limit: 20 },
    ];
    
    // limit is a scalar, so filters with different limits cannot be merged
    const reduced = reduceFilters(filters);
    expect(reduced).toHaveLength(2);
  });

  it('deduplicates authors and kinds', () => {
    const filters: NDKFilter[] = [
      { kinds: [1, 2], authors: ['author1', 'author2'] },
      { kinds: [2, 3], authors: ['author2', 'author3'] },
    ];
    
    const reduced = reduceFilters(filters);
    expect(reduced).toHaveLength(1);
    expect(reduced[0].kinds).toEqual([1, 2, 3]);
    expect(reduced[0].authors).toEqual(['author1', 'author2', 'author3']);
  });

  it('handles complex multi-field merges', () => {
    const filters: NDKFilter[] = [
      { kinds: [9802], authors: ['author1'], '#t': ['highlight'], since: 1000 },
      { kinds: [9802], authors: ['author2'], '#t': ['highlight'], since: 1000 },
    ];
    
    const reduced = reduceFilters(filters);
    expect(reduced).toHaveLength(1);
    expect(reduced[0].kinds).toEqual([9802]);
    expect(reduced[0].authors).toHaveLength(2);
    expect(reduced[0]['#t']).toEqual(['highlight']);
    expect(reduced[0].since).toBe(1000);
  });

  it('handles filters with no mergeable fields', () => {
    const filters: NDKFilter[] = [
      { kinds: [1], authors: ['author1'], search: 'query1' },
      { kinds: [1], authors: ['author2'], search: 'query2' },
    ];
    
    // Different search queries prevent merging
    const reduced = reduceFilters(filters);
    expect(reduced).toHaveLength(2);
  });
});

