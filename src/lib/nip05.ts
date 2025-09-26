export function normalizeNip05String(input: string): string {
  const raw = (input || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower.startsWith('@')) {
    const domain = lower.slice(1).trim();
    return domain ? `_${'@'}${domain}` : '';
  }
  if (!lower.includes('@')) {
    return `_${'@'}${lower}`;
  }
  const [local, domain] = lower.split('@');
  if (!domain) return '';
  const normalizedLocal = local && local.length > 0 ? local : '_';
  return `${normalizedLocal}${'@'}${domain}`;
}

export function getNip05Domain(input: string): string {
  const normalized = normalizeNip05String(input);
  if (!normalized) return '';
  const parts = normalized.split('@');
  return (parts[1] || '').trim();
}

export function isRootNip05(nip05?: string): boolean {
  if (!nip05) return false;
  const normalized = normalizeNip05String(nip05);
  if (!normalized) return false;
  
  const [localPart] = normalized.split('@');
  // Root NIP-05 is when local part is '_' or empty (which gets normalized to '_')
  return localPart === '_';
}

const nip05Cache = new Map<string, boolean>();

export async function verifyNip05(pubkeyHex: string | undefined, nip05?: string, timeoutMs: number = 4000): Promise<boolean> {
  if (!pubkeyHex || !nip05) return false;
  const cacheKey = `${nip05}|${pubkeyHex}`;
  if (nip05Cache.has(cacheKey)) return nip05Cache.get(cacheKey) as boolean;
  try {
    const [namePart, domainPartCandidate] = nip05.includes('@') ? nip05.split('@') : ['_', nip05];
    const name = namePart || '_';
    const domain = (domainPartCandidate || '').trim();
    if (!domain) {
      nip05Cache.set(cacheKey, false);
      return false;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      nip05Cache.set(cacheKey, false);
      return false;
    }
    const data = await res.json();
    const mapped = (data?.names?.[name] as string | undefined)?.toLowerCase();
    const result = mapped === pubkeyHex.toLowerCase();
    nip05Cache.set(cacheKey, result);
    return result;
  } catch {
    nip05Cache.set(cacheKey, false);
    return false;
  }
}


