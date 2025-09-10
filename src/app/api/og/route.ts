import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { isIP } from 'net';

// Runtime hint: nodejs for network and cheerio
export const runtime = 'nodejs';

type OgResult = {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  type?: string;
  favicon?: string;
};

function isHttpUrl(u: URL): boolean {
  return u.protocol === 'http:' || u.protocol === 'https:';
}

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.local')) return true;
  if (lower === '0.0.0.0') return true;
  return false;
}

function isPrivateIp(ip: string): boolean {
  // IPv4 ranges
  const parts = ip.split('.').map((x) => parseInt(x, 10));
  if (parts.length === 4 && parts.every((n) => !Number.isNaN(n))) {
    const [a, b] = parts;
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
    if (a === 0) return true; // 0.0.0.0/8
  }
  // IPv6
  if (ip === '::1') return true; // loopback
  if (ip.startsWith('fe80:') || ip.startsWith('fe80::')) return true; // link-local
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // unique local
  return false;
}

function resolveUrlMaybe(base: URL, value?: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const absolute = new URL(value, base);
    if (!isHttpUrl(absolute)) return undefined;
    return absolute.toString();
  } catch {
    return undefined;
  }
}

async function fetchHtmlWithLimit(url: string, timeoutMs: number, maxBytes: number): Promise<string> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: {
        'user-agent': 'ants-og-fetcher/1.0 (+https://ants.dergigi.com)'
      },
      redirect: 'follow',
      cache: 'no-store'
    } as RequestInit);
    if (!res.ok) {
      throw new Error(`Upstream status ${res.status}`);
    }
    const contentType = res.headers.get('content-type') || '';
    if (!/(text\/html|application\/xhtml\+xml)/i.test(contentType)) {
      throw new Error('Unsupported content-type');
    }
    const finalUrl = res.url || url;
    try {
      const finalU = new URL(finalUrl);
      if (isBlockedHostname(finalU.hostname)) throw new Error('Blocked host');
      // If direct IP, block private ranges
      if (isIP(finalU.hostname)) {
        if (isPrivateIp(finalU.hostname)) throw new Error('Blocked IP');
      }
    } catch {
      throw new Error('Invalid redirect');
    }
    // Stream read up to maxBytes
    const reader = res.body?.getReader();
    if (!reader) return '';
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.byteLength;
      if (received > maxBytes) {
        chunks.push(value.slice(0, Math.max(0, maxBytes - (received - value.byteLength))));
        break;
      }
      chunks.push(value);
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return buf.toString('utf8');
  } finally {
    clearTimeout(t);
  }
}

function extractOg(url: URL, html: string): OgResult {
  const $ = cheerio.load(html);
  const get = (sel: string) => $(sel).attr('content') || $(sel).attr('value') || undefined;

  const ogTitle = get('meta[property="og:title"]') || get('meta[name="og:title"]');
  const ogDescription = get('meta[property="og:description"]') || get('meta[name="og:description"]');
  const ogImage = get('meta[property="og:image"]') || get('meta[name="og:image"]');
  const ogSite = get('meta[property="og:site_name"]') || get('meta[name="og:site_name"]');
  const ogType = get('meta[property="og:type"]') || get('meta[name="og:type"]');

  const twTitle = get('meta[name="twitter:title"]');
  const twDescription = get('meta[name="twitter:description"]');
  const twImage = get('meta[name="twitter:image"]') || get('meta[name="twitter:image:src"]');

  const title = ogTitle || twTitle || $('title').first().text() || undefined;
  const description = ogDescription || twDescription || $('meta[name="description"]').attr('content') || undefined;
  const image = resolveUrlMaybe(url, ogImage || twImage || undefined);
  const siteName = ogSite || new URL(url.origin).hostname;
  const type = ogType;

  // Favicon detection
  let faviconHref = $('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').attr('href') || undefined;
  const favicon = resolveUrlMaybe(url, faviconHref) || resolveUrlMaybe(url, '/favicon.ico');

  return { url: url.toString(), title, description, image, siteName, type, favicon };
}

export async function GET(req: NextRequest) {
  const urlParam = req.nextUrl.searchParams.get('url');
  if (!urlParam) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }
  let u: URL;
  try {
    u = new URL(urlParam);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }
  if (!isHttpUrl(u)) {
    return NextResponse.json({ error: 'Only http(s) URLs are allowed' }, { status: 400 });
  }
  if (isBlockedHostname(u.hostname)) {
    return NextResponse.json({ error: 'Blocked host' }, { status: 400 });
  }
  if (isIP(u.hostname) && isPrivateIp(u.hostname)) {
    return NextResponse.json({ error: 'Blocked IP' }, { status: 400 });
  }

  try {
    const html = await fetchHtmlWithLimit(u.toString(), 8000, 512 * 1024);
    const data = extractOg(u, html);
    // Short cache headers (10 minutes) to reduce repeated fetches
    const res = NextResponse.json(data, { status: 200 });
    res.headers.set('Cache-Control', 'public, max-age=600, s-maxage=600, stale-while-revalidate=86400');
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Fetch failed' }, { status: 502 });
  }
}


