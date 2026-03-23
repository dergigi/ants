import { nip19 } from 'nostr-tools';
import { getStoredPubkey } from './nip07';
import { resolveAuthorToNpub } from './vertex';

/** Determine an adaptive debounce based on device/network characteristics */
export function getAdaptiveDebounceMs(): number {
  let delay = 700;
  try {
    const nav: unknown = typeof navigator !== 'undefined' ? navigator : undefined;
    const cores = (nav as { hardwareConcurrency?: number })?.hardwareConcurrency;
    if (typeof cores === 'number') {
      if (cores <= 2) delay += 300;
      else if (cores <= 4) delay += 150;
    }
    const deviceMemory = (nav as { deviceMemory?: number })?.deviceMemory as number | undefined;
    if (typeof deviceMemory === 'number' && deviceMemory > 0 && deviceMemory <= 4) {
      delay += 100;
    }
    const anyNav = nav as { connection?: { effectiveType?: string } } | undefined;
    const effectiveType = anyNav?.connection?.effectiveType || '';
    if (typeof effectiveType === 'string') {
      if (effectiveType.includes('2g') || effectiveType === 'slow-2g') delay += 200;
      else if (effectiveType.includes('3g')) delay += 100;
    }
  } catch {}
  return Math.min(1000, Math.max(700, delay));
}

/** Resolve all by:<author> tokens within a single query string */
export async function resolveByTokensInQuery(
  q: string,
  skipAuthorResolution: boolean,
  authorResolutionCache: Map<string, string>,
  ppProvider: string | null
): Promise<string> {
  const rx = /(^|\s)by:(\S+)/gi;
  let result = '';
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(q)) !== null) {
    const full = m[0];
    const pre = m[1] || '';
    const raw = m[2] || '';
    const match = raw.match(/^([^),.;]+)([),.;]*)$/);
    const core = (match && match[1]) || raw;
    const suffix = (match && match[2]) || '';
    let replacement = core;

    if (/^@me$/i.test(core)) {
      const pk = getStoredPubkey();
      if (pk) replacement = nip19.npubEncode(pk);
    } else if (/^@contacts$/i.test(core)) {
      // Preserve as-is (expanded at search time)
    } else if (!skipAuthorResolution && !/^npub1[0-9a-z]+$/i.test(core)) {
      if (authorResolutionCache.has(core)) {
        replacement = authorResolutionCache.get(core) || core;
      } else {
        try {
          const npub = await resolveAuthorToNpub(core, ppProvider ?? undefined);
          if (npub) {
            replacement = npub;
            authorResolutionCache.set(core, npub);
          }
        } catch {}
      }
    }
    result += q.slice(lastIndex, m.index);
    result += `${pre}by:${replacement}${suffix}`;
    lastIndex = m.index + full.length;
  }
  result += q.slice(lastIndex);
  return result;
}

/** Normalize p:<token> where token may be hex, npub or nprofile */
export function resolvePTokensInQuery(q: string): string {
  const rx = /(^|\s)p:(\S+)/gi;
  let result = '';
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(q)) !== null) {
    const full = m[0];
    const pre = m[1] || '';
    const raw = m[2] || '';
    const match = raw.match(/^([^),.;]+)([),.;]*)$/);
    const core = (match && match[1]) || raw;
    const suffix = (match && match[2]) || '';
    let replacement = core;
    if (/^[0-9a-fA-F]{64}$/.test(core)) {
      try { replacement = nip19.npubEncode(core.toLowerCase()); } catch {}
    } else if (/^npub1[0-9a-z]+$/i.test(core)) {
      replacement = core;
    } else if (/^nprofile1[0-9a-z]+$/i.test(core)) {
      try {
        const decoded = nip19.decode(core);
        if (decoded?.type === 'nprofile') {
          const pk = (decoded.data as { pubkey: string }).pubkey;
          replacement = nip19.npubEncode(pk);
        }
      } catch {}
    }
    result += q.slice(lastIndex, m.index);
    result += `${pre}p:${replacement}${suffix}`;
    lastIndex = m.index + full.length;
  }
  result += q.slice(lastIndex);
  return result;
}
