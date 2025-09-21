export async function resolveNip05ToPubkey(nip05: string): Promise<string | null> {
  try {
    const input = nip05.trim();
    const cleaned = input.startsWith('@') ? input.slice(1) : input;
    const [nameRaw, domainRaw] = cleaned.includes('@') ? cleaned.split('@') : ['_', cleaned];
    const name = nameRaw || '_';
    const domain = (domainRaw || '').trim();
    if (!domain) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    const mapped = (data?.names?.[name] as string | undefined) || null;
    return mapped;
  } catch {
    return null;
  }
}
