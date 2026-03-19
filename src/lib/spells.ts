import { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import { SpellError, resolveTimestamp, resolveVariables } from './spellResolve';

export { SpellError, resolveTimestamp } from './spellResolve';

/** Kind number for spell events (NIP-A7) */
export const SPELL_KIND = 777;

/** Parsed representation of a spell event */
export interface ParsedSpell {
  cmd: 'REQ' | 'COUNT';
  filter: NDKFilter;
  relays?: string[];
  name?: string;
  description?: string;
  closeOnEose: boolean;
  event: NDKEvent;
}

/** Check if an NDKEvent is a spell (kind:777) */
export function isSpellEvent(event: NDKEvent): boolean {
  return event.kind === SPELL_KIND;
}

/**
 * Parse a kind:777 spell event into a structured ParsedSpell.
 * Resolves runtime variables and relative timestamps.
 */
export async function parseSpell(event: NDKEvent): Promise<ParsedSpell> {
  if (event.kind !== SPELL_KIND) {
    throw new SpellError(`Expected kind ${SPELL_KIND}, got ${event.kind}`);
  }

  const tags = event.tags;

  const cmdTag = tags.find((t) => t[0] === 'cmd');
  if (!cmdTag || !cmdTag[1]) {
    throw new SpellError('Spell is missing required "cmd" tag');
  }
  const cmd = cmdTag[1].toUpperCase();
  if (cmd !== 'REQ' && cmd !== 'COUNT') {
    throw new SpellError(`Invalid cmd value: "${cmdTag[1]}". Must be REQ or COUNT`);
  }

  const filter: NDKFilter = {};

  const kindTags = tags.filter((t) => t[0] === 'k' && t[1]);
  if (kindTags.length > 0) {
    filter.kinds = kindTags.map((t) => parseInt(t[1], 10)).filter((n) => !isNaN(n));
  }

  const authorsTag = tags.find((t) => t[0] === 'authors');
  if (authorsTag) {
    filter.authors = await resolveVariables(authorsTag.slice(1).filter(Boolean));
  }

  const idsTag = tags.find((t) => t[0] === 'ids');
  if (idsTag) {
    filter.ids = idsTag.slice(1).filter(Boolean);
  }

  const tagFilters = tags.filter((t) => t[0] === 'tag' && t[1] && t.length >= 3);
  for (const tf of tagFilters) {
    const resolved = await resolveVariables(tf.slice(2).filter(Boolean));
    (filter as Record<string, string[]>)[`#${tf[1]}`] = resolved;
  }

  const searchTag = tags.find((t) => t[0] === 'search' && t[1]);
  if (searchTag) filter.search = searchTag[1];

  const limitTag = tags.find((t) => t[0] === 'limit' && t[1]);
  if (limitTag) {
    const n = parseInt(limitTag[1], 10);
    if (!isNaN(n) && n > 0) filter.limit = n;
  }

  const sinceTag = tags.find((t) => t[0] === 'since' && t[1]);
  if (sinceTag) filter.since = resolveTimestamp(sinceTag[1]);

  const untilTag = tags.find((t) => t[0] === 'until' && t[1]);
  if (untilTag) filter.until = resolveTimestamp(untilTag[1]);

  const relaysTag = tags.find((t) => t[0] === 'relays');
  const relays = relaysTag ? relaysTag.slice(1).filter(Boolean) : undefined;
  const nameTag = tags.find((t) => t[0] === 'name' && t[1]);
  const closeOnEose = tags.some((t) => t[0] === 'close-on-eose');

  const hasFilter = filter.kinds || filter.authors || filter.ids || filter.search ||
    filter.since || filter.until || filter.limit ||
    Object.keys(filter).some((k) => k.startsWith('#'));
  if (!hasFilter) throw new SpellError('Spell has no filter tags');

  return {
    cmd: cmd as 'REQ' | 'COUNT',
    filter,
    relays,
    name: nameTag?.[1],
    description: event.content || undefined,
    closeOnEose,
    event,
  };
}
