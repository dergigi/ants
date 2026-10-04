import type { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';

jest.mock('../../ndk', () => ({ connectWithTimeout: jest.fn(async () => {}), resetLastReducedFilters: jest.fn() }));
jest.mock('../../relays', () => ({ getNip50SearchRelaySet: jest.fn(async () => ({})) }));
jest.mock('../relayManagement', () => ({ getBroadRelaySet: jest.fn(async () => ({})) }));
jest.mock('../replacements', () => ({ loadRules: jest.fn(async () => []) }));
jest.mock('../authorResolve', () => ({ resolveAuthorTokens: jest.fn(async ([token]: string[]) => [token.padEnd(64, '0')]) }));
jest.mock('../strategies/profileSearchStrategy', () => ({ tryHandleProfileSearch: jest.fn(async () => []) }));
jest.mock('../muteListSearch', () => ({ expandMuteListResults: jest.fn(), emitMuteListPartialResults: jest.fn() }));
jest.mock('../idLookup', () => ({ searchByNip19Identifier: jest.fn(async () => []) }));
jest.mock('../subscriptions', () => ({
  subscribeAndCollect: jest.fn(async () => []),
  createPartialEmitter: jest.fn(callback => callback ? Object.assign(callback, { dispose: jest.fn() }) : undefined)
}));

import { searchEvents } from '../../search';
import { subscribeAndCollect } from '../subscriptions';
import { resolveAuthorTokens } from '../authorResolve';
import { connectWithTimeout } from '../../ndk';
import { mapBounded, matchesStructured } from '../query/execute';

const subscribe = jest.mocked(subscribeAndCollect);
const event = (id: string, kind = 1): NDKEvent => ({ id, kind, pubkey: 'a'.repeat(64), tags: [], created_at: 100 } as unknown as NDKEvent);

beforeEach(() => { jest.clearAllMocks(); subscribe.mockResolvedValue([]); });

test('keeps correlated authors and kinds in separate subscriptions', async () => {
  await searchEvents('(by:alice kind:1) OR (by:bob kind:30023)');
  expect(subscribe.mock.calls.map(([filter]) => filter)).toEqual([
    { authors: ['alice'.padEnd(64, '0')], kinds: [1], limit: 200 },
    { authors: ['bob'.padEnd(64, '0')], kinds: [30023], limit: 200 }
  ]);
});
test('unions and deduplicates branch results', async () => {
  subscribe.mockResolvedValueOnce([event('same'), event('first')]).mockResolvedValueOnce([event('same'), event('second')]);
  expect((await searchEvents('a OR b')).map(e => e.id)).toEqual(['same', 'first', 'second']);
});
test('retains branch-specific dates, quotes, mentions and text together', async () => {
  await searchEvents('"(a OR b)" by:alice mentions:bob since:2024-01-01 OR kind:20 since:2025-01-01');
  expect(subscribe.mock.calls[0][0]).toMatchObject({ search: '"(a OR b)"', authors: ['alice'.padEnd(64, '0')], '#p': ['bob'.padEnd(64, '0')], since: 1704067200 });
  expect(subscribe.mock.calls[1][0]).toMatchObject({ kinds: [20], since: 1735689600 });
});
test('rejects malformed and oversized plans before resolving authors or connecting', async () => {
  await expect(searchEvents('by:alice (a OR)')).rejects.toThrow('Invalid search');
  await expect(searchEvents('by:alice ' + Array.from({ length: 6 }, (_, i) => `(a${i} OR b${i})`).join(' '))).rejects.toThrow('32 branches');
  expect(resolveAuthorTokens).not.toHaveBeenCalled();
  expect(connectWithTimeout).not.toHaveBeenCalled();
  expect(subscribe).not.toHaveBeenCalled();
});
test('unresolved identities never broaden the query', async () => {
  jest.mocked(resolveAuthorTokens).mockResolvedValueOnce([]);
  await expect(searchEvents('by:missing')).rejects.toThrow('Could not resolve');
  expect(subscribe).not.toHaveBeenCalled();
});
test('memoizes repeated identity resolution across branches', async () => {
  await searchEvents('(a OR b OR c) by:alice');
  expect(resolveAuthorTokens).toHaveBeenCalledTimes(1);
});
test('bounds branch concurrency and does not start queued work after cancellation', async () => {
  const controller = new AbortController();
  const releases: (() => void)[] = [];
  const started: number[] = [];
  const work = mapBounded([0, 1, 2, 3, 4, 5], async n => {
    started.push(n);
    await new Promise<void>(r => releases.push(r));
  }, controller.signal);
  expect(started).toEqual([0, 1, 2, 3]);
  controller.abort();
  releases.forEach(r => r());
  await expect(work).rejects.toThrow('Search aborted');
  expect(started).toEqual([0, 1, 2, 3]);
});
test('branch admission rejects relay events outside structured constraints', () => {
  const filter: NDKFilter = { kinds: [1], authors: ['a'.repeat(64)], since: 90, until: 110, '#t': ['nostr'] };
  const matching = event('yes'); matching.tags = [['t', 'nostr']];
  expect(matchesStructured(matching, filter)).toBe(true);
  expect(matchesStructured(event('wrongtag'), filter)).toBe(false);
  expect(matchesStructured({ ...matching, kind: 20 } as NDKEvent, filter)).toBe(false);
  expect(matchesStructured({ ...matching, created_at: 89 } as NDKEvent, filter)).toBe(false);
});

test('preserves profile ranking and delivers later ranking updates until caller cancellation', async () => {
  const { tryHandleProfileSearch } = await import('../strategies/profileSearchStrategy');
  const first = event('ranked-first', 0), second = event('newer', 0);
  first.created_at = 1; second.created_at = 200;
  let update: ((events: NDKEvent[]) => void) | undefined;
  jest.mocked(tryHandleProfileSearch).mockImplementationOnce(async (_query, context) => {
    update = context.onProfileResultsUpdate;
    return [first, second];
  });
  const onProfileResultsUpdate = jest.fn();
  const controller = new AbortController();
  expect((await searchEvents('p:alice', 200, { onProfileResultsUpdate }, undefined, controller.signal)).map(e => e.id)).toEqual(['ranked-first', 'newer']);
  update?.([second, first]);
  expect(onProfileResultsUpdate).toHaveBeenCalledWith([second, first]);
  controller.abort();
  update?.([first]);
  expect(onProfileResultsUpdate).toHaveBeenCalledTimes(1);
});

test('exact matching quotes text without swallowing NIP-50 extensions', async () => {
  await searchEvents('hello world language:en', 200, { exact: true });
  expect(subscribe.mock.calls[0][0].search).toBe('"hello world" language:en');
});
