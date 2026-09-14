import { EventEmitter } from 'node:events';
import type { NDKEvent, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { createPartialEmitter, subscribeAndCollect } from '../subscriptions';
import { safeSubscribe } from '../../ndk';
import { getSearchRelaySet } from '../relayManagement';
import { filterNip50Relays } from '../../relays';
import { trackEventRelay } from '../../eventRelayTracking';

jest.mock('@nostr-dev-kit/ndk', () => ({ NDKSubscriptionCacheUsage: { ONLY_RELAY: 'relay' } }));
jest.mock('../../ndk', () => ({ safeSubscribe: jest.fn(), isValidFilter: () => true, markRelayActivity: jest.fn() }));
jest.mock('../../urlUtils', () => ({ normalizeRelayUrl: (url: string) => url }));
jest.mock('../../eventRelayTracking', () => ({ trackEventRelay: jest.fn() }));
jest.mock('../../relays', () => ({ filterNip50Relays: jest.fn(), getNip50SearchRelaySet: jest.fn(), createRelaySet: jest.fn() }));
jest.mock('../relayManagement', () => ({ getSearchRelaySet: jest.fn() }));

const relaySet = { relays: new Set([{ url: 'wss://search.example' }]) } as unknown as NDKRelaySet;
const event = (id: string, created_at = 1) => ({ id, created_at }) as NDKEvent;
let sub: EventEmitter & { start: jest.Mock; stop: jest.Mock };

beforeEach(() => {
  jest.useFakeTimers({ now: 1000 });
  jest.clearAllMocks();
  sub = Object.assign(new EventEmitter(), { start: jest.fn(), stop: jest.fn() });
  jest.mocked(safeSubscribe).mockReturnValue(sub as never);
  jest.mocked(getSearchRelaySet).mockResolvedValue(relaySet);
  jest.mocked(filterNip50Relays).mockResolvedValue(['wss://search.example']);
});
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

async function tick() { await jest.advanceTimersByTimeAsync(0); }

test('timeout includes stalled relay discovery', async () => {
  jest.mocked(getSearchRelaySet).mockReturnValue(new Promise(() => {}));
  const done = jest.fn();
  void subscribeAndCollect({ kinds: [1] }, { timeoutMs: 100 }).then(done);
  await jest.advanceTimersByTimeAsync(100);
  expect(done).toHaveBeenCalledWith([]);
});

test('abort settles immediately during discovery and never opens a late subscription', async () => {
  let resolveRelays!: (value: NDKRelaySet) => void;
  jest.mocked(getSearchRelaySet).mockReturnValue(new Promise((resolve) => { resolveRelays = resolve; }));
  const controller = new AbortController();
  const done = jest.fn();
  void subscribeAndCollect({ kinds: [1] }, { abortSignal: controller.signal }).then(done);
  controller.abort();
  await tick();
  expect(done).toHaveBeenCalledWith([]);
  resolveRelays(relaySet);
  await tick();
  expect(safeSubscribe).not.toHaveBeenCalled();
});

test('timeout includes NIP-50 capability discovery', async () => {
  jest.mocked(filterNip50Relays).mockReturnValue(new Promise(() => {}));
  const done = jest.fn();
  void subscribeAndCollect({ search: 'bitcoin' }, { relaySet, timeoutMs: 100 }).then(done);
  await jest.advanceTimersByTimeAsync(100);
  expect(done).toHaveBeenCalledWith([]);
  expect(safeSubscribe).not.toHaveBeenCalled();
});

test('starts once with listeners attached, then closes and detaches on EOSE', async () => {
  sub.start.mockImplementation(() => { sub.emit('event', event('one')); sub.emit('eose'); });
  const result = await subscribeAndCollect({ kinds: [1] }, { relaySet });
  expect(result.map((evt) => evt.id)).toEqual(['one']);
  expect(safeSubscribe).toHaveBeenCalledWith(expect.anything(), expect.anything(), false);
  expect(sub.start).toHaveBeenCalledTimes(1);
  expect(sub.stop).toHaveBeenCalledTimes(1);
  expect(sub.listenerCount('event')).toBe(0);
  expect(sub.listenerCount('eose')).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
});

test('start failures stop the subscription and clear its timer', async () => {
  sub.start.mockImplementation(() => { throw new Error('start failed'); });
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  await expect(subscribeAndCollect({ kinds: [1] }, { relaySet })).resolves.toEqual([]);
  expect(sub.stop).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
  warning.mockRestore();
});

test('late events after cancellation do no tracking or UI work', async () => {
  const controller = new AbortController();
  const onPartial = jest.fn();
  const result = subscribeAndCollect({ kinds: [1] }, { relaySet, onPartial, abortSignal: controller.signal });
  await tick();
  sub.emit('event', event('one'));
  onPartial.mockClear();
  jest.mocked(trackEventRelay).mockClear();
  controller.abort();
  await result;
  sub.emit('event', event('late'));
  expect(onPartial).not.toHaveBeenCalled();
  expect(trackEventRelay).not.toHaveBeenCalled();
});

test('a throwing UI callback cannot prevent settlement or cleanup', async () => {
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const result = subscribeAndCollect({ kinds: [1] }, { relaySet, onPartial: () => { throw new Error('UI failed'); } });
  await tick();
  expect(() => sub.emit('event', event('one'))).not.toThrow();
  sub.emit('eose');
  await expect(result).resolves.toHaveLength(1);
  expect(sub.stop).toHaveBeenCalledTimes(1);
  warning.mockRestore();
});

test('duplicate batches do not sort and notify the UI again', async () => {
  const notify = jest.fn();
  const emit = createPartialEmitter(notify)!;
  emit([event('one')]);
  for (let i = 0; i < 1000; i++) emit([event('one')]);
  await jest.advanceTimersByTimeAsync(500);
  expect(notify).toHaveBeenCalledTimes(1);
});

test('partials merge different subscriptions and deliver the trailing batch', async () => {
  const notify = jest.fn();
  const emit = createPartialEmitter(notify)!;
  emit([event('old', 1)]);
  emit([event('new', 2)]);
  await jest.advanceTimersByTimeAsync(500);
  expect(notify).toHaveBeenLastCalledWith([event('new', 2), event('old', 1)]);
});

test('abort cancels pending partial updates and rejects later batches', async () => {
  const controller = new AbortController();
  const notify = jest.fn();
  const emit = createPartialEmitter(notify, controller.signal)!;
  emit([event('one')]);
  emit([event('two')]);
  controller.abort();
  emit([event('late')]);
  await jest.advanceTimersByTimeAsync(500);
  expect(notify).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('completion disposes the pending partial timer', async () => {
  const notify = jest.fn();
  const emit = createPartialEmitter(notify)!;
  emit([event('one')]);
  emit([event('two')]);
  emit.dispose();
  emit.dispose();
  await jest.advanceTimersByTimeAsync(500);
  expect(notify).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('10,000 duplicate relay deliveries across 100 batches produce no extra UI updates', async () => {
  const notify = jest.fn();
  const emit = createPartialEmitter(notify)!;
  const events = Array.from({ length: 100 }, (_, i) => event(String(i), i));
  emit(events);
  for (let i = 0; i < 100; i++) {
    await jest.advanceTimersByTimeAsync(500);
    emit(events);
  }
  expect(notify).toHaveBeenCalledTimes(1);
  emit.dispose();
});
