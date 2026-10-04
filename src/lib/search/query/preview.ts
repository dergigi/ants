import { nip19 } from 'nostr-tools';
import { Leaf } from './ast';
import { mapBounded } from './execute';

/** Resolve only parsed identity fields. Quoted text and profile search terms stay literal. */
export async function resolvePreviewAuthors(
  branches: Leaf[][],
  resolve: (token: string) => Promise<string[]>,
  signal?: AbortSignal
): Promise<Leaf[][]> {
  const isIdentity = (n: Leaf) => n.type === 'field' && ['by', 'from', 'mentions'].includes(n.name);
  const tokens = [...new Set(branches.flat().filter(isIdentity).flatMap(n => n.value.split(',')))];
  const resolved = new Map<string, string>();
  await mapBounded(tokens, async token => {
    const keys = await resolve(token);
    if (keys.length) resolved.set(token, keys.map(key => nip19.npubEncode(key)).join(','));
  }, signal);
  return branches.map(branch => branch.map(n => isIdentity(n)
    ? { ...n, value: n.value.split(',').map(token => resolved.get(token) || token).join(','), quoted: false }
    : n));
}
