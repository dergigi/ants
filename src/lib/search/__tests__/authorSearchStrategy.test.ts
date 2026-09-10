import type { NDKEvent, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { tryHandleAuthorSearch } from '../strategies/authorSearchStrategy';
import { subscribeAndCollect } from '../subscriptions';
import { profileEventFromPubkey } from '../../vertex';
import { getMuteListResultData } from '../muteListResultData';
import { getNip50SearchRelaySet } from '../../relays/nip50';
import { searchByAnyTerms } from '../termSearch';
import type { SearchContext } from '../types';

jest.mock('@nostr-dev-kit/ndk', () => ({ NDKRelaySet: { fromRelayUrls: () => ({ name: 'broad' }) } }));
jest.mock('../../ndk', () => ({ ndk: {} }));
jest.mock('../../vertex', () => ({
  resolveAuthor: jest.fn(async () => ({ pubkeyHex: 'a'.repeat(64) })),
  profileEventFromPubkey: jest.fn(async () => null),
}));
jest.mock('../../relays', () => ({ RELAYS: { DEFAULT: [], SEARCH: [] } }));
jest.mock('../../relays/nip50', () => ({ getNip50SearchRelaySet: jest.fn() }));
jest.mock('../subscriptions', () => ({ subscribeAndCollect: jest.fn() }));
jest.mock('../termSearch', () => ({ searchByAnyTerms: jest.fn(async () => []) }));

const nip50 = { name: 'nip50' } as unknown as NDKRelaySet;
const chosen = { name: 'chosen' } as unknown as NDKRelaySet;
const context: SearchContext = { effectiveKinds: [1], chosenRelaySet: chosen, limit: 20 };
const subscribe = jest.mocked(subscribeAndCollect);

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getNip50SearchRelaySet).mockResolvedValue(nip50);
  subscribe.mockResolvedValue([]);
});

test.each(['bitcoin by:alice', '(bitcoin OR nostr) by:alice'])('uses NIP-50 relays on all search subscriptions: %s', async (query) => {
  await tryHandleAuthorSearch(query, context);
  const calls = subscribe.mock.calls.filter(([filter]) => 'search' in filter);
  expect(calls.length).toBeGreaterThan(0);
  for (const [, options] of calls) expect(options).toMatchObject({ relaySet: nip50 });
  if (query.startsWith('(')) {
    expect(jest.mocked(searchByAnyTerms).mock.calls[0][2]).toBe(nip50);
    await expect(jest.mocked(searchByAnyTerms).mock.calls[0][6]!()).resolves.toBe(nip50);
  }
});

test('keeps direct author searches on the chosen relay set', async () => {
  subscribe.mockResolvedValue([{ id: 'event', created_at: 1 }] as NDKEvent[]);
  await tryHandleAuthorSearch('by:alice', context);
  expect(subscribe.mock.calls[0][0]).not.toHaveProperty('search');
  expect(subscribe.mock.calls[0][1]).toMatchObject({ relaySet: chosen });
  expect(getNip50SearchRelaySet).not.toHaveBeenCalled();
});

test('preserves the original mute event and resolves unique valid public p tags', async () => {
  const pubkey = 'b'.repeat(64);
  const event = { id: 'mute', kind: 10000, created_at: 1, content: 'encrypted', tags: [
    ['p', pubkey], ['p', pubkey.toUpperCase()], ['p', 'invalid'], ['e', 'c'.repeat(64)],
  ] } as NDKEvent;
  const original = JSON.stringify(event);
  subscribe.mockResolvedValue([event]);
  const result = await tryHandleAuthorSearch('by:alice', { ...context, effectiveKinds: [10000] });
  expect(result).toEqual([event]);
  expect(result?.[0]).toBe(event);
  expect(JSON.stringify(event)).toBe(original);
  expect(getMuteListResultData(event)?.pubkeys).toEqual([pubkey]);
  expect(profileEventFromPubkey).toHaveBeenCalledTimes(1);
  expect(profileEventFromPubkey).toHaveBeenCalledWith(pubkey);
});
