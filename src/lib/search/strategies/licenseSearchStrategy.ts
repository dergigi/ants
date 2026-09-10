import { NDKEvent } from '@nostr-dev-kit/ndk';
import { applyDateFilter } from '../queryParsing';
import { subscribeAndCollect } from '../subscriptions';
import { getBroadRelaySet } from '../relayManagement';
import { sortEventsNewestFirst } from '../../utils/searchUtils';
import { SearchContext, TagTFilter } from '../types';

/**
 * Handle license:VALUE-only queries via direct tag subscription (#license)
 * Returns null if the query is not a license-only query
 */
export async function tryHandleLicenseSearch(
  query: string,
  context: SearchContext
): Promise<NDKEvent[] | null> {
  const { effectiveKinds, dateFilter, limit, abortSignal, extensionFilters, onPartialResults } = context;
  
  const licenseMatches = Array.from(query.match(/\blicense:([^\s)]+)\b/gi) || []).map((m) => m.split(':')[1]?.trim()).filter(Boolean) as string[];
  const nonLicenseRemainder = query.replace(/\blicense:[^\s)]+/gi, '').trim();
  
  if (licenseMatches.length > 0 && nonLicenseRemainder.length === 0) {
    const licenses = Array.from(new Set(licenseMatches.map((v) => v.toUpperCase())));
    const licenseFilter: TagTFilter = applyDateFilter({ kinds: effectiveKinds, '#license': licenses, limit: Math.max(limit, 500) }, dateFilter) as TagTFilter;
    const tagRelaySet = await getBroadRelaySet();
    const results = await subscribeAndCollect(licenseFilter, {
      timeoutMs: 10000,
      relaySet: tagRelaySet,
      abortSignal,
      onPartial: onPartialResults
    });
    let final = results;
    if (extensionFilters && extensionFilters.length > 0) {
      final = final.filter((e) => extensionFilters.every((f) => f(e.content || '')));
    }
    return sortEventsNewestFirst(final).slice(0, limit);
  }
  
  return null;
}

