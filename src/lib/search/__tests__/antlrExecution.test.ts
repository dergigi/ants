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

test('overall timeout preserves successful branches and reports incomplete results', async () => {
  jest.useFakeTimers();
  try {
    const partial = event('partial');
    subscribe.mockImplementation(async (filter, options) => {
      if (filter.search === 'fast') { options?.onPartial?.([partial]); return [partial]; }
      return new Promise(resolve => options?.abortSignal?.addEventListener('abort', () => resolve([]), { once: true }));
    });
    const onIncomplete = jest.fn();
    const work = searchEvents('fast OR slow', 200, { onIncomplete });
    await jest.advanceTimersByTimeAsync(30000);
    expect(await work).toEqual([partial]);
    expect(onIncomplete).toHaveBeenCalledWith(expect.stringContaining('timed out'));
  } finally { jest.useRealTimers(); }
});
test('caller cancellation still rejects rather than reporting a completed partial search', async () => {
  const controller = new AbortController();
  const onIncomplete = jest.fn();
  subscribe.mockImplementation(async (_filter, options) => {
    options?.onPartial?.([event('partial')]);
    controller.abort();
    return [];
  });
  await expect(searchEvents('a', 200, { onIncomplete }, undefined, controller.signal)).rejects.toThrow('Search aborted');
  expect(onIncomplete).not.toHaveBeenCalled();
});
test('global event budget caps the union and stops queued branches', async () => {
  subscribe.mockImplementation(async (filter, options) => {
    const events = Array.from({ length: 300 }, (_, i) => event(`${filter.search}-${i}`));
    const accepted = events.filter(e => options?.accept?.(e));
    options?.onPartial?.(accepted);
    return accepted;
  });
  const onIncomplete = jest.fn();
  const results = await searchEvents('a OR b OR c OR d OR e OR f', 500, { onIncomplete });
  expect(results).toHaveLength(500);
  expect(new Set(results.map(e => e.id)).size).toBe(500);
  expect(subscribe.mock.calls.length).toBeLessThanOrEqual(4);
  expect(onIncomplete).toHaveBeenCalledWith(expect.stringContaining('limit'));
});
test('oversized payload stops collection while retaining earlier events', async () => {
  const first = event('first');
  subscribe.mockImplementation(async (_filter, options) => {
    const events = [first, { ...event('oversized'), content: 'x'.repeat(5 * 1024 * 1024) } as NDKEvent];
    return events.filter(e => options?.accept?.(e));
  });
  const onIncomplete = jest.fn();
  expect(await searchEvents('a', 200, { onIncomplete })).toEqual([first]);
  expect(onIncomplete).toHaveBeenCalledWith(expect.stringContaining('limit'));
});
test('large follow lists fail before opening a search subscription', async () => {
  jest.mocked(resolveAuthorTokens).mockResolvedValueOnce(Array.from({ length: 5001 }, (_, i) => i.toString(16).padStart(64, '0')));
  await expect(searchEvents('by:@contacts')).rejects.toThrow('5000-contact');
  expect(subscribe).not.toHaveBeenCalled();
});
test('mute-list searches return one representative and retain expanded data', async () => {
  const { expandMuteListResults } = await import('../muteListSearch');
  const { getMuteListResultData } = await import('../muteListResultData');
  const first = event('new', 10000), older = event('old', 10000);
  first.pubkey = older.pubkey = 'alice'.padEnd(64, '0'); older.created_at = 1;
  subscribe.mockResolvedValueOnce([older, first]);
  const data = { pubkeys: ['a'.repeat(64)], profiles: [event('profile', 0)] };
  jest.mocked(expandMuteListResults).mockResolvedValueOnce(data);
  expect(await searchEvents('kind:10000 by:alice')).toEqual([first]);
  expect(getMuteListResultData(first)).toEqual(data);
});

test('timeout before identity resolution reports incomplete empty results without subscribing', async () => {
  jest.useFakeTimers();
  try {
    jest.mocked(resolveAuthorTokens).mockImplementationOnce(() => new Promise(() => {}));
    const onIncomplete = jest.fn();
    const work = searchEvents('by:stalled-identity', 200, { onIncomplete });
    await jest.advanceTimersByTimeAsync(30000);
    expect(await work).toEqual([]);
    expect(onIncomplete).toHaveBeenCalledTimes(1);
    expect(subscribe).not.toHaveBeenCalled();
  } finally { jest.useRealTimers(); }
});
test('profile budget keeps collected ranking and ignores later updates after truncation', async () => {
  const { tryHandleProfileSearch } = await import('../strategies/profileSearchStrategy');
  let update: ((events: NDKEvent[]) => void) | undefined;
  const profiles = Array.from({ length: 501 }, (_, i) => event(`profile-${i}`, 0));
  jest.mocked(tryHandleProfileSearch).mockImplementationOnce(async (_query, context) => {
    update = context.onProfileResultsUpdate;
    return profiles;
  });
  const onIncomplete = jest.fn(), onProfileResultsUpdate = jest.fn();
  expect(await searchEvents('p:alice', 500, { onIncomplete, onProfileResultsUpdate })).toEqual(profiles.slice(0, 500));
  update?.([profiles[500]]);
  expect(onProfileResultsUpdate).not.toHaveBeenCalled();
  expect(onIncomplete).toHaveBeenCalledTimes(1);
});
test('events violating structured constraints do not consume the result budget', async () => {
  subscribe.mockImplementation(async (_filter, options) => {
    const events = [...Array.from({ length: 501 }, (_, i) => event(`invalid-${i}`, 20)), event('valid')];
    return events.filter(e => options?.accept?.(e));
  });
  const onIncomplete = jest.fn();
  expect((await searchEvents('kind:1', 200, { onIncomplete })).map(e => e.id)).toEqual(['valid']);
  expect(onIncomplete).not.toHaveBeenCalled();
});

test('direct identifiers retain results even without a partial-results callback', async () => {
  const { nip19 } = await import('nostr-tools');
  const { searchByNip19Identifier } = await import('../idLookup');
  const result = event('a'.repeat(64));
  jest.mocked(searchByNip19Identifier).mockResolvedValueOnce([result]);
  expect(await searchEvents(nip19.noteEncode(result.id))).toEqual([result]);
});
