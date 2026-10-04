import type { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { BranchPlan } from './plan';
import { QueryError, QUERY_LIMITS } from './ast';

export function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Search aborted', 'AbortError');
}
export function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('Search aborted', 'AbortError'));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
export async function mapBounded<T, R>(items: T[], fn: (item: T, index: number) => Promise<R>, signal?: AbortSignal): Promise<R[]> {
  let cursor = 0;
  const results: R[] = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(QUERY_LIMITS.concurrent, items.length) }, async () => {
    while (cursor < items.length) {
      checkAbort(signal);
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }));
  return results;
}
export async function resolvePlans(plans: BranchPlan[], resolve: (token: string) => Promise<string[]>, signal?: AbortSignal): Promise<NDKFilter[]> {
  const tokens = [...new Set(plans.flatMap(p => [...p.authors.flat(), ...p.mentions.flat()]))];
  const resolved = new Map<string, string[]>();
  await mapBounded(tokens, async token => {
    const keys = await resolve(token);
    checkAbort(signal);
    if (!keys.length) throw new QueryError(`Could not resolve '${token}'. Check the name or log in for @me / @contacts`);
    resolved.set(token, keys);
  }, signal);
  return plans.map(plan => {
    const filter: NDKFilter = { ...plan.filter };
    for (const group of plan.authors) {
      const keys = [...new Set(group.flatMap(t => resolved.get(t)!))];
      filter.authors = filter.authors ? filter.authors.filter(k => keys.includes(k)) : keys;
      if (!filter.authors.length) throw new QueryError('Author filters contradict each other. Use OR for alternatives');
    }
    if (plan.mentions.length) filter['#p'] = [...new Set(plan.mentions[0].flatMap(t => resolved.get(t)!))];
    return filter;
  });
}
export function matchesStructured(event: NDKEvent, filter: NDKFilter): boolean {
  if (filter.kinds?.length && !filter.kinds.includes(event.kind)) return false;
  if (filter.authors?.length && !filter.authors.includes(event.pubkey)) return false;
  if (filter.ids?.length && !filter.ids.includes(event.id)) return false;
  if (filter.since !== undefined && (event.created_at ?? 0) < filter.since) return false;
  if (filter.until !== undefined && (event.created_at ?? 0) > filter.until) return false;
  for (const [key, values] of Object.entries(filter)) {
    if (key.startsWith('#') && Array.isArray(values) && !event.tags.some(t => t[0] === key.slice(1) && (values as unknown[]).includes(t[1]))) return false;
  }
  return true;
}
// Decode direct identifiers into filters, so they also work inside OR groups.
export function identifierFilter(value: string): NDKFilter | undefined {
  if (/^[0-9a-f]{64}$/i.test(value)) return { ids: [value.toLowerCase()] };
  if (!/^(note|nevent|naddr|npub|nprofile)1/i.test(value)) return undefined;
  try {
    const decoded = nip19.decode(value);
    switch (decoded.type) {
      case 'note': return { ids: [decoded.data] };
      case 'nevent': return { ids: [decoded.data.id] };
      case 'npub': return { authors: [decoded.data] };
      case 'nprofile': return { authors: [decoded.data.pubkey] };
      case 'naddr': return { authors: [decoded.data.pubkey], kinds: [decoded.data.kind], '#d': [decoded.data.identifier] };
    }
  } catch { throw new QueryError('Invalid Nostr identifier'); }
  return undefined;
}
