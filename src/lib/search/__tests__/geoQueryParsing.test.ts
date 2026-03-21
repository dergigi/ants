import { extractGeoFilter } from '../queryParsing';

describe('extractGeoFilter', () => {
  it('extracts g:<geohash> from query', () => {
    const result = extractGeoFilter('bitcoin g:9v6kn');
    expect(result.geohash).toBe('9v6kn');
    expect(result.cleaned).toBe('bitcoin');
  });

  it('extracts near:me flag', () => {
    const result = extractGeoFilter('coffee near:me');
    expect(result.nearMe).toBe(true);
    expect(result.cleaned).toBe('coffee');
  });

  it('extracts both g: and near:me (g: wins)', () => {
    const result = extractGeoFilter('near:me g:dr5re food');
    expect(result.nearMe).toBe(true);
    expect(result.geohash).toBe('dr5re');
    expect(result.cleaned).toBe('food');
  });

  it('returns no geo filter for normal queries', () => {
    const result = extractGeoFilter('bitcoin nostr');
    expect(result.geohash).toBeUndefined();
    expect(result.nearMe).toBe(false);
    expect(result.cleaned).toBe('bitcoin nostr');
  });

  it('handles g: at start of query', () => {
    const result = extractGeoFilter('g:9v6k');
    expect(result.geohash).toBe('9v6k');
    expect(result.cleaned).toBe('');
  });

  it('handles g: at end of query', () => {
    const result = extractGeoFilter('meetup g:u33d');
    expect(result.geohash).toBe('u33d');
    expect(result.cleaned).toBe('meetup');
  });

  it('is case-insensitive for geohash chars', () => {
    const result = extractGeoFilter('g:9V6KN');
    expect(result.geohash).toBe('9v6kn');
  });
});
