import { resolveAuthorTokens } from '../authorResolve';

// Preview and submission share ongoing Vertex work. Persistent profile caching
// remains in the existing resolver; account-dependent tokens are never cached here.
const pending = new Map<string, Promise<string[]>>();
export function resolveQueryAuthor(token: string): Promise<string[]> {
  if (/^@(me|contacts)$/i.test(token)) return resolveAuthorTokens([token]);
  const existing = pending.get(token);
  if (existing) return existing;
  const work = resolveAuthorTokens([token]).finally(() => pending.delete(token));
  pending.set(token, work);
  return work;
}
