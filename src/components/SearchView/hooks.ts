import { useState, useEffect, useCallback, useRef } from 'react';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { resolveAuthorToNpub } from '@/lib/vertex';
import { searchEvents, expandParenthesizedOr } from '@/lib/search';
import { applySimpleReplacements } from '@/lib/search/replacements';
import { applyContentFilters } from '@/lib/contentAnalysis';
import { getCurrentProfileNpub, toImplicitUrlQuery, toExplicitInputFromUrl, ensureAuthorForBackend } from '@/lib/search/queryTransforms';
import { checkNip05 as verifyNip05Async } from '@/lib/vertex';

export function useSearchState(initialQuery: string = '') {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<NDKEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvingAuthor, setResolvingAuthor] = useState(false);
  const [baseResults, setBaseResults] = useState<NDKEvent[]>([]);
  const currentSearchId = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const verifiedMapRef = useRef<Map<string, boolean>>(new Map());

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  }, [setQuery]);

  return {
    query,
    setQuery,
    results,
    setResults,
    loading,
    setLoading,
    resolvingAuthor,
    setResolvingAuthor,
    baseResults,
    setBaseResults,
    currentSearchId,
    abortControllerRef,
    verifiedMapRef,
    handleInputChange
  };
}

export function useNip05Verification(results: NDKEvent[]) {
  const verifiedMapRef = useRef<Map<string, boolean>>(new Map());

  useEffect(() => {
    // Proactively verify missing entries (bounded to first 50) and then reorder results
    const toVerify: Array<{ pubkey: string; nip05: string }> = [];
    for (const evt of results.slice(0, 50)) {
      const pubkey = (evt.pubkey || evt.author?.pubkey) as string | undefined;
      const nip05 = (evt.author?.profile as { nip05?: string } | undefined)?.nip05;
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
      // This would need to be handled by the parent component
    })();
    return () => { cancelled = true; };
  }, [results]);

  return verifiedMapRef;
}

export function useSearchLogic(
  query: string,
  setResults: (results: NDKEvent[]) => void,
  setBaseResults: (results: NDKEvent[]) => void,
  setLoading: (loading: boolean) => void,
  setResolvingAuthor: (resolving: boolean) => void,
  currentSearchId: React.MutableRefObject<number>,
  abortControllerRef: React.MutableRefObject<AbortController | null>,
  pathname?: string,
  router?: any
) {
  const handleSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setBaseResults([]);
      return;
    }

    // Cancel any existing search
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this search
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Increment search ID to track this search
    const searchId = ++currentSearchId.current;

    setLoading(true);
    setResolvingAuthor(false);

    try {
      // Check if this query needs author resolution (contains by: tokens)
      const byMatch = searchQuery.match(/(?:^|\s)by:(\S+)(?:\s|$)/i);
      const needsAuthorResolution = Boolean(byMatch);

      let effectiveQuery = searchQuery;
      if (needsAuthorResolution && byMatch) {
        setResolvingAuthor(true);
        const author = (byMatch[1] || '').trim();
        let resolvedNpub: string | null = null;
        try {
          const TIMEOUT_MS = 2500;
          const timed = new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS));
          resolvedNpub = (await Promise.race([resolveAuthorToNpub(author), timed])) as string | null;
        } catch {}
        // If we resolved successfully, replace only the matched by: token with the resolved npub.
        // If resolution failed, proceed without modifying the query; the backend search will fallback.
        if (resolvedNpub) {
          // Replace by: token with resolved npub
          effectiveQuery = effectiveQuery.replace(/(^|\s)by:(\S+)(?=\s|$)/i, (m, pre) => `${pre}by:${resolvedNpub}`);

          // If currently on a profile page and the resolved author differs, navigate there and carry query
          const onProfilePage = /^\/p\//i.test(pathname || '');
          const currentProfileMatch = (pathname || '').match(/^\/p\/(npub1[0-9a-z]+)/i);
          const currentProfileNpub = currentProfileMatch ? currentProfileMatch[1] : null;
          if (onProfilePage && currentProfileNpub && currentProfileNpub.toLowerCase() !== resolvedNpub.toLowerCase()) {
            const implicitQ = toImplicitUrlQuery(effectiveQuery, resolvedNpub);
            const carry = encodeURIComponent(implicitQ);
            router?.push(`/p/${resolvedNpub}?q=${carry}`);
            setResolvingAuthor(false);
            setLoading(false);
            return;
          }
        }
        // Resolution phase complete (either way)
        setResolvingAuthor(false);
      }

      const expanded = await applySimpleReplacements(effectiveQuery);
      const searchResults = await searchEvents(expanded, 200, undefined, undefined, abortController.signal);
      
      // Check if search was aborted after getting results
      if (abortController.signal.aborted || currentSearchId.current !== searchId) {
        return;
      }

      setBaseResults(searchResults);
      setResults(searchResults);
    } catch (error) {
      if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Search aborted')) {
        // Search was cancelled, don't update state
        return;
      }
      console.error('Search error:', error);
      setResults([]);
      setBaseResults([]);
    } finally {
      setLoading(false);
      setResolvingAuthor(false);
    }
  }, [setResults, setBaseResults, setLoading, setResolvingAuthor, currentSearchId, abortControllerRef, pathname, router]);

  return { handleSearch };
}
