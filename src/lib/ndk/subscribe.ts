import { NDKEvent, NDKFilter, NDKRelaySet, NDKSubscription, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import { reduceFilters } from '../utils/filterReduce';
import { ndk } from './index';
import { isUndefinedBindWasmError, disableCacheAdapter, isNoFiltersToMergeError } from './cache';

let lastReducedFilters: NDKFilter[] = [];
export const getLastReducedFilters = (): NDKFilter[] => lastReducedFilters;
export const resetLastReducedFilters = (): void => {
  lastReducedFilters = [];
};

/**
 * Validate NDK filter to prevent empty filter errors
 * @param filter - The filter to validate
 * @returns true if filter is valid, false otherwise
 */
export const isValidFilter = (filter: NDKFilter): boolean => {
  if (!filter || typeof filter !== 'object') {
    return false;
  }

  // Check if filter has at least one meaningful property
  const meaningfulKeys = ['kinds', 'authors', 'ids', 'search', '#t', '#e', '#p', 'since', 'until', 'limit'];
  return meaningfulKeys.some(key => {
    const value = (filter as Record<string, unknown>)[key];
    if (value === undefined || value === null) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'number') return value > 0;
    return true;
  });
};

/**
 * Safely subscribe with NDK with proper filter validation and WASM error handling
 * @param filters - Array of filters to validate and subscribe with
 * @param options - Subscription options
 * @returns NDK subscription or null if filters are invalid
 */
export const safeSubscribe = (filters: NDKFilter[], options: Record<string, unknown> = {}): NDKSubscription | null => {
  const trackFilters = Boolean((options as { __trackFilters?: boolean }).__trackFilters);
  // Validate all filters
  const validFilters = filters.filter(isValidFilter);

  if (validFilters.length === 0) {
    console.warn('No valid filters provided to safeSubscribe, skipping subscription');
    return null;
  }

  if (validFilters.length !== filters.length) {
    console.warn(`Filtered out ${filters.length - validFilters.length} invalid filters`);
  }

  // Reduce filters: merge compatible filters to reduce the number of REQ messages
  // This automatically optimizes cases like multiple authors with the same kinds/search constraints
  const reducedFilters = reduceFilters(validFilters);
  if (trackFilters) {
    lastReducedFilters = [...lastReducedFilters, ...reducedFilters];
  }

  if (reducedFilters.length < validFilters.length) {
    console.log(`Reduced ${validFilters.length} filters to ${reducedFilters.length} filters`);
  }

  try {
    return ndk.subscribe(reducedFilters, options);
  } catch (error) {
    // If the sqlite-wasm cache throws the binding error, disable cache and retry once live-only
    if (isUndefinedBindWasmError(error)) {
      console.warn('WASM cache binding error detected, disabling cache and retrying with live data only');
      disableCacheAdapter(error);
      try {
        // Force cache usage to ONLY_RELAY to bypass cache completely
        const liveOptions = { ...options, cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY };
        return ndk.subscribe(reducedFilters, liveOptions);
      } catch (e2) {
        console.error('Failed to create NDK subscription after disabling cache:', e2);
        return null;
      }
    } else if (isNoFiltersToMergeError(error)) {
      // Gracefully ignore and return null subscription
      console.warn('Ignoring subscription with no effective filters');
      return null;
    }
    console.error('Failed to create NDK subscription:', error);
    return null;
  }
};

/**
 * Safely publish an NDK event with proper error handling
 *
 * Catches common NDK publishing errors like "Not enough relays received
 * the event" and relay connection issues.
 *
 * @param event - The NDK event to publish
 * @param relaySet - Optional relay set to use for publishing
 * @returns Promise that resolves to true if published successfully, false otherwise
 */
export const safePublish = async (event: NDKEvent, relaySet?: NDKRelaySet): Promise<boolean> => {
  try {
    if (relaySet) {
      await event.publish(relaySet);
    } else {
      await event.publish();
    }
    return true;
  } catch (error) {
    console.warn('Failed to publish event:', error);

    // Log specific error types for debugging
    if (error instanceof Error) {
      if (error.message.includes('Not enough relays received the event')) {
        console.warn('Publish failed: No relays available or responding');
      } else if (error.message.includes('relay')) {
        console.warn('Publish failed: Relay connection issue');
      }
    }

    return false;
  }
};
