import { NDKEvent } from '@nostr-dev-kit/ndk';

export interface ListingMetadata {
  title: string;
  summary: string;
  price: string;
  currency: string;
  frequency: string;
  location: string;
  status: string;
  image: string;
  publishedAt: number | null;
  hashtags: string[];
  geohash: string;
}

/**
 * Extract classified listing metadata from a kind 30402 event's tags.
 */
export function extractListingMetadata(event: NDKEvent): ListingMetadata {
  let title = '';
  let summary = '';
  let price = '';
  let currency = '';
  let frequency = '';
  let location = '';
  let status = '';
  let image = '';
  let publishedAt: number | null = null;
  let geohash = '';
  const hashtags: string[] = [];

  for (const tag of event.tags) {
    if (!Array.isArray(tag) || tag.length < 2) continue;
    switch (tag[0]) {
      case 'title':
        title = tag[1];
        break;
      case 'summary':
        summary = tag[1];
        break;
      case 'price':
        price = tag[1];
        currency = tag[2] || '';
        frequency = tag[3] || '';
        break;
      case 'location':
        location = tag[1];
        break;
      case 'status':
        status = tag[1];
        break;
      case 'image':
        if (!image) image = tag[1]; // first image only
        break;
      case 'published_at':
        publishedAt = parseInt(tag[1], 10) || null;
        break;
      case 'g':
        geohash = tag[1];
        break;
      case 't':
        hashtags.push(tag[1].toLowerCase());
        break;
    }
  }

  return { title, summary, price, currency, frequency, location, status, image, publishedAt, hashtags, geohash };
}

/**
 * Format a price with currency symbol and optional frequency.
 * e.g., "$500/month", "€1,200", "50,000 sats"
 */
export function formatPrice(price: string, currency: string, frequency: string): string {
  if (!price) return '';

  const currencySymbols: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', JPY: '¥', BTC: '₿',
    SAT: '', SATS: '',
  };

  const upper = currency.toUpperCase();
  const symbol = currencySymbols[upper];
  const isSats = upper === 'SAT' || upper === 'SATS';

  let formatted: string;
  if (symbol !== undefined) {
    formatted = isSats ? `${Number(price).toLocaleString()} sats` : `${symbol}${Number(price).toLocaleString()}`;
  } else {
    formatted = `${Number(price).toLocaleString()} ${currency}`;
  }

  if (frequency) {
    formatted += `/${frequency}`;
  }

  return formatted;
}
