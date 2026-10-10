import { EventEmitter } from 'node:events';
import type { NDKEvent, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { safeSubscribe } from '../../ndk';
import { clearOutboxCache, getOutboxRelaySet } from '../outbox';

jest.mock('../../ndk', () => ({ ndk: {}, safeSubscribe: jest.fn() }));
jest.mock('@nostr-dev-kit/ndk', () => ({
  NDKSubscriptionCacheUsage: { ONLY_RELAY: 'relay' },
  NDKRelaySet: { fromRelayUrls: (urls: string[]) => ({ relays: new Set(urls.map(url => ({ url }))) }) }
}));

const alice = 'a'.repeat(64), bob = 'b'.repeat(64);
const fallback = { relays: new Set([{ url: 'wss://fallback.example' }]) } as unknown as NDKRelaySet;
const urls = (set: NDKRelaySet) => [...set.relays].map(relay => relay.url);
const list = (pubkey: string, tags: string[][], created_at = 1, id = 'a') =>
  ({ kind: 10002, pubkey, tags, created_at, id }) as NDKEvent;
let sub: EventEmitter & { start: jest.Mock; stop: jest.Mock };

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  clearOutboxCache();
  sub = Object.assign(new EventEmitter(), { start: jest.fn(), stop: jest.fn() });
  jest.mocked(safeSubscribe).mockReturnValue(sub as never);
});
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

function deliver(events: NDKEvent[]) {
  sub.start.mockImplementation(() => { events.forEach(event => sub.emit('event', event)); sub.emit('eose'); });
}

test('routes authors to write relays and mentions to read relays while keeping fallbacks', async () => {
  deliver([
    list(alice, [['r', 'wss://alice-write.example', 'write'], ['r', 'wss://alice-read.example', 'read'], ['r', 'wss://both.example']]),
    list(bob, [['r', 'wss://bob-write.example', 'write'], ['r', 'wss://bob-read.example', 'read']])
  ]);
  expect(urls(await getOutboxRelaySet({ authors: [alice], '#p': [bob] }, fallback))).toEqual([
    'wss://fallback.example', 'wss://alice-write.example', 'wss://both.example', 'wss://bob-read.example'
  ]);
  expect(safeSubscribe).toHaveBeenCalledWith(
    [{ kinds: [10002], authors: [alice, bob], limit: 4 }],
    expect.objectContaining({ relayUrls: expect.arrayContaining(['wss://purplepag.es', 'wss://fallback.example']) }), false
  );
  expect(sub.stop).toHaveBeenCalledTimes(1);
  expect(sub.listenerCount('event')).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
});

test('text searches and queries without people do not discover or expand relays', async () => {
  expect(await getOutboxRelaySet({ search: 'nostr', authors: [alice] }, fallback)).toBe(fallback);
  expect(await getOutboxRelaySet({ kinds: [1] }, fallback)).toBe(fallback);
  expect(safeSubscribe).not.toHaveBeenCalled();
});

test('uses latest lists with deterministic ties and ignores unrelated metadata', async () => {
  deliver([
    list(alice, [['r', 'wss://winner.example']], 2, 'a'),
    list(alice, [['r', 'wss://tie.example']], 2, 'b'),
    list(alice, [['r', 'wss://old.example']], 1),
    { ...list(alice, [['r', 'wss://wrong-kind.example']], 3), kind: 0 } as NDKEvent,
    list(bob, [['r', 'wss://wrong-author.example']], 4)
  ]);
  expect(urls(await getOutboxRelaySet({ authors: [alice] }, fallback))).toEqual(['wss://fallback.example', 'wss://winner.example']);
});

test('rejects insecure or credential-bearing URLs and preserves path and query case', async () => {
  deliver([list(alice, [
    ['r', 'ws://insecure.example'], ['r', 'wss://user:pass@private.example'], ['r', 'wss://fragment.example/#x'],
    ['r', 'not a URL'], ['r', 'wss://VALID.example/Case?Key=Value'], ['r', 'wss://ignored.example', 'other']
  ])]);
  expect(urls(await getOutboxRelaySet({ authors: [alice] }, fallback))).toEqual(['wss://fallback.example', 'wss://valid.example/Case?Key=Value']);
});

test('bounds discovery to 32 people, four relays per direction and 16 additional relays', async () => {
  const keys = Array.from({ length: 40 }, (_, i) => i.toString(16).padStart(64, '0'));
  deliver(keys.map((key, i) => list(key, Array.from({ length: 6 }, (_, j) => ['r', `wss://r${i}-${j}.example`]))));
  const result = urls(await getOutboxRelaySet({ authors: keys }, fallback));
  expect(jest.mocked(safeSubscribe).mock.calls[0][0][0].authors).toHaveLength(32);
  expect(result).toHaveLength(17);
  expect(result).not.toContain('wss://r0-4.example');
});

test('caches positive lists for ten minutes and clears them on relay-cache reset', async () => {
  deliver([list(alice, [['r', 'wss://author.example']])]);
  await getOutboxRelaySet({ authors: [alice] }, fallback);
  await getOutboxRelaySet({ authors: [alice] }, fallback);
  expect(safeSubscribe).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(600_000);
  await getOutboxRelaySet({ authors: [alice] }, fallback);
  expect(safeSubscribe).toHaveBeenCalledTimes(2);
  clearOutboxCache();
  await getOutboxRelaySet({ authors: [alice] }, fallback);
  expect(safeSubscribe).toHaveBeenCalledTimes(3);
});

test('missing lists retain fallback and are retried after one minute', async () => {
  deliver([]);
  expect(await getOutboxRelaySet({ authors: [alice] }, fallback)).toBe(fallback);
  await getOutboxRelaySet({ authors: [alice] }, fallback);
  expect(safeSubscribe).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(60_000);
  await getOutboxRelaySet({ authors: [alice] }, fallback);
  expect(safeSubscribe).toHaveBeenCalledTimes(2);
});

test('discovery times out after four seconds and preserves collected routes', async () => {
  const result = getOutboxRelaySet({ authors: [alice] }, fallback);
  sub.emit('event', list(alice, [['r', 'wss://author.example']]));
  await jest.advanceTimersByTimeAsync(4000);
  expect(urls(await result)).toContain('wss://author.example');
  expect(sub.stop).toHaveBeenCalledTimes(1);
});

test('cancellation cleans up discovery without caching incomplete results', async () => {
  const controller = new AbortController();
  const result = getOutboxRelaySet({ authors: [alice] }, fallback, controller.signal);
  controller.abort();
  expect(await result).toBe(fallback);
  expect(sub.stop).toHaveBeenCalledTimes(1);
  expect(sub.listenerCount('event')).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
  deliver([]);
  await getOutboxRelaySet({ authors: [alice] }, fallback);
  expect(safeSubscribe).toHaveBeenCalledTimes(2);
});

test('reset during discovery prevents stale lists from repopulating the cache', async () => {
  const result = getOutboxRelaySet({ authors: [alice] }, fallback);
  sub.emit('event', list(alice, [['r', 'wss://stale.example']]));
  clearOutboxCache();
  sub.emit('eose');
  expect(await result).toBe(fallback);
});

test('transport failure preserves fallback and cleans up', async () => {
  sub.start.mockImplementation(() => { throw new Error('unavailable'); });
  expect(await getOutboxRelaySet({ authors: [alice] }, fallback)).toBe(fallback);
  expect(sub.stop).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});
