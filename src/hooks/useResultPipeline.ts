'use client';

import { useState, useEffect, useCallback, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import Fuse from 'fuse.js';
import { FilterSettings } from '@/components/ClientFilters';
import { SortOrder } from '@/components/SortCollapsed';
import { applyContentFilters, isEmojiSearch } from '@/lib/contentAnalysis';
import { extractRelaySourcesFromEvent } from '@/lib/urlUtils';
import { checkNip05 as verifyNip05Async } from '@/lib/vertex';
import { setPrefetchedProfile, prepareProfileEventForPrefetch } from '@/lib/profile/prefetch';
import { SEARCH_FILTER_THRESHOLD } from '@/lib/constants';

/**
 * The client-side result pipeline: NIP-05 verification ordering,
 * content filters, relay toggles, fuzzy filtering, and sorting.
 */
export function useResultPipeline(options: {
  results: NDKEvent[];
  setResults: Dispatch<SetStateAction<NDKEvent[]>>;
  query: string;
}) {
  const { results, setResults, query } = options;
  const [filterSettings, setFilterSettings] = useState<FilterSettings>({ maxEmojis: 3, maxHashtags: 3, maxMentions: 6, hideLinks: false, hideBridged: true, resultFilter: '', verifiedOnly: false, fuzzyEnabled: true, hideBots: false, hideNsfw: false, filterMode: 'intelligently' });
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [successfullyActiveRelays, setSuccessfullyActiveRelays] = useState<Set<string>>(new Set());
  const [toggledRelays, setToggledRelays] = useState<Set<string>>(new Set());
  // Maintain a map of pubkey->verified to avoid re-verifying
  const verifiedMapRef = useRef<Map<string, boolean>>(new Map());

  // Determine if filters should be enabled based on filterMode
  const shouldEnableFilters = useMemo(() => {
    switch (filterSettings.filterMode) {
      case 'always':
        return true;
      case 'never':
        return false;
      case 'intelligently':
        return results.length >= SEARCH_FILTER_THRESHOLD;
      default:
        return false;
    }
  }, [filterSettings.filterMode, results.length]);

  // Toggle relay on/off for client-side filtering
  const toggleRelay = useCallback((relayUrl: string) => {
    setToggledRelays(prev => {
      const newSet = new Set(prev);
      if (newSet.has(relayUrl)) {
        newSet.delete(relayUrl);
      } else {
        newSet.add(relayUrl);
      }
      return newSet;
    });
  }, []);

  // Filter results based on toggled relay state
  const filterByRelays = useCallback((events: NDKEvent[]) => {
    if (toggledRelays.size === 0) {
      // No relays toggled off, return all events
      return events;
    }

    return events.filter(event => {
      const eventSources = extractRelaySourcesFromEvent(event);
      // Keep event if it has sources from toggled relays
      return eventSources.some(source => toggledRelays.has(source));
    });
  }, [toggledRelays]);

  useEffect(() => {
    // Proactively verify missing entries (bounded to first 50) and then reorder results
    const toVerify: Array<{ pubkey: string; nip05: string }> = [];
    for (const evt of results.slice(0, 50)) {
      const pubkey = (evt.pubkey || evt.author?.pubkey) as string | undefined;
      const profile = evt.author?.profile as { nip05?: string | { url?: string; verified?: boolean } } | undefined;
      const raw = profile?.nip05;
      const nip05 = typeof raw === 'string' ? raw : raw?.url;
      const verifiedHint = typeof raw === 'object' && raw ? raw.verified : undefined;
      if (pubkey && verifiedHint === true) {
        verifiedMapRef.current.set(pubkey, true);
      }
      if (!pubkey || !nip05) continue;
      if (!verifiedMapRef.current.has(pubkey)) toVerify.push({ pubkey, nip05 });
    }
    if (toVerify.length === 0) return;
    let cancelled = false;
    (async () => {
      await Promise.allSettled(toVerify.map(async ({ pubkey, nip05 }) => {
        try {
          const ok = await verifyNip05Async(pubkey, nip05);
          if (!cancelled) verifiedMapRef.current.set(pubkey, Boolean(ok));
        } catch {
          if (!cancelled) verifiedMapRef.current.set(pubkey, false);
        }
      }));
      if (cancelled) return;
      // Reorder results by verified first while preserving relative order for ties
      setResults(prev => {
        const index = new Map<string, number>();
        prev.forEach((e, i) => {
          const pk = (e.pubkey || e.author?.pubkey) as string | undefined;
          if (pk) index.set(pk, i);
        });
        const copy = [...prev];
        copy.sort((a, b) => {
          const ap = (a.pubkey || a.author?.pubkey) as string | undefined;
          const bp = (b.pubkey || b.author?.pubkey) as string | undefined;
          const av = ap ? (verifiedMapRef.current.get(ap) === true ? 1 : 0) : 0;
          const bv = bp ? (verifiedMapRef.current.get(bp) === true ? 1 : 0) : 0;
          if (av !== bv) return bv - av; // verified first
          // stable by original index
          const ai = ap ? (index.get(ap) ?? 0) : 0;
          const bi = bp ? (index.get(bp) ?? 0) : 0;
          return ai - bi;
        });
        return copy;
      });
    })();
    return () => { cancelled = true; };
  }, [results, setResults]);

  const emojiAutoDisabled = filterSettings.filterMode === 'intelligently' && isEmojiSearch(query);

  const filteredResults = useMemo(
    () => {
      let filtered = results;

      // Apply content filters first
      if (shouldEnableFilters) {
        filtered = applyContentFilters(
          filtered,
          // Disable emoji filter when searching for multiple emojis in Smart mode
          emojiAutoDisabled ? null : filterSettings.maxEmojis,
          filterSettings.maxHashtags,
          filterSettings.maxMentions,
          filterSettings.hideLinks,
          filterSettings.hideBridged,
          filterSettings.verifiedOnly,
          (pubkey) => Boolean(pubkey && verifiedMapRef.current.get(pubkey) === true),
          filterSettings.hideBots,
          filterSettings.hideNsfw
        );
      }

      // Apply relay filtering
      return filterByRelays(filtered);
    },
    [results, shouldEnableFilters, emojiAutoDisabled, filterSettings.maxEmojis, filterSettings.maxHashtags, filterSettings.maxMentions, filterSettings.hideLinks, filterSettings.hideBridged, filterSettings.verifiedOnly, filterSettings.hideBots, filterSettings.hideNsfw, filterByRelays]
  );

  // Apply optional fuzzy filter on top of client-side filters
  const fuseFilteredResults = useMemo(() => {
    const q = (shouldEnableFilters && filterSettings.fuzzyEnabled ? (filterSettings.resultFilter || '') : '').trim();
    if (!q) return filteredResults;
    const fuse = new Fuse(filteredResults, {
      includeScore: false,
      threshold: 0.35,
      ignoreLocation: true,
      keys: [
        { name: 'content', weight: 1 }
      ]
    });
    return fuse.search(q).map(r => r.item);
  }, [filteredResults, filterSettings.resultFilter, filterSettings.fuzzyEnabled, shouldEnableFilters]);

  // Separate profiles from non-profiles and sort only non-profiles by date
  const sortedResults = useMemo(() => {
    const profiles: NDKEvent[] = [];
    const nonProfiles: NDKEvent[] = [];

    // Separate events by kind
    for (const event of fuseFilteredResults) {
      if (event.kind === 0) {
        profiles.push(event);
      } else {
        nonProfiles.push(event);
      }
    }

    // Sort non-profiles by created_at based on sortOrder
    const sortedNonProfiles = [...nonProfiles].sort((a, b) => {
      if (sortOrder === 'newest') {
        return (b.created_at || 0) - (a.created_at || 0);
      } else {
        return (a.created_at || 0) - (b.created_at || 0);
      }
    });

    // Return profiles first (maintaining their verified-first order), then sorted non-profiles
    return [...profiles, ...sortedNonProfiles];
  }, [fuseFilteredResults, sortOrder]);

  // Check if there are non-profile results to show sort dropdown
  const hasNonProfileResults = useMemo(() => {
    return fuseFilteredResults.some(event => event.kind !== 0);
  }, [fuseFilteredResults]);

  // Seed profile prefetch for visible profile cards as soon as results materialize
  useEffect(() => {
    try {
      for (const ev of fuseFilteredResults) {
        if (ev.kind === 0) {
          // Use author.pubkey if available, fallback to event.pubkey
          const pubkey = ev.author?.pubkey || ev.pubkey;
          if (pubkey) {
            setPrefetchedProfile(pubkey, prepareProfileEventForPrefetch(ev));
          }
        }
      }
    } catch {}
  }, [fuseFilteredResults]);

  return {
    filterSettings,
    setFilterSettings,
    sortOrder,
    setSortOrder,
    successfullyActiveRelays,
    setSuccessfullyActiveRelays,
    toggledRelays,
    setToggledRelays,
    toggleRelay,
    emojiAutoDisabled,
    fuseFilteredResults,
    sortedResults,
    hasNonProfileResults
  };
}
