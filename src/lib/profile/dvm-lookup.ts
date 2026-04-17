import { NDKEvent } from '@nostr-dev-kit/ndk';
import { getStoredPubkey } from '../nip07';
import { queryVertexDVM, VERTEX_REGEXP } from './dvm-core';

// Lookup profile using Vertex DVM with fallback
export async function lookupVertexProfile(query: string, fallbackLookup: (username: string) => Promise<NDKEvent | null>): Promise<NDKEvent | null> {
  const match = query.match(VERTEX_REGEXP);
  if (!match) return null;
  
  const username = match[1].toLowerCase();

  // If not logged in, skip DVM entirely
  if (!getStoredPubkey()) {
    try { return await fallbackLookup(username); } catch { return null; }
  }

  // Run DVM query and fallback in parallel; return the first non-null result
  const dvmPromise: Promise<NDKEvent | null> = (async () => {
    try {
      const events = await queryVertexDVM(username);
      return events[0] ?? null;
    } catch (error) {
      if ((error as Error)?.message === 'VERTEX_NO_CREDITS') {
        return null;
      }
      console.warn('Vertex DVM query failed, will rely on fallback if available:', error);
      return null;
    }
  })();

  const fallbackPromise: Promise<NDKEvent | null> = fallbackLookup(username).catch((e) => {
    console.error('Fallback profile lookup failed:', e);
    return null;
  });

  // Helper to suppress null resolutions so Promise.race yields the first non-null
  const firstNonNull = <T,>(p: Promise<T | null>) => p.then((v) => (v !== null ? v : new Promise<never>(() => {})));

  try {
    const first = await Promise.race([
      firstNonNull(dvmPromise),
      firstNonNull(fallbackPromise)
    ]);
    if (first) return first;
  } catch {}

  // If neither produced a non-null quickly, await both and return whichever is available
  const [dvmRes, fbRes] = await Promise.all([dvmPromise, fallbackPromise]);
  return dvmRes || fbRes;
}
