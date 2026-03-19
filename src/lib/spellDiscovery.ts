import { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import { ndk } from './ndk';
import { getStoredPubkey } from './nip07';
import { SPELL_KIND } from './spells';
import { subscribeAndCollect } from './search/subscriptions';
import { getSearchRelaySet, getBroadRelaySet } from './search/relayManagement';
import { sortEventsNewestFirst } from './utils/searchUtils';
import { nip19 } from 'nostr-tools';

/** Spell summary for display in the /spells list */
export interface SpellSummary {
  /** nevent1... identifier for executing the spell */
  neventId: string;
  /** Human-readable name (from name tag) */
  name: string;
  /** Description from content field */
  description: string;
  /** cmd type (REQ or COUNT) */
  cmd: string;
  /** Queried kinds (from k tags) */
  kinds: number[];
  /** Whether the spell uses NIP-50 search */
  hasSearch: boolean;
  /** Author pubkey */
  author: string;
  /** Whether this spell is from one of the user's contacts */
  fromContact: boolean;
  /** Created at timestamp */
  createdAt: number;
}

/**
 * Extract a SpellSummary from a kind:777 event
 */
function summarizeSpell(event: NDKEvent, contactPubkeys: Set<string>): SpellSummary | null {
  const tags = event.tags;

  const cmdTag = tags.find((t) => t[0] === 'cmd');
  if (!cmdTag || !cmdTag[1]) return null;

  const nameTag = tags.find((t) => t[0] === 'name' && t[1]);
  const kindTags = tags.filter((t) => t[0] === 'k' && t[1]);
  const searchTag = tags.find((t) => t[0] === 'search' && t[1]);

  // Build a display name: prefer name tag, fall back to content, then "Unnamed spell"
  const name = nameTag?.[1] || (event.content ? event.content.slice(0, 60) : 'Unnamed spell');
  const description = event.content || '';

  // Encode as nevent for execution
  const neventId = nip19.neventEncode({
    id: event.id,
    author: event.pubkey,
    kind: SPELL_KIND,
  });

  return {
    neventId,
    name,
    description,
    cmd: cmdTag[1].toUpperCase(),
    kinds: kindTags.map((t) => parseInt(t[1], 10)).filter((n) => !isNaN(n)),
    hasSearch: !!searchTag,
    author: event.pubkey,
    fromContact: contactPubkeys.has(event.pubkey),
    createdAt: event.created_at || 0,
  };
}

/**
 * Fetch the user's contact list pubkeys (kind:3).
 * Returns empty set if not logged in or fetch fails.
 */
async function getContactPubkeys(): Promise<Set<string>> {
  const pubkey = getStoredPubkey();
  if (!pubkey) return new Set();

  try {
    const user = ndk.getUser({ pubkey });
    const follows = await user.follows();
    return new Set(Array.from(follows).map((u) => u.pubkey));
  } catch {
    return new Set();
  }
}

/**
 * Fetch and return spell summaries for the /spells command.
 * If logged in: contacts' spells first, then recent public spells.
 * If not logged in: recent public spells only.
 */
export async function fetchSpellSummaries(limit = 50): Promise<SpellSummary[]> {
  const contactPubkeys = await getContactPubkeys();
  const relaySet = await getBroadRelaySet();
  const seen = new Set<string>();
  const summaries: SpellSummary[] = [];

  // If logged in with contacts, fetch their spells first
  if (contactPubkeys.size > 0) {
    const contactAuthors = Array.from(contactPubkeys);
    // Fetch in batches to avoid overly large author arrays
    const batchSize = 200;
    for (let i = 0; i < contactAuthors.length && summaries.length < limit; i += batchSize) {
      const batch = contactAuthors.slice(i, i + batchSize);
      const filter: NDKFilter = {
        kinds: [SPELL_KIND as number],
        authors: batch,
        limit: Math.min(limit, 100),
      };
      const events = await subscribeAndCollect(filter, 8000, relaySet);
      for (const event of events) {
        if (!seen.has(event.id)) {
          seen.add(event.id);
          const summary = summarizeSpell(event, contactPubkeys);
          if (summary) summaries.push(summary);
        }
      }
    }
  }

  // Pad with recent public spells
  if (summaries.length < limit) {
    const remaining = limit - summaries.length;
    const publicFilter: NDKFilter = {
      kinds: [SPELL_KIND as number],
      limit: Math.min(remaining + 20, 200), // fetch a bit extra to account for dupes
    };
    const publicEvents = await subscribeAndCollect(publicFilter, 8000, relaySet);
    for (const event of sortEventsNewestFirst(publicEvents)) {
      if (!seen.has(event.id)) {
        seen.add(event.id);
        const summary = summarizeSpell(event, contactPubkeys);
        if (summary) summaries.push(summary);
        if (summaries.length >= limit) break;
      }
    }
  }

  // Sort: contacts first, then by recency
  summaries.sort((a, b) => {
    if (a.fromContact !== b.fromContact) return a.fromContact ? -1 : 1;
    return b.createdAt - a.createdAt;
  });

  return summaries.slice(0, limit);
}
