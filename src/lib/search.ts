import { NDKEvent, NDKFilter, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { connectWithTimeout, resetLastReducedFilters } from './ndk';
import { getNip50SearchRelaySet } from './relays';
import { SEARCH_DEFAULT_KINDS } from './constants';
import { sortEventsNewestFirst } from './utils/searchUtils';
import { searchByNip19Identifier } from './search/idLookup';
import { getBroadRelaySet } from './search/relayManagement';
import { subscribeAndCollect, createPartialEmitter } from './search/subscriptions';
import { SearchOptions } from './search/types';
import { loadRules } from './search/replacements';
import { parseQuery } from './search/query/parse';
import { planQuery } from './search/query/plan';
import { abortable, checkAbort, identifierFilter, mapBounded, matchesStructured, resolvePlans } from './search/query/execute';
import { resolveQueryAuthor } from './search/query/resolveAuthor';
import { tryHandleProfileSearch } from './search/strategies/profileSearchStrategy';
import { expandMuteListResults, emitMuteListPartialResults } from './search/muteListSearch';
import { setMuteListResultData } from './search/muteListResultData';

export async function searchEvents(query: string, limit = 200, options?: SearchOptions, relaySetOverride?: NDKRelaySet, abortSignal?: AbortSignal): Promise<NDKEvent[]> {
  resetLastReducedFilters();
  checkAbort(abortSignal);
  parseQuery(query); // Syntax errors are reported before fetching aliases or connecting.
  const controller = new AbortController();
  const cancel = () => controller.abort();
  abortSignal?.addEventListener('abort', cancel, { once: true });
  const deadline = setTimeout(cancel, 30000);
  const signal = controller.signal;
  limit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.floor(limit))) : 200;
  const emitter = createPartialEmitter(options?.onPartialResults ? events => options.onPartialResults!(events.slice(0, limit)) : undefined, signal);
  try {
    const rules = await abortable(loadRules(), signal);
    const plan = planQuery(query, rules, SEARCH_DEFAULT_KINDS, new Date(), options?.exact);
    const filters = await abortable(resolvePlans(plan.branches, resolveQueryAuthor, signal), signal);
    checkAbort(signal);
    try { await abortable(connectWithTimeout(5000), signal); } catch { checkAbort(signal); }
    const searchRelays = relaySetOverride || await abortable(getNip50SearchRelaySet(), signal);
    let broad: Promise<NDKRelaySet> | undefined;
    const branchResults = new Map<number, NDKEvent[]>();
    let finished = false;
    const merge = () => {
      const unique = new Map<string, NDKEvent>();
      for (const [, events] of [...branchResults].sort(([a], [b]) => a - b)) {
        for (const event of events) if (!unique.has(event.id)) unique.set(event.id, event);
      }
      const events = [...unique.values()];
      return (plan.branches.every(b => b.profile !== undefined) ? events : sortEventsNewestFirst(events)).slice(0, limit);
    };
    const results = await mapBounded(plan.branches, async (branch, index) => {
      let filter: NDKFilter = { ...filters[index], limit };
      const leaves = plan.leaves[index];
      // Only an unquoted standalone identifier receives special lookup semantics.
      if (leaves.length === 1 && leaves[0].type === 'text') {
        if (/^(note|nevent|naddr)1/i.test(leaves[0].value)) {
          identifierFilter(leaves[0].value); // Validate instead of silently falling through.
          const events = await abortable(searchByNip19Identifier(leaves[0].value, signal, getBroadRelaySet), signal);
          emitter?.(events);
          return events;
        }
        const identifier = identifierFilter(leaves[0].value);
        if (identifier) filter = { ...(identifier.authors && !identifier.kinds ? { kinds: SEARCH_DEFAULT_KINDS } : {}), ...identifier, limit };
      }
      const relaySet = filter.search ? searchRelays : relaySetOverride || await abortable(broad ??= getBroadRelaySet(), signal);
      const accept = (events: NDKEvent[]) => events.filter(e => matchesStructured(e, filter));
      if (branch.profile !== undefined) {
        const profiles = await abortable(tryHandleProfileSearch(`p:${branch.profile}`, {
          effectiveKinds: [0], chosenRelaySet: relaySet, abortSignal: signal, limit,
          onProfileResultsUpdate: events => {
            if (abortSignal?.aborted || (!finished && signal.aborted)) return;
            const accepted = accept(events);
            branchResults.set(index, accepted);
            if (finished) options?.onProfileResultsUpdate?.(merge());
            else emitter?.(accepted);
          }
        }), signal);
        const accepted = accept(profiles || []);
        emitter?.(accepted);
        return accepted;
      }
      const muteList = filter.kinds?.length === 1 && filter.kinds[0] === 10000 && !!filter.authors?.length && !filter.search;
      const events = await subscribeAndCollect(filter, {
        timeoutMs: 8000, relaySet, abortSignal: signal, maxEvents: limit,
        accept: event => matchesStructured(event, filter),
        onPartial: batch => muteList ? emitMuteListPartialResults(batch, emitter) : emitter?.(batch)
      });
      checkAbort(signal);
      if (muteList && events.length) {
        const representative = sortEventsNewestFirst(events)[0];
        setMuteListResultData(representative, await abortable(expandMuteListResults(events), signal));
        return [representative];
      }
      return events;
    }, signal);
    checkAbort(signal);
    results.forEach((events, index) => branchResults.set(index, events));
    finished = true;
    return merge();
  } catch (error) {
    if (signal.aborted && !abortSignal?.aborted) throw new Error('Search timed out after 30 seconds. Try fewer branches.');
    throw error;
  } finally {
    cancel();
    clearTimeout(deadline);
    abortSignal?.removeEventListener('abort', cancel);
    emitter?.dispose();
  }
}
