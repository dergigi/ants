'use client';

import React from 'react';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons';
import { SPELL_KIND } from '@/lib/spells';
import { nip19 } from 'nostr-tools';

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

  // Detect variables
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

/**
 * Convert spell display data to an Ants search query string.
 * This is a best-effort human-readable translation.
 */
export function spellToSearchQuery(data: SpellDisplayData, event: NDKEvent): string {
  const parts: string[] = [];

  // Search text
  if (data.searchQuery) {
    parts.push(data.searchQuery);
  }

  // Kind filter
  if (data.kinds.length > 0) {
    parts.push(`kind:${data.kinds.join(',')}`);
  }

  // Tag filters (e.g. #bitcoin)
  for (const tf of data.tagFilters) {
    if (tf.letter === 't') {
      for (const v of tf.values) {
        if (!v.startsWith('$')) {
          parts.push(`#${v}`);
        }
      }
    }
  }

  // Since/until
  if (data.sinceRaw) {
    parts.push(`since:${data.sinceRaw}`);
  }
  if (data.untilRaw) {
    parts.push(`until:${data.untilRaw}`);
  }

  return parts.join(' ') || `kind:777`;
}

type SpellCardProps = {
  event: NDKEvent;
  spellData: SpellDisplayData;
  onCastSpell: (query: string) => void;
};

/** Friendly kind names */
const KIND_NAMES: Record<number, string> = {
  0: 'profiles',
  1: 'notes',
  3: 'contacts',
  6: 'reposts',
  7: 'reactions',
  9735: 'zaps',
  9802: 'highlights',
  30023: 'articles',
  39089: 'follow packs',
};

function kindLabel(k: number): string {
  return KIND_NAMES[k] || `kind:${k}`;
}

export default function SpellCard({ event, spellData, onCastSpell }: SpellCardProps) {
  // Encode as nevent so the spell strategy executes the real filter
  const neventId = nip19.neventEncode({
    id: event.id,
    author: event.pubkey,
    kind: SPELL_KIND,
  });

  return (
    <div className="space-y-3">
      {/* Spell header */}
      <div className="flex items-start gap-2">
        <span className="text-purple-400 text-lg" title="Spell (kind:777)">🪄</span>
        <div className="flex-1 min-w-0">
          <div className="text-gray-100 font-medium text-base">
            {spellData.name}
          </div>
          {spellData.description && spellData.description !== spellData.name && (
            <div className="text-gray-400 text-sm mt-1">
              {spellData.description}
            </div>
          )}
        </div>
      </div>

      {/* Spell details */}
      <div className="bg-[#1f1f1f] rounded-md px-3 py-2 text-xs text-gray-400 space-y-1 font-mono">
        <div>
          <span className="text-gray-500">cmd:</span>{' '}
          <span className="text-blue-400">{spellData.cmd}</span>
        </div>
        {spellData.kinds.length > 0 && (
          <div>
            <span className="text-gray-500">kinds:</span>{' '}
            <span className="text-gray-300">
              {spellData.kinds.map((k) => kindLabel(k)).join(', ')}
            </span>
          </div>
        )}
        {spellData.searchQuery && (
          <div>
            <span className="text-gray-500">search:</span>{' '}
            <span className="text-green-400">&quot;{spellData.searchQuery}&quot;</span>
          </div>
        )}
        {spellData.tagFilters.length > 0 && (
          <div>
            <span className="text-gray-500">filters:</span>{' '}
            <span className="text-gray-300">
              {spellData.tagFilters.map((tf) => `#${tf.letter}=[${tf.values.join(', ')}]`).join('  ')}
            </span>
          </div>
        )}
        {spellData.variables.length > 0 && (
          <div>
            <span className="text-gray-500">variables:</span>{' '}
            <span className="text-yellow-400">{spellData.variables.join(', ')}</span>
          </div>
        )}
        {(spellData.hasSince || spellData.hasUntil) && (
          <div>
            <span className="text-gray-500">time:</span>{' '}
            <span className="text-gray-300">
              {spellData.sinceRaw && `since ${spellData.sinceRaw}`}
              {spellData.sinceRaw && spellData.untilRaw && ' — '}
              {spellData.untilRaw && `until ${spellData.untilRaw}`}
            </span>
          </div>
        )}
        {spellData.limit && (
          <div>
            <span className="text-gray-500">limit:</span>{' '}
            <span className="text-gray-300">{spellData.limit}</span>
          </div>
        )}
        {spellData.hasRelays && (
          <div>
            <span className="text-gray-500">relays:</span>{' '}
            <span className="text-gray-300">{spellData.relayCount} specified</span>
          </div>
        )}
      </div>

      {/* Cast Spell button */}
      <button
        type="button"
        onClick={() => onCastSpell(neventId)}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 hover:border-purple-500/50 rounded-md text-purple-300 hover:text-purple-200 text-sm font-medium transition-colors"
      >
        <FontAwesomeIcon icon={faWandMagicSparkles} className="text-xs" />
        Cast Spell
      </button>
    </div>
  );
}
