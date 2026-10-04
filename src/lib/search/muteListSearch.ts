import { NDKEvent } from '@nostr-dev-kit/ndk';
import { profileEventFromPubkey } from '../vertex';
import { sortEventsNewestFirst } from '../utils/searchUtils';
import { setMuteListResultData } from './muteListResultData';

const MUTE_LIST_PROFILE_BATCH_SIZE = 20;

/**
 * Collect muted pubkeys from the fetched mute-list events.
 */
function extractMuteListPubkeys(events: NDKEvent[]): string[] {
  const seen = new Set<string>();
  const pubkeys: string[] = [];

  for (const event of sortEventsNewestFirst(events)) {
    for (const tag of event.tags as string[][]) {
      const rawPubkey = Array.isArray(tag) && tag[0] === 'p' && typeof tag[1] === 'string' ? tag[1] : '';
      const pubkey = rawPubkey.trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/i.test(pubkey) || seen.has(pubkey)) continue;
      seen.add(pubkey);
      pubkeys.push(pubkey);
    }
  }

  return pubkeys;
}

/**
 * Resolve muted pubkeys into profile events without fanning out unbounded requests.
 */
export async function expandMuteListResults(events: NDKEvent[], options?: { signal?: AbortSignal; retain?: (event: NDKEvent) => NDKEvent | undefined }): Promise<{ pubkeys: string[]; profiles: NDKEvent[] }> {
  const pubkeys = extractMuteListPubkeys(events);
  if (pubkeys.length === 0) {
    return { pubkeys: [], profiles: [] };
  }

  const profiles: NDKEvent[] = [];

  for (let i = 0; i < pubkeys.length; i += MUTE_LIST_PROFILE_BATCH_SIZE) {
    if (options?.signal?.aborted) break;
    const batch = pubkeys.slice(i, i + MUTE_LIST_PROFILE_BATCH_SIZE);
    const resolvedProfiles = await Promise.all(batch.map(async (pubkey) => {
      try {
        return await profileEventFromPubkey(pubkey);
      } catch {
        return null;
      }
    }));

    for (const event of resolvedProfiles) {
      if (!event || options?.signal?.aborted) continue;
      const kept = options?.retain ? options.retain(event) : event;
      if (kept) profiles.push(kept);
    }
  }

  return { pubkeys, profiles };
}

export function isMuteListProfileSearch(effectiveKinds: number[], terms: string): boolean {
  return effectiveKinds.length === 1 && effectiveKinds[0] === 10000 && !terms.trim();
}

export function emitMuteListPartialResults(events: NDKEvent[], onPartialResults?: (results: NDKEvent[]) => void): void {
  if (!onPartialResults) return;

  const representative = sortEventsNewestFirst(events)[0];
  if (!representative) {
    onPartialResults([]);
    return;
  }

  setMuteListResultData(representative, {
    pubkeys: extractMuteListPubkeys(events),
    profiles: []
  });

  onPartialResults([representative]);
}
