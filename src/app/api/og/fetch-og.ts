import axios from 'axios';
import { decode } from 'html-entities';
import { validateAndResolveIp, createPinnedAgent, validateRedirectTarget } from './ssrf';

export type OgResult = {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  type?: string;
  favicon?: string;
};

export function isHttpUrl(u: URL): boolean {
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

/** Parse OG / meta tags from raw HTML (mirrors fetch-opengraph parsing). */
function parseOgTags(html: string, url: string): Record<string, string | null> {
  let siteTitle = '';
  const tagTitle = html.match(/<title[^>]*>[\r\n\t\s]*([^<]+)[\r\n\t\s]*<\/title>/gim);
  if (tagTitle?.[0]) {
    siteTitle = tagTitle[0].replace(/<title[^>]*>[\r\n\t\s]*([^<]+)[\r\n\t\s]*<\/title>/gim, '$1');
  }

  const og: { name: string; value: string | null }[] = [];
  const metas = html.match(/<meta[^>]+>/gim);
  if (metas) {
    for (let meta of metas) {
      meta = meta.replace(/\s*\/?>$/, ' />');
      const zname = meta.replace(/[\s\S]*(property|name)\s*=\s*([\s\S]+)/, '$2');
      const name = /^["']/.test(zname)
        ? zname.substring(1, 1 + zname.slice(1).indexOf(zname[0]))
        : zname.substring(0, zname.search(/[\s\t]/g));
      const zcontent = meta.replace(/[\s\S]*(content)\s*=\s*([\s\S]+)/, '$2');
      const content = /^["']/.test(zcontent)
        ? zcontent.substring(1, 1 + zcontent.slice(1).indexOf(zcontent[0]))
        : zcontent.substring(0, zcontent.search(/[\s\t]/g));
      if (content !== 'undefined') {
        og.push({ name, value: decode(content) });
      }
    }
  }

  const result: Record<string, string | null> = { url };
  for (const { name, value } of og) result[name] = value;
  result['title'] = result['og:title'] || siteTitle || null;
  result['description'] = result['og:description'] || result['description'] || null;
  result['image'] = result['og:image'] || null;
  return result;
}

async function resolveFavicon(urlObj: URL): Promise<string | undefined> {
  const candidatePaths = ['/favicon.ico', '/favicon.png', '/favicon-32x32.png',
    '/apple-touch-icon.png', '/apple-touch-icon-precomposed.png', '/icons/icon-192x192.png'];
  for (const path of candidatePaths) {
    const href = resolveUrlMaybe(urlObj, path);
    if (!href) continue;
    try {
      const head = await globalThis.fetch(href, { method: 'HEAD', cache: 'no-store', redirect: 'manual' });
      if (head.ok) return href;
    } catch { /* ignore */ }
  }
  return `https://icons.duckduckgo.com/ip3/${urlObj.hostname}.ico`;
}

/**
 * Fetch HTML with SSRF-safe constraints:
 * - DNS is pinned to the pre-validated IP (no TOCTOU)
 * - Redirects are not auto-followed; each hop is validated
 */
async function safeFetchHtml(url: string, pinnedIp: string): Promise<string> {
  const urlObj = new URL(url);
  const agent = createPinnedAgent(urlObj.protocol, pinnedIp);
  const maxHops = 5;
  let currentUrl = url;
  let currentAgent = agent;

  for (let hop = 0; hop <= maxHops; hop++) {
    const res = await axios.get<string>(currentUrl, {
      maxRedirects: 0,
      validateStatus: (s) => s < 400 || (s >= 300 && s < 400),
      httpAgent: currentAgent,
      httpsAgent: currentAgent,
      headers: { 'User-Agent': 'OpenGraph', 'Cache-Control': 'no-cache', Accept: '*/*' },
      responseType: 'text',
      timeout: 10_000,
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers['location'] as string | undefined;
      if (!location) throw new Error('Redirect without Location header');
      const absolute = new URL(location, currentUrl).toString();
      await validateRedirectTarget(absolute);
      const nextUrl = new URL(absolute);
      const nextIp = await validateAndResolveIp(nextUrl.hostname);
      currentAgent = createPinnedAgent(nextUrl.protocol, nextIp);
      currentUrl = absolute;
      continue;
    }

    return typeof res.data === 'string' ? res.data : String(res.data);
  }
  throw new Error('Too many redirects');
}

export async function fetchOgData(url: string, pinnedIp: string): Promise<OgResult> {
  const html = await safeFetchHtml(url, pinnedIp);
  const tags = parseOgTags(html, url);
  const urlObj = new URL(url);

  const title = tags['og:title'] || tags['twitter:title'] || tags['title'] || undefined;
  const description = tags['og:description'] || tags['twitter:description'] || tags['description'] || undefined;
  const image = tags['og:image'] || tags['twitter:image'] || tags['image'] || undefined;
  const siteName = tags['og:site_name'] || urlObj.hostname;
  const type = tags['og:type'] || undefined;
  const favicon = await resolveFavicon(urlObj);

  return { url: tags['url'] || url, title, description, image, siteName, type, favicon };
}
