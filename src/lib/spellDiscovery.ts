import { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import { ndk, safeExecuteWithCacheFallback, ensureCacheInitialized } from './ndk';
import { getStoredPubkey } from './nip07';
import { SPELL_KIND, spellToQuery } from './spellTranslate';
import { subscribeAndCollect } from './search/subscriptions';
import { getBroadRelaySet } from './search/relayManagement';
import { sortEventsNewestFirst } from './utils/searchUtils';
import { getEventRelaySources } from './eventRelayTracking';
import { nip19 } from 'nostr-tools';

/** Spell summary for the /spells list */
export interface SpellSummary {
  neventId: string;
  name: string;
  description: string;
  cmd: string;
  kinds: number[];
  hasSearch: boolean;
  author: string;
  fromContact: boolean;
  createdAt: number;
  /** Translated ants query (null if untranslatable) */
  antsQuery: string | null;
}

/**
 * Extract a SpellSummary from a kind:777 event.
 * Only includes REQ spells (COUNT not yet supported).
 */
function summarizeSpell(event: NDKEvent, contactPubkeys: Set<string>): SpellSummary | null {
  const tags = event.tags;
  const cmdTag = tags.find((t) => t[0] === 'cmd');
  if (!cmdTag || !cmdTag[1]) return null;
  const cmd = cmdTag[1].toUpperCase();
  if (cmd !== 'REQ') return null;

  const nameTag = tags.find((t) => t[0] === 'name' && t[1]);
  const kindTags = tags.filter((t) => t[0] === 'k' && t[1]);
  const searchTag = tags.find((t) => t[0] === 'search' && t[1]);
  const name = nameTag?.[1] || (event.content ? event.content.slice(0, 60) : 'Unnamed spell');

  const relaySources = getEventRelaySources(event);
  const neventId = nip19.neventEncode({
    id: event.id,
    author: event.pubkey,
    kind: SPELL_KIND,
    relays: relaySources.length > 0 ? relaySources.slice(0, 3) : undefined,
  });

  return {
    neventId,
    name,
    description: event.content || '',
    cmd,
    kinds: kindTags.map((t) => parseInt(t[1], 10)).filter((n) => !isNaN(n)),
    hasSearch: !!searchTag,
    author: event.pubkey,
    fromContact: contactPubkeys.has(event.pubkey),
    createdAt: event.created_at || 0,
    antsQuery: spellToQuery(event),
  };
}

/** Fetch the logged-in user's contact list pubkeys (kind:3). */
async function getContactPubkeys(): Promise<Set<string>> {
  const pubkey = getStoredPubkey();
  if (!pubkey) return new Set();
  return safeExecuteWithCacheFallback(async () => {
    const user = ndk.getUser({ pubkey });
    const follows = await user.follows();
    return new Set(Array.from(follows).map((u) => u.pubkey));
  }, new Set<string>());
}

/** Fetch spell summaries for the /spells command. */
export async function fetchSpellSummaries(limit = 50): Promise<SpellSummary[]> {
  return safeExecuteWithCacheFallback(() => fetchInner(limit), []);
}

async function fetchInner(limit: number): Promise<SpellSummary[]> {
  await ensureCacheInitialized();
  const contactPubkeys = await getContactPubkeys();
  const relaySet = await getBroadRelaySet();
  const seen = new Set<string>();
  const summaries: SpellSummary[] = [];

  if (contactPubkeys.size > 0) {
    const contactAuthors = Array.from(contactPubkeys);
    const batchSize = 200;
    const allEvents: NDKEvent[] = [];
    for (let i = 0; i < contactAuthors.length; i += batchSize) {
      const batch = contactAuthors.slice(i, i + batchSize);
      const filter: NDKFilter = { kinds: [SPELL_KIND as number], authors: batch, limit: 100 };
      const events = await subscribeAndCollect(filter, 8000, relaySet);
      allEvents.push(...events);
    }
    for (const event of sortEventsNewestFirst(allEvents)) {
      if (!seen.has(event.id)) {
        seen.add(event.id);
        const summary = summarizeSpell(event, contactPubkeys);
        if (summary) summaries.push(summary);
      }
    }
  }

  if (summaries.length < limit) {
    const remaining = limit - summaries.length;
    const filter: NDKFilter = { kinds: [SPELL_KIND as number], limit: Math.min(remaining + 20, 200) };
    const events = await subscribeAndCollect(filter, 8000, relaySet);
    for (const event of sortEventsNewestFirst(events)) {
      if (!seen.has(event.id)) {
        seen.add(event.id);
        const summary = summarizeSpell(event, contactPubkeys);
        if (summary) summaries.push(summary);
        if (summaries.length >= limit) break;
      }
    }
  }

  summaries.sort((a, b) => {
    if (a.fromContact !== b.fromContact) return a.fromContact ? -1 : 1;
    return b.createdAt - a.createdAt;
  });

  return summaries.slice(0, limit);
}
