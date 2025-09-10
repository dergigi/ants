import type { QueryExtension } from './types';
import { siteExtension } from './site';

export const queryExtensions: QueryExtension[] = [
  siteExtension
];

export function applyQueryExtensions(raw: string) {
  let query = raw;
  const seeds: string[] = [];
  const filters: Array<(content: string) => boolean> = [];

  for (const ext of queryExtensions) {
    if (!ext.applies(query)) continue;
    const res = ext.apply(query);
    query = res.query;
    if (res.seeds?.length) seeds.push(...res.seeds);
    if (res.filters?.length) filters.push(...res.filters);
  }

  return {
    query: query.trim(),
    seeds: Array.from(new Set(seeds)),
    filters
  } as const;
}


