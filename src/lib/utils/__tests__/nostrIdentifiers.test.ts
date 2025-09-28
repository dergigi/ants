import { extractNip19IdentifiersFromUrl } from '@/lib/utils/nostrIdentifiers';

const SAMPLE_NADDR = 'naddr1qq2k642sveax7uzf0far2k2kg3uh5urdgvu5xq3qgzuushllat7pet0ccv9yuhygvc8ldeyhrgxuwg744dn5khnpk3gsxpqqqp65w3vgu9p';
const SAMPLE_NOTE = 'note13jynfu5wtakjj3alup45qdta9ezkawcz37yqrzhyfup95pscq6ysgsr0n4';

describe('extractNip19IdentifiersFromUrl', () => {
  it('extracts identifiers from pathname segments', () => {
    const url = `https://nostr.at/${SAMPLE_NADDR}`;
    const identifiers = extractNip19IdentifiersFromUrl(url);
    expect(identifiers).toEqual([SAMPLE_NADDR]);
  });

  it('extracts identifiers from nested paths', () => {
    const url = `https://primal.net/e/${SAMPLE_NOTE}`;
    const identifiers = extractNip19IdentifiersFromUrl(url);
    expect(identifiers).toEqual([SAMPLE_NOTE]);
  });

  it('extracts identifiers inside encoded query parameters', () => {
    const value = encodeURIComponent(`nostr:${SAMPLE_NADDR}`);
    const url = `https://example.com/?pointer=${value}`;
    const identifiers = extractNip19IdentifiersFromUrl(url);
    expect(identifiers).toEqual([SAMPLE_NADDR]);
  });

  it('deduplicates identifiers encountered multiple times', () => {
    const url = `https://example.com/${SAMPLE_NOTE}?id=${SAMPLE_NOTE}`;
    const identifiers = extractNip19IdentifiersFromUrl(url);
    expect(identifiers).toEqual([SAMPLE_NOTE]);
  });

  it('detects identifiers in freeform text snippets', () => {
    const text = `Check this out: ${SAMPLE_NADDR} and let me know.`;
    const identifiers = extractNip19IdentifiersFromUrl(text);
    expect(identifiers).toEqual([SAMPLE_NADDR]);
  });
});

