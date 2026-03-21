import { NextRequest, NextResponse } from 'next/server';
import { validateAndResolveIp } from './ssrf';
import { fetchOgData, isHttpUrl, type OgResult } from './fetch-og';

// Runtime hint: nodejs for network requests
export const runtime = 'nodejs';

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.local')) return true;
  if (lower === '0.0.0.0') return true;
  return false;
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
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await globalThis.fetch(oembedUrl, { cache: 'no-store' });
    if (res.ok) {
      const data = (await res.json()) as {
        title?: string;
        author_name?: string;
        thumbnail_url?: string;
      };
      const title = data.title;
      const image = data.thumbnail_url || (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined);
      const description = data.author_name ? `by ${data.author_name}` : undefined;
      const favicon = 'https://icons.duckduckgo.com/ip3/youtube.com.ico';
      return { url, title, description, image, siteName, type: 'video', favicon };
    }
  } catch {
    // ignore and fall back
  }
  if (id) {
    return {
      url,
      title: 'YouTube',
      image: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      siteName,
      type: 'video',
      favicon: 'https://icons.duckduckgo.com/ip3/youtube.com.ico',
    };
  }
  throw new Error('YouTube metadata unavailable');
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

  let pinnedIp: string;
  try {
    pinnedIp = await validateAndResolveIp(u.hostname);
  } catch {
    return NextResponse.json({ error: 'Blocked host' }, { status: 400 });
  }

  try {
    let data: OgResult;
    const host = u.hostname.toLowerCase();
    if (host === 'youtu.be' || host.endsWith('youtube.com')) {
      try {
        data = await fetchYouTubeOg(u.toString());
      } catch {
        data = await fetchOgData(u.toString(), pinnedIp);
      }
    } else {
      data = await fetchOgData(u.toString(), pinnedIp);
    }
    const res = NextResponse.json(data, { status: 200 });
    res.headers.set('Cache-Control', 'public, max-age=600, s-maxage=600, stale-while-revalidate=86400');
    return res;
  } catch {
    return NextResponse.json({ error: 'Failed to fetch metadata' }, { status: 502 });
  }
}
