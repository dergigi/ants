import type { NDKEvent } from '@nostr-dev-kit/ndk';
import { ResultStore, retainedBytes } from '../query/resultStore';
import { planQuery } from '../query/plan';
import { resolvePreviewAuthors } from '../query/preview';
const event = (id: string, content = '') => ({ id, content, tags: [], pubkey: 'a'.repeat(64) } as unknown as NDKEvent);

test('deduplicates canonical payloads and includes hidden auxiliary events in the budget', () => {
  const stop = jest.fn(), store = new ResultStore(stop, 2);
  const first = event('first');
  store.keep(first);
  expect(store.keep(event('first', 'different instance'))).toBe(first);
  store.keep(event('profile'), false);
  expect(store.values()).toEqual([first]);
  expect(store.keep(event('third'))).toBeUndefined();
  expect(stop).toHaveBeenCalledTimes(1);
});
test('accounts for UTF-16 content and tags before retaining the payload', () => {
  const first = event('first', '🌍');
  first.tags = [['p', 'b'.repeat(64)]];
  const stop = jest.fn(), store = new ResultStore(stop, 500, retainedBytes(first));
  expect(store.keep(first)).toBe(first);
  expect(store.keep(event('next'))).toBeUndefined();
  expect(store.values()).toEqual([first]);
  expect(stop).toHaveBeenCalledTimes(1);
});
test('contact preview stays compact while individual names still resolve to npubs', async () => {
  const resolve = jest.fn(async () => ['a'.repeat(64)]);
  const plan = planQuery('by:@contacts OR by:dergigi', [], [1]);
  const preview = await resolvePreviewAuthors(plan.leaves, resolve);
  expect(resolve).toHaveBeenCalledTimes(1);
  expect(resolve).toHaveBeenCalledWith('dergigi');
  expect(preview.flat().flatMap(node => node.value.split(','))).toContain('@contacts');
  expect(preview.flat().flatMap(node => node.value.split(',')).some(value => value.startsWith('npub1'))).toBe(true);
});
