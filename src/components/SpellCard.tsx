'use client';

import React from 'react';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons';
import { spellToQuery } from '@/lib/spellTranslate';
import type { SpellDisplayData } from '@/lib/spellDisplay';

export type { SpellDisplayData } from '@/lib/spellDisplay';
export { parseSpellDisplay } from '@/lib/spellDisplay';

type SpellCardProps = {
  event: NDKEvent;
  spellData: SpellDisplayData;
  onCastSpell: (query: string) => void;
};

const KIND_NAMES: Record<number, string> = {
  0: 'profiles', 1: 'notes', 3: 'contacts', 6: 'reposts',
  7: 'reactions', 9735: 'zaps', 9802: 'highlights',
  30023: 'articles', 39089: 'follow packs',
};

function kindLabel(k: number): string {
  return KIND_NAMES[k] || `kind:${k}`;
}

export default function SpellCard({ event, spellData, onCastSpell }: SpellCardProps) {
  const translatedQuery = spellToQuery(event);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <span className="text-purple-400 text-lg" title="Spell (kind:777)">&#x1FA84;</span>
        <div className="flex-1 min-w-0">
          <div className="text-gray-100 font-medium text-base">{spellData.name}</div>
          {spellData.description && spellData.description !== spellData.name && (
            <div className="text-gray-400 text-sm mt-1">{spellData.description}</div>
          )}
        </div>
      </div>

      <div className="bg-[#1f1f1f] rounded-md px-3 py-2 text-xs text-gray-400 space-y-1 font-mono">
        <div><span className="text-gray-500">cmd:</span> <span className="text-blue-400">{spellData.cmd}</span></div>
        {spellData.kinds.length > 0 && (
          <div><span className="text-gray-500">kinds:</span> <span className="text-gray-300">{spellData.kinds.map(kindLabel).join(', ')}</span></div>
        )}
        {spellData.searchQuery && (
          <div><span className="text-gray-500">search:</span> <span className="text-green-400">&quot;{spellData.searchQuery}&quot;</span></div>
        )}
        {spellData.tagFilters.length > 0 && (
          <div><span className="text-gray-500">filters:</span> <span className="text-gray-300">{spellData.tagFilters.map((tf) => `#${tf.letter}=[${tf.values.join(', ')}]`).join('  ')}</span></div>
        )}
        {spellData.variables.length > 0 && (
          <div><span className="text-gray-500">variables:</span> <span className="text-yellow-400">{spellData.variables.join(', ')}</span></div>
        )}
        {(spellData.hasSince || spellData.hasUntil) && (
          <div>
            <span className="text-gray-500">time:</span>{' '}
            <span className="text-gray-300">
              {spellData.sinceRaw && `since ${spellData.sinceRaw}`}
              {spellData.sinceRaw && spellData.untilRaw && ' / '}
              {spellData.untilRaw && `until ${spellData.untilRaw}`}
            </span>
          </div>
        )}
        {spellData.limit !== undefined && (
          <div><span className="text-gray-500">limit:</span> <span className="text-gray-300">{spellData.limit}</span></div>
        )}
        {spellData.hasRelays && (
          <div><span className="text-gray-500">relays:</span> <span className="text-gray-300">{spellData.relayCount} specified</span></div>
        )}
        {translatedQuery && (
          <div className="pt-1 border-t border-gray-700/50">
            <span className="text-gray-500">ants:</span> <span className="text-purple-300">{translatedQuery}</span>
          </div>
        )}
      </div>

      {!translatedQuery ? (
        <div className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-600/20 border border-gray-500/30 rounded-md text-gray-400 text-sm">
          Cannot translate this spell to an ants query
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onCastSpell(translatedQuery)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 hover:border-purple-500/50 rounded-md text-purple-300 hover:text-purple-200 text-sm font-medium transition-colors"
        >
          <FontAwesomeIcon icon={faWandMagicSparkles} className="text-xs" />
          Cast Spell
        </button>
      )}
    </div>
  );
}
