import { extractListingMetadata, formatPrice } from '../listingUtils';
import { NDKEvent } from '@nostr-dev-kit/ndk';

function makeListingEvent(tags: string[][]): NDKEvent {
  return { tags, content: 'A great listing' } as unknown as NDKEvent;
}

describe('extractListingMetadata', () => {
  it('extracts all listing tags', () => {
    const event = makeListingEvent([
      ['title', 'Vintage Guitar'],
      ['summary', 'Great condition 1965 Fender'],
      ['price', '2500', 'USD', ''],
      ['location', 'Austin, TX'],
      ['status', 'active'],
      ['image', 'https://example.com/guitar.jpg'],
      ['published_at', '1700000000'],
      ['g', '9v6kp'],
      ['t', 'music'],
      ['t', 'guitar'],
    ]);
    const meta = extractListingMetadata(event);
    expect(meta.title).toBe('Vintage Guitar');
    expect(meta.summary).toBe('Great condition 1965 Fender');
    expect(meta.price).toBe('2500');
    expect(meta.currency).toBe('USD');
    expect(meta.location).toBe('Austin, TX');
    expect(meta.status).toBe('active');
    expect(meta.image).toBe('https://example.com/guitar.jpg');
    expect(meta.publishedAt).toBe(1700000000);
    expect(meta.geohash).toBe('9v6kp');
    expect(meta.hashtags).toEqual(['music', 'guitar']);
  });

  it('handles missing tags gracefully', () => {
    const event = makeListingEvent([['title', 'Bare Listing']]);
    const meta = extractListingMetadata(event);
    expect(meta.title).toBe('Bare Listing');
    expect(meta.price).toBe('');
    expect(meta.location).toBe('');
    expect(meta.image).toBe('');
    expect(meta.hashtags).toEqual([]);
  });

  it('extracts price with frequency', () => {
    const event = makeListingEvent([
      ['price', '500', 'EUR', 'month'],
    ]);
    const meta = extractListingMetadata(event);
    expect(meta.price).toBe('500');
    expect(meta.currency).toBe('EUR');
    expect(meta.frequency).toBe('month');
  });

  it('uses first image only', () => {
    const event = makeListingEvent([
      ['image', 'https://example.com/first.jpg'],
      ['image', 'https://example.com/second.jpg'],
    ]);
    const meta = extractListingMetadata(event);
    expect(meta.image).toBe('https://example.com/first.jpg');
  });
});

describe('formatPrice', () => {
  it('formats USD with symbol', () => {
    expect(formatPrice('2500', 'USD', '')).toBe('$2,500');
  });

  it('formats EUR with frequency', () => {
    expect(formatPrice('500', 'EUR', 'month')).toBe('€500/month');
  });

  it('formats sats', () => {
    expect(formatPrice('50000', 'SATS', '')).toBe('50,000 sats');
  });

  it('formats BTC with symbol', () => {
    expect(formatPrice('0.5', 'BTC', '')).toBe('₿0.5');
  });

  it('formats unknown currency with code', () => {
    expect(formatPrice('1000', 'CHF', '')).toBe('1,000 CHF');
  });

  it('returns empty for no price', () => {
    expect(formatPrice('', 'USD', '')).toBe('');
  });
});
