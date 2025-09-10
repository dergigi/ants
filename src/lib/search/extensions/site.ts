import type { QueryExtension, QueryExtensionResult } from './types';
import { getSiteHostsSync } from '../dsl';

function buildHostRegex(hosts: string[]): RegExp {
  // Match any URL containing one of the hosts
  const escaped = hosts.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`https?:\\/\\/[^\s'"<>]*?(?:${escaped.join('|')})[^\s'"<>]*`, 'i');
}

function parseSiteToken(raw: string): string[] {
  const token = raw.trim().toLowerCase();
  if (!token) return [];
  // Check mapping by key; fall back to raw domain
  const map = getSiteHostsSync();
  if (map[token]) return [...map[token]];
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
      // Support comma-separated list in a single modifier
      const parts = token.split(',').map((p) => p.trim()).filter(Boolean);
      for (const p of parts) {
        seeds = seeds.concat(parseSiteToken(p));
      }
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


