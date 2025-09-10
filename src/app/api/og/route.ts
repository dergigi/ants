import { NextRequest, NextResponse } from 'next/server';
import { fetch } from 'fetch-opengraph';
import { isIP } from 'net';

// Runtime hint: nodejs for network requests
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

function getYouTubeIdFromUrl(urlString: string): string | null {
  try {
    const u = new URL(urlString);
    const host = u.hostname.toLowerCase();
    if (host === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0] || '';
      return /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : null;
    }
    if (host.endsWith('youtube.com')) {
      // /watch?v=, /shorts/<id>, /embed/<id>
      if (u.searchParams.get('v')) {
        const id = u.searchParams.get('v') || '';
        return /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : null;
      }
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'watch')) {
        const id = parts[1];
        return /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchYouTubeOg(url: string): Promise<OgResult> {
  const id = getYouTubeIdFromUrl(url);
  const siteName = 'YouTube';
  // Try oEmbed first for title/author/thumbnail
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(oembedUrl, { cache: 'no-store' } as RequestInit);
    if (res.ok) {
      const data = (await res.json()) as {
        title?: string;
        author_name?: string;
        thumbnail_url?: string;
      };
      const title = data.title;
      const image = data.thumbnail_url || (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined);
      const description = data.author_name ? `by ${data.author_name}` : undefined;
      const favicon = 'https://www.youtube.com/s/desktop/fe2f7fc1/img/favicon_144x144.png';
      return { url, title, description, image, siteName, type: 'video', favicon };
    }
  } catch {
    // ignore and fall back
  }

  // Fallback: construct minimal preview if ID known
  if (id) {
    return {
      url,
      title: 'YouTube',
      image: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      siteName,
      type: 'video',
      favicon: 'https://www.youtube.com/s/desktop/fe2f7fc1/img/favicon_144x144.png',
    };
  }
  throw new Error('YouTube metadata unavailable');
}

async function fetchOgData(url: string): Promise<OgResult> {
  const ogData = await fetch(url);
  const urlObj = new URL(url);
  
  // Extract data from fetch-opengraph response
  const title = ogData['og:title'] || ogData['twitter:title'] || ogData.title || undefined;
  const description = ogData['og:description'] || ogData['twitter:description'] || ogData.description || undefined;
  const image = ogData['og:image'] || ogData['twitter:image:src'] || ogData.image || undefined;
  const siteName = ogData['og:site_name'] || urlObj.hostname;
  const type = ogData['og:type'] || undefined;
  
  // Try to get favicon from the original URL
  const favicon = resolveUrlMaybe(urlObj, '/favicon.ico');
  
  return {
    url: ogData.url || url,
    title,
    description,
    image,
    siteName,
    type,
    favicon
  };
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
    let data: OgResult;
    const host = u.hostname.toLowerCase();
    if (host === 'youtu.be' || host.endsWith('youtube.com')) {
      try {
        data = await fetchYouTubeOg(u.toString());
      } catch {
        data = await fetchOgData(u.toString());
      }
    } else {
      data = await fetchOgData(u.toString());
    }
    // Short cache headers (10 minutes) to reduce repeated fetches
    const res = NextResponse.json(data, { status: 200 });
    res.headers.set('Cache-Control', 'public, max-age=600, s-maxage=600, stale-while-revalidate=86400');
    return res;
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : 'Fetch failed';
    return NextResponse.json({ error: errorMessage }, { status: 502 });
  }
}


