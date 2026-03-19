import { NDKEvent } from '@nostr-dev-kit/ndk';
import { SPELL_KIND } from './spells';

/** Parsed spell display data extracted from event tags */
export interface SpellDisplayData {
  name: string;
  description: string;
  cmd: string;
  kinds: number[];
  hasSearch: boolean;
  searchQuery?: string;
  hasRelays: boolean;
  relayCount: number;
  hasVariables: boolean;
  variables: string[];
  hasSince: boolean;
  hasUntil: boolean;
  sinceRaw?: string;
  untilRaw?: string;
  limit?: number;
  tagFilters: Array<{ letter: string; values: string[] }>;
}

/**
 * Parse a kind:777 event into display data (no resolution, just raw tag reading)
 */
export function parseSpellDisplay(event: NDKEvent): SpellDisplayData | null {
  if (event.kind !== SPELL_KIND) return null;

  const tags = event.tags;
  const cmdTag = tags.find((t) => t[0] === 'cmd');
  if (!cmdTag || !cmdTag[1]) return null;

  const nameTag = tags.find((t) => t[0] === 'name' && t[1]);
  const kindTags = tags.filter((t) => t[0] === 'k' && t[1]);
  const searchTag = tags.find((t) => t[0] === 'search' && t[1]);
  const relaysTag = tags.find((t) => t[0] === 'relays');
  const sinceTag = tags.find((t) => t[0] === 'since' && t[1]);
  const untilTag = tags.find((t) => t[0] === 'until' && t[1]);
  const limitTag = tags.find((t) => t[0] === 'limit' && t[1]);
  const authorsTag = tags.find((t) => t[0] === 'authors');
  const tagFilters = tags.filter((t) => t[0] === 'tag' && t[1] && t.length >= 3);

  const allValues = [
    ...(authorsTag ? authorsTag.slice(1) : []),
    ...tagFilters.flatMap((t) => t.slice(2)),
  ];
  const variables = allValues.filter((v) => v.startsWith('$'));
  const name = nameTag?.[1] || (event.content ? event.content.slice(0, 80) : 'Unnamed spell');

  return {
    name,
    description: event.content || '',
    cmd: cmdTag[1].toUpperCase(),
    kinds: kindTags.map((t) => parseInt(t[1], 10)).filter((n) => !isNaN(n)),
    hasSearch: !!searchTag,
    searchQuery: searchTag?.[1],
    hasRelays: !!relaysTag && relaysTag.length > 1,
    relayCount: relaysTag ? relaysTag.length - 1 : 0,
    hasVariables: variables.length > 0,
    variables: [...new Set(variables)],
    hasSince: !!sinceTag,
    hasUntil: !!untilTag,
    sinceRaw: sinceTag?.[1],
    untilRaw: untilTag?.[1],
    limit: limitTag ? parseInt(limitTag[1], 10) || undefined : undefined,
    tagFilters: tagFilters.map((t) => ({ letter: t[1], values: t.slice(2) })),
  };
}
