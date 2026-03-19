import { NDKEvent, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { ndk } from '../../ndk';
import { isSpellEvent, parseSpell, SpellError } from '../../spells';
import { fetchEventByIdentifier } from '../idLookup';
import { getSearchRelaySet } from '../relayManagement';
import { subscribeAndStream, subscribeAndCollect } from '../subscriptions';
import { sortEventsNewestFirst } from '../../utils/searchUtils';
import { SearchContext } from '../types';

export interface SpellExecutionResult {
  results: NDKEvent[];
  spellName?: string;
  spellDescription?: string;
  spellEvent: NDKEvent;
}

let lastSpellResult: SpellExecutionResult | null = null;
export function getLastSpellResult(): SpellExecutionResult | null {
  return lastSpellResult;
}
export function clearLastSpellResult(): void {
  lastSpellResult = null;
}

/** Validate a relay URL without throwing */
function isValidRelayUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'wss:' || parsed.protocol === 'ws:';
  } catch {
    return false;
  }
}

/**
 * Try to handle a query as a kind:777 spell reference.
 * Only fetches the event if kind hint confirms it's 777 (nevent/naddr).
 * Returns null for non-spell references without fetching.
 */
export async function tryHandleSpellSearch(
  query: string,
  context: SearchContext
): Promise<NDKEvent[] | null> {
  const { isStreaming, streamingOptions, abortSignal } = context;

  const trimmed = query.trim();
  if (!trimmed.match(/^(nevent1|naddr1)[0-9a-z]+$/i)) {
    return null;
  }

  let decoded;
  try {
    decoded = nip19.decode(trimmed);
  } catch {
    return null;
  }

  let spellEvent: NDKEvent | null = null;

  if (decoded.type === 'nevent') {
    const data = decoded.data as { id: string; relays?: string[]; kind?: number };
    // Only proceed if kind hint is explicitly 777 — avoids double-fetch
    if (data.kind !== 777) return null;
    const events = await fetchEventByIdentifier(
      { id: data.id, relayHints: data.relays },
      abortSignal,
      getSearchRelaySet
    );
    spellEvent = events[0] || null;
  } else if (decoded.type === 'naddr') {
    const data = decoded.data as {
      pubkey: string; identifier: string; kind: number; relays?: string[];
    };
    if (data.kind !== 777) return null;
    const events = await fetchEventByIdentifier(
      {
        filter: {
          kinds: [data.kind as number],
          authors: [data.pubkey],
          '#d': [data.identifier],
          limit: 1,
        },
        relayHints: data.relays,
      },
      abortSignal,
      getSearchRelaySet
    );
    spellEvent = events[0] || null;
  } else {
    return null;
  }

  if (!spellEvent || !isSpellEvent(spellEvent)) return null;

  let parsed;
  try {
    parsed = await parseSpell(spellEvent);
  } catch (error) {
    if (error instanceof SpellError) {
      console.warn('Failed to parse spell:', error.message);
    }
    return null;
  }

  // COUNT spells: return spell event itself for SpellCard rendering
  if (parsed.cmd === 'COUNT') {
    lastSpellResult = {
      results: [spellEvent],
      spellName: parsed.name,
      spellDescription: parsed.description,
      spellEvent,
    };
    return [spellEvent];
  }

  // Build relay set with URL validation
  let relaySet: NDKRelaySet;
  if (parsed.relays && parsed.relays.length > 0) {
    const validRelays = parsed.relays.filter(isValidRelayUrl);
    relaySet = validRelays.length > 0
      ? NDKRelaySet.fromRelayUrls(validRelays, ndk)
      : await getSearchRelaySet();
  } else {
    relaySet = await getSearchRelaySet();
  }

  const filter = parsed.filter;
  let results: NDKEvent[];
  if (isStreaming) {
    results = await subscribeAndStream(filter, {
      timeoutMs: streamingOptions?.timeoutMs || 30000,
      maxResults: streamingOptions?.maxResults || 1000,
      onResults: streamingOptions?.onResults,
      relaySet,
      abortSignal,
    });
  } else {
    const timeout = parsed.closeOnEose ? 15000 : 8000;
    results = await subscribeAndCollect(filter, timeout, relaySet, abortSignal);
  }

  lastSpellResult = {
    results,
    spellName: parsed.name,
    spellDescription: parsed.description,
    spellEvent,
  };

  return sortEventsNewestFirst(results);
}
