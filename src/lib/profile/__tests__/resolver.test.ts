import { NDKEvent } from '@nostr-dev-kit/ndk';

// Track how many times searchProfilesFullText is called
let searchCallCount = 0;

jest.mock('../search', () => ({
  searchProfilesFullText: jest.fn(() => {
    searchCallCount++;
    // Simulate network delay
    return new Promise<NDKEvent[]>((resolve) => {
      setTimeout(() => {
        const mockEvent = {
          id: 'mock-event-id',
          pubkey: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
          kind: 0,
          content: JSON.stringify({ name: 'dergigi', display_name: 'Gigi' }),
          created_at: 1700000000,
          tags: [],
          author: { pubkey: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234' },
        } as unknown as NDKEvent;
        resolve([mockEvent]);
      }, 100);
    });
  }),
}));

jest.mock('../nip05', () => ({
  resolveNip05ToPubkey: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('../utils', () => ({
  profileEventFromPubkey: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('../username-cache', () => {
  const cache = new Map<string, NDKEvent | null>();
  return {
    getCachedUsername: jest.fn((key: string) => cache.get(key)),
    setCachedUsername: jest.fn((key: string, val: NDKEvent | null) => cache.set(key, val)),
  };
});

jest.mock('../profile-event-cache', () => ({
  getCachedProfileEvent: jest.fn(() => null),
  setCachedProfileEvent: jest.fn(),
}));

import { resolveAuthor } from '../resolver';

describe('resolveAuthor', () => {
  beforeEach(() => {
    searchCallCount = 0;
    jest.clearAllMocks();
  });

  test('resolves a username to a pubkey', async () => {
    const result = await resolveAuthor('dergigi');
    expect(result.pubkeyHex).toBe('abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234');
    expect(searchCallCount).toBe(1);
  });

  test('concurrent calls for the same username only fire one network request', async () => {
    // Fire 5 concurrent resolutions for the same username
    const promises = [
      resolveAuthor('satoshi'),
      resolveAuthor('satoshi'),
      resolveAuthor('satoshi'),
      resolveAuthor('SATOSHI'),  // case-insensitive dedup
      resolveAuthor('Satoshi'),
    ];

    const results = await Promise.all(promises);

    // All should resolve to the same pubkey
    for (const result of results) {
      expect(result.pubkeyHex).toBe('abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234');
    }

    // searchProfilesFullText should only be called ONCE
    expect(searchCallCount).toBe(1);
  });

  test('different usernames fire separate requests', async () => {
    const promises = [
      resolveAuthor('alice'),
      resolveAuthor('bob'),
    ];

    await Promise.all(promises);

    // Two different usernames = two separate calls
    expect(searchCallCount).toBe(2);
  });

  test('npub input decodes directly without network call', async () => {
    const npub = 'npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc';
    const result = await resolveAuthor(npub);

    expect(result.pubkeyHex).toBeTruthy();
    // Should NOT call searchProfilesFullText for npub input
    expect(searchCallCount).toBe(0);
  });

  test('empty input returns null', async () => {
    const result = await resolveAuthor('');
    expect(result.pubkeyHex).toBeNull();
    expect(searchCallCount).toBe(0);
  });
});
