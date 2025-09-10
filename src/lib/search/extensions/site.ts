import type { QueryExtension, QueryExtensionResult } from './types';

const YOUTUBE_HOSTS = [
  'youtube.com',
  'youtu.be',
  'm.youtube.com',
  'www.youtube.com',
  'youtube-nocookie.com'
];

function buildHostRegex(hosts: string[]): RegExp {
  // Match any URL containing one of the hosts
  const escaped = hosts.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`https?:\\/\\/[^\s'"<>]*?(?:${escaped.join('|')})[^\s'"<>]*`, 'i');
}

function parseSiteToken(raw: string): string[] {
  const token = raw.trim().toLowerCase();
  if (!token) return [];
  // Known aliases
  if (token === 'yt' || token === 'youtube' || token.includes('youtube')) {
    return [...YOUTUBE_HOSTS];
  }
  // If a full domain provided, just use it
  return [token];
}

export const siteExtension: QueryExtension = {
  name: 'site',
  applies: (query: string): boolean => /(?:^|\s)site:([^\s]+)(?:\s|$)/i.test(query),
  apply: (query: string): QueryExtensionResult => {
    const regex = /(?:^|\s)site:([^\s]+)(?:\s|$)/gi;
    let seeds: string[] = [];
    let cleaned = query;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(query)) !== null) {
      const token = (m[1] || '').trim();
      if (!token) continue;
      seeds = seeds.concat(parseSiteToken(token));
    }
    if (seeds.length > 0) {
      cleaned = cleaned.replace(regex, ' ').replace(/\s{2,}/g, ' ').trim();
    }

    const uniqueSeeds = Array.from(new Set(seeds));
    const hostRegex = uniqueSeeds.length > 0 ? buildHostRegex(uniqueSeeds) : null;

    return {
      query: cleaned,
      seeds: uniqueSeeds,
      filters: hostRegex ? [
        (content: string) => hostRegex.test(content || '')
      ] : []
    };
  }
};


