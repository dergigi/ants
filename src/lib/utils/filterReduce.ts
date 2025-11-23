import type { NDKFilter } from '@nostr-dev-kit/ndk';
import { isValidFilter } from '../ndk';

/**
 * Extended filter type that includes arbitrary tag fields (#*)
 */
type ExtendedFilter = NDKFilter & Record<string, unknown>;

/**
 * Merges multiple compatible Nostr filters into a single equivalent filter.
 * 
 * This function follows the official Nostr filter semantics:
 * - Within a single filter, all conditions are ANDed together
 * - Multiple filters in a REQ are ORed together
 * - List fields (ids, authors, kinds, #tags) use OR semantics internally
 * 
 * By merging filters that differ only in list fields, we can reduce the number
 * of filters while maintaining equivalent semantics.
 * 
 * @param filters - Array of NDKFilter objects to reduce
 * @returns Reduced array of filters (may be smaller than input if merges occurred)
 * 
 * @see https://nostrbook.dev/protocol/filter
 */
export function reduceFilters(filters: NDKFilter[]): NDKFilter[] {
  // Early return for trivial cases
  if (filters.length <= 1) {
    return filters;
  }

  // Group filters by their "base" (non-list, non-time fields)
  const groups = new Map<string, ExtendedFilter[]>();

  for (const filter of filters) {
    const base: Record<string, unknown> = {};

    // Extract all non-list, non-time fields to form the grouping key
    for (const [key, value] of Object.entries(filter as ExtendedFilter)) {
      if (value === undefined || value === null) continue;

      // Skip list fields - these will be merged
      if (key === 'ids' || key === 'authors' || key === 'kinds') continue;
      if (key.startsWith('#')) continue; // Tag fields

      // Skip time fields - these will be unioned
      if (key === 'since' || key === 'until') continue;

      // All other fields must match exactly to be mergeable
      base[key] = value;
    }

    // Create a stable grouping key
    const groupKey = JSON.stringify(base);
    const group = groups.get(groupKey);
    if (group) {
      group.push(filter as ExtendedFilter);
    } else {
      groups.set(groupKey, [filter as ExtendedFilter]);
    }
  }

  const result: NDKFilter[] = [];

  for (const [groupKey, group] of groups.entries()) {
    // If only one filter in group, no merge needed
    if (group.length === 1) {
      result.push(group[0] as NDKFilter);
      continue;
    }

    // Start with the base (non-list, non-time fields) from the first filter
    const merged: ExtendedFilter = JSON.parse(groupKey);

    // Merge list fields
    const ids = new Set<string>();
    const authors = new Set<string>();
    const kinds = new Set<number>();
    const tagArrays: Record<string, Set<string>> = {};

    // Time range fields
    let since: number | undefined;
    let until: number | undefined;

    // Process all filters in the group
    for (const f of group) {
      // Merge ids
      if (Array.isArray(f.ids)) {
        f.ids.forEach((id) => {
          if (typeof id === 'string') ids.add(id);
        });
      }

      // Merge authors
      if (Array.isArray(f.authors)) {
        f.authors.forEach((a) => {
          if (typeof a === 'string') authors.add(a);
        });
      }

      // Merge kinds
      if (Array.isArray(f.kinds)) {
        f.kinds.forEach((k) => {
          if (typeof k === 'number') kinds.add(k);
        });
      }

      // Merge tag arrays (#e, #p, #t, etc.)
      for (const [key, value] of Object.entries(f)) {
        if (!key.startsWith('#')) continue;
        if (!Array.isArray(value)) continue;

        if (!tagArrays[key]) {
          tagArrays[key] = new Set<string>();
        }
        value.forEach((val) => {
          if (typeof val === 'string') tagArrays[key].add(val);
        });
      }

      // Union time ranges: min(since), max(until)
      if (typeof f.since === 'number') {
        since = since === undefined ? f.since : Math.min(since, f.since);
      }
      if (typeof f.until === 'number') {
        until = until === undefined ? f.until : Math.max(until, f.until);
      }
    }

    // Add merged list fields to result
    if (ids.size > 0) {
      merged.ids = Array.from(ids);
    }
    if (authors.size > 0) {
      merged.authors = Array.from(authors);
    }
    if (kinds.size > 0) {
      merged.kinds = Array.from(kinds);
    }

    // Add merged tag arrays
    for (const [tagKey, set] of Object.entries(tagArrays)) {
      if (set.size > 0) {
        merged[tagKey] = Array.from(set);
      }
    }

    // Add time range fields
    if (since !== undefined) {
      merged.since = since;
    }
    if (until !== undefined) {
      merged.until = until;
    }

    // Validate the merged filter before adding
    if (isValidFilter(merged as NDKFilter)) {
      result.push(merged as NDKFilter);
    } else {
      // If merged filter is invalid, fall back to original filters
      // This shouldn't happen in practice, but provides a safety net
      console.warn('Merged filter is invalid, using original filters', merged);
      result.push(...group.map((f) => f as NDKFilter));
    }
  }

  return result;
}

