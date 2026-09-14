import { NextRequest, NextResponse } from 'next/server';
import { Parser } from 'htmlparser2';
import { BlockedUrlError, safeFetch, validateUrl } from '@/lib/server/safeFetch';

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
    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
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

async function fetchYouTubeOg(url: string, signal: AbortSignal): Promise<OgResult> {
  const id = getYouTubeIdFromUrl(url);
  const siteName = 'YouTube';
  // Try oEmbed first for title/author/thumbnail
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await safeFetch(oembedUrl, 'GET', signal);
    if (res.status >= 200 && res.status < 300) {
      const data = JSON.parse(res.body) as {
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

  // Fallback: construct minimal preview if ID known
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

async function resolveFavicon(urlObj: URL, signal: AbortSignal): Promise<string | undefined> {
  // Try common favicon locations first with a lightweight HEAD request
  const candidatePaths = [
    '/favicon.ico',
    '/favicon.png',
    '/favicon-32x32.png',
    '/apple-touch-icon.png',
    '/apple-touch-icon-precomposed.png',
    '/icons/icon-192x192.png',
  ];
  for (const path of candidatePaths) {
    if (signal.aborted) break;
    const href = resolveUrlMaybe(urlObj, path);
    if (!href) continue;
    try {
      const head = await safeFetch(href, 'HEAD', signal);
      if (head.status >= 200 && head.status < 300) return head.url;
    } catch {
      // ignore and try next
    }
  }
  // Fallback to a reliable favicon service
  return `https://icons.duckduckgo.com/ip3/${urlObj.hostname}.ico`;
}

async function fetchOgData(url: string, signal: AbortSignal): Promise<OgResult> {
  const response = await safeFetch(url, 'GET', signal);
  if (response.status < 200 || response.status >= 300) throw new Error('Metadata fetch failed');
  const urlObj = new URL(response.url);
  const ogData: Record<string, string> = Object.create(null);
  let inTitle = false;
  let pageTitle = '';
  const parser = new Parser({
    onopentag(name, attributes) {
      if (name === 'title') inTitle = true;
      if (name === 'meta') {
        const key = (attributes.property || attributes.name || '').toLowerCase();
        if (key && attributes.content && !ogData[key]) ogData[key] = attributes.content;
      }
    },
    ontext(text) { if (inTitle) pageTitle += text; },
    onclosetag(name) { if (name === 'title') inTitle = false; },
  }, { decodeEntities: true });
  parser.end(response.body);
  ogData.title = pageTitle.trim();
  
  // Prefer OpenGraph metadata, then Twitter metadata and the page title.
  const title = ogData['og:title'] || ogData['twitter:title'] || ogData.title || undefined;
  const description = ogData['og:description'] || ogData['twitter:description'] || ogData.description || undefined;
  const image = ogData['og:image'] || ogData['twitter:image'] || ogData['twitter:image:src'] || ogData.image || undefined;
  const siteName = ogData['og:site_name'] || urlObj.hostname;
  const type = ogData['og:type'] || undefined;
  
  // Resolve favicon with fallbacks
  const favicon = await resolveFavicon(urlObj, signal);
  
  return {
    url: response.url,
    title,
    description,
    image: resolveUrlMaybe(urlObj, image),
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

  try {
    validateUrl(u);
    const signal = AbortSignal.timeout(8000);
    let data: OgResult;
    const host = u.hostname.toLowerCase();
    if (host === 'youtu.be' || (host === 'youtube.com' || host.endsWith('.youtube.com'))) {
      try {
        data = await fetchYouTubeOg(u.toString(), signal);
      } catch {
        data = await fetchOgData(u.toString(), signal);
      }
    } else {
      data = await fetchOgData(u.toString(), signal);
    }
    // Short cache headers (10 minutes) to reduce repeated fetches
    const res = NextResponse.json(data, { status: 200 });
    res.headers.set('Cache-Control', 'public, max-age=600, s-maxage=600, stale-while-revalidate=86400');
    return res;
  } catch (e: unknown) {
    const blocked = e instanceof BlockedUrlError;
    return NextResponse.json({ error: blocked ? 'Blocked URL' : 'Metadata fetch failed' }, { status: blocked ? 400 : 502 });
  }
}


