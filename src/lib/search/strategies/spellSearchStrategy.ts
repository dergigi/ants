import { NDKEvent, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { ndk } from '../../ndk';
import { isSpellEvent, parseSpell, SpellError } from '../../spells';
import { fetchEventByIdentifier } from '../idLookup';
import { getSearchRelaySet } from '../relayManagement';
import { subscribeAndStream, subscribeAndCollect } from '../subscriptions';
import { sortEventsNewestFirst } from '../../utils/searchUtils';
import { SearchContext } from '../types';

/**
 * Result from spell execution, includes parsed metadata for UI display
 */
export interface SpellExecutionResult {
  results: NDKEvent[];
  spellName?: string;
  spellDescription?: string;
  spellEvent: NDKEvent;
}

// Store last spell execution result for UI access
let lastSpellResult: SpellExecutionResult | null = null;
export function getLastSpellResult(): SpellExecutionResult | null {
  return lastSpellResult;
}
export function clearLastSpellResult(): void {
  lastSpellResult = null;
}

/**
 * Try to handle a query that is a NIP-19 identifier pointing to a kind:777 spell.
 * If the query decodes to a nevent/note/naddr referencing a spell, fetch it,
 * parse the spell, and execute the filter.
 *
 * Returns null if the query is not a spell reference.
 */
export async function tryHandleSpellSearch(
  query: string,
  context: SearchContext
): Promise<NDKEvent[] | null> {
  const { isStreaming, streamingOptions, abortSignal } = context;

  // Only handle bare NIP-19 identifiers (nevent1..., note1..., naddr1...)
  const trimmed = query.trim();
  if (!trimmed.match(/^(nevent1|note1|naddr1)[0-9a-z]+$/i)) {
    return null;
  }

  // Decode the NIP-19 identifier
  let decoded;
  try {
    decoded = nip19.decode(trimmed);
  } catch {
    return null;
  }

  // Fetch the referenced event
  let spellEvent: NDKEvent | null = null;

  if (decoded.type === 'nevent') {
    const data = decoded.data as { id: string; relays?: string[]; kind?: number };
    // If kind hint is present and it's not 777, bail early
    if (data.kind !== undefined && data.kind !== 777) {
      return null;
    }
    const events = await fetchEventByIdentifier(
      { id: data.id, relayHints: data.relays },
      abortSignal,
      getSearchRelaySet
    );
    spellEvent = events[0] || null;
  } else if (decoded.type === 'note') {
    const id = decoded.data as string;
    const events = await fetchEventByIdentifier({ id }, abortSignal, getSearchRelaySet);
    spellEvent = events[0] || null;
  } else if (decoded.type === 'naddr') {
    const data = decoded.data as { pubkey: string; identifier: string; kind: number; relays?: string[] };
    if (data.kind !== 777) {
      return null;
    }
    const events = await fetchEventByIdentifier(
      {
        filter: { kinds: [data.kind as number], authors: [data.pubkey], '#d': [data.identifier], limit: 1 },
        relayHints: data.relays,
      },
      abortSignal,
      getSearchRelaySet
    );
    spellEvent = events[0] || null;
  } else {
    return null;
  }

  // If we didn't find an event or it's not a spell, bail
  if (!spellEvent || !isSpellEvent(spellEvent)) {
    return null;
  }

  // Parse the spell
  let parsed;
  try {
    parsed = await parseSpell(spellEvent);
  } catch (error) {
    if (error instanceof SpellError) {
      console.warn('Failed to parse spell:', error.message);
    }
    return null;
  }

  // COUNT spells: return the spell event itself so SpellCard can render it
  // with a "not yet supported" message instead of falling through to raw display
  if (parsed.cmd === 'COUNT') {
    lastSpellResult = {
      results: [spellEvent],
      spellName: parsed.name,
      spellDescription: parsed.description,
      spellEvent,
    };
    return [spellEvent];
  }

  // Determine relay set for execution
  let relaySet: NDKRelaySet;
  if (parsed.relays && parsed.relays.length > 0) {
    relaySet = NDKRelaySet.fromRelayUrls(parsed.relays, ndk);
  } else {
    relaySet = await getSearchRelaySet();
  }

  // Execute the filter
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

  // Store spell metadata for UI
  lastSpellResult = {
    results,
    spellName: parsed.name,
    spellDescription: parsed.description,
    spellEvent,
  };

  return sortEventsNewestFirst(results);
}
