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
import { abortable, checkAbort, identifierFilter, mapBounded, createStructuredMatcher, resolvePlans } from './search/query/execute';
import { ResultStore } from './search/query/resultStore';
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
  const state: { reason?: 'timeout' | 'limit'; finished: boolean } = { finished: false };
  const stop = (reason: 'timeout' | 'limit') => { state.reason ??= reason; cancel(); };
  const deadline = setTimeout(() => stop('timeout'), 30000);
  const signal = controller.signal;
  limit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.floor(limit))) : 200;
  const store = new ResultStore(() => stop('limit'));
  const profileOrder = new Map<number, string[]>();
  const muteIds = new Set<string>();
  const ordinaryIds = new Set<string>();
  const muteRepresentatives = new Map<number, NDKEvent>();
  let profileOnly = false;
  const merge = () => {
    const representatives = new Set([...muteRepresentatives.values()].map(event => event.id));
    const events = store.values().filter(event => !muteIds.has(event.id) || ordinaryIds.has(event.id) || representatives.has(event.id));
    if (!profileOnly) return sortEventsNewestFirst(events).slice(0, limit);
    const byId = new Map(events.map(event => [event.id, event]));
    const ordered = [...new Set([...profileOrder].sort(([a], [b]) => a - b).flatMap(([, ids]) => ids))];
    return ordered.flatMap(id => byId.has(id) ? [byId.get(id)!] : []).slice(0, limit);
  };
  const retain = (events: NDKEvent[]) => {
    const kept: NDKEvent[] = [];
    for (const event of events) {
      if (abortSignal?.aborted || state.reason) break;
      const canonical = store.keep(event);
      if (canonical) kept.push(canonical);
    }
    return kept;
  };
  const emitter = createPartialEmitter(options?.onPartialResults ? events => options.onPartialResults!(events.slice(0, limit)) : undefined, signal);
  const reportIncomplete = () => options?.onIncomplete?.(state.reason === 'timeout'
    ? 'Search timed out. Showing the results collected so far; try fewer branches or retry.'
    : 'Search reached its result or memory limit. Showing the results collected so far.');
  try {
    const rules = await abortable(loadRules(), signal);
    const plan = planQuery(query, rules, SEARCH_DEFAULT_KINDS, new Date(), options?.exact);
    const filters = await abortable(resolvePlans(plan.branches, resolveQueryAuthor, signal), signal);
    checkAbort(signal);
    try { await abortable(connectWithTimeout(5000), signal); } catch { checkAbort(signal); }
    const searchRelays = relaySetOverride || await abortable(getNip50SearchRelaySet(), signal);
    let broad: Promise<NDKRelaySet> | undefined;
    profileOnly = plan.branches.every(b => b.profile !== undefined);
    await mapBounded(plan.branches, async (branch, index) => {
      let filter: NDKFilter = { ...filters[index], limit };
      const leaves = plan.leaves[index];
      // Only an unquoted standalone identifier receives special lookup semantics.
      if (leaves.length === 1 && leaves[0].type === 'text') {
        if (/^(note|nevent|naddr)1/i.test(leaves[0].value)) {
          identifierFilter(leaves[0].value); // Validate instead of silently falling through.
          const events = await abortable(searchByNip19Identifier(leaves[0].value, signal, getBroadRelaySet), signal);
          const accepted = retain(events);
          accepted.forEach(event => ordinaryIds.add(event.id));
          emitter?.(accepted);
          return;
        }
        const identifier = identifierFilter(leaves[0].value);
        if (identifier) filter = { ...(identifier.authors && !identifier.kinds ? { kinds: SEARCH_DEFAULT_KINDS } : {}), ...identifier, limit };
      }
      const relaySet = filter.search ? searchRelays : relaySetOverride || await abortable(broad ??= getBroadRelaySet(), signal);
      const matches = createStructuredMatcher(filter);
      const muteList = filter.kinds?.length === 1 && filter.kinds[0] === 10000 && !!filter.authors?.length && !filter.search;
      const accept = (events: NDKEvent[]) => {
        const accepted = retain(events.filter(matches));
        for (const event of accepted) {
          if (!muteList) ordinaryIds.add(event.id);
          else {
            muteIds.add(event.id);
            const previous = muteRepresentatives.get(index);
            if (!previous || (event.created_at ?? 0) > (previous.created_at ?? 0)) muteRepresentatives.set(index, event);
          }
        }
        return accepted;
      };
      if (branch.profile !== undefined) {
        const profiles = await abortable(tryHandleProfileSearch(`p:${branch.profile}`, {
          effectiveKinds: [0], chosenRelaySet: relaySet, abortSignal: signal, limit,
          onProfileResultsUpdate: events => {
            if (abortSignal?.aborted || state.reason || (!state.finished && signal.aborted)) return;
            const accepted = accept(events);
            profileOrder.set(index, accepted.map(event => event.id));
            if (state.finished) {
              options?.onProfileResultsUpdate?.(merge());
              if (state.reason) reportIncomplete();
            }
            else emitter?.(accepted);
          }
        }), signal);
        const accepted = accept(profiles || []);
        if (!state.reason || accepted.length) profileOrder.set(index, accepted.map(event => event.id));
        emitter?.(accepted);
        return;
      }
      const events = await subscribeAndCollect(filter, {
        timeoutMs: 8000, relaySet, abortSignal: signal, maxEvents: limit,
        accept: event => {
          const duplicate = store.has(event.id);
          return accept([event]).length > 0 && !duplicate;
        },
        onPartial: batch => {
          const accepted = accept(batch);
          if (muteList) emitMuteListPartialResults(accepted, emitter);
          else emitter?.(accepted);
        }
      });
      const accepted = accept(events);
      checkAbort(signal);
      if (muteList && events.length) {
        const representative = sortEventsNewestFirst(accepted)[0];
        if (!representative) return;
        setMuteListResultData(representative, await abortable(expandMuteListResults(accepted, { signal, retain: event => store.keep(event, false) }), signal));
        return;
      }
    }, signal);
    checkAbort(signal);
    state.finished = true;
    return merge();
  } catch (error) {
    if (state.reason && !abortSignal?.aborted) {
      reportIncomplete();
      return merge();
    }
    throw error;
  } finally {
    cancel();
    clearTimeout(deadline);
    abortSignal?.removeEventListener('abort', cancel);
    emitter?.dispose();
  }
}
