'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEquals, faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';
import { expandParenthesizedOr, parseOrQuery } from '@/lib/search';
import { applySimpleReplacements } from '@/lib/search/replacements';
import { resolveRelativeDates } from '@/lib/search/relativeDates';
import { getLastReducedFilters } from '@/lib/ndk';
import {
  getAdaptiveDebounceMs,
  resolveByTokensInQuery,
  resolvePTokensInQuery
} from '@/lib/queryTranslationHelpers';

interface QueryTranslationProps {
  query: string;
  onAuthorResolved?: () => void;
}

export default function QueryTranslation({ query, onAuthorResolved }: QueryTranslationProps) {
  const [isExplanationExpanded, setIsExplanationExpanded] = useState(false);
  const [translation, setTranslation] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const authorResolutionCache = useRef<Map<string, string>>(new Map());
  const lastResolvedQueryRef = useRef<string | null>(null);
  const resolutionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasTriggeredSearchRef = useRef<boolean>(false);

  const generateTranslation = useCallback(async (q: string, skipAuthorResolution = false): Promise<string> => {
    try {
      const ppMatch = q.match(/(?:^|\s)pp:(vertex|relatr|relay)(?:\s|$)/i);
      const ppProvider = ppMatch ? ppMatch[1]?.toLowerCase() : null;
      const withoutPp = q.replace(/(?:^|\s)pp:(vertex|relatr|relay)(?:\s|$)/gi, ' ').trim();

      const { resolved: dateResolved } = resolveRelativeDates(withoutPp);
      const afterReplacements = await applySimpleReplacements(dateResolved);
      const distributed = expandParenthesizedOr(afterReplacements);

      const resolvedDistributed = skipAuthorResolution
        ? distributed
        : await Promise.all(distributed.map((s) =>
            resolveByTokensInQuery(s, false, authorResolutionCache.current, ppProvider)
          ));

      const withPResolved = resolvedDistributed.map((s) => resolvePTokensInQuery(s));

      if (distributed.length > 1) {
        let preview = withPResolved.join('\n');
        if (ppProvider) preview = `[pp:${ppProvider}] ${preview}`;
        return preview;
      }

      const finalQueriesSet = new Set<string>();
      for (const s of withPResolved) {
        const parts = parseOrQuery(s);
        if (parts.length > 1) {
          parts.forEach((p) => { const t = p.trim(); if (t) finalQueriesSet.add(t); });
        } else {
          const t = s.trim(); if (t) finalQueriesSet.add(t);
        }
      }
      const finalQueries = Array.from(finalQueriesSet);

      let preview = finalQueries.length > 0 ? finalQueries.join('\n') : afterReplacements;
      if (ppProvider) preview = `[pp:${ppProvider}] ${preview}`;
      return preview;
    } catch {
      return '';
    }
  }, [authorResolutionCache]);

  useEffect(() => {
    let cancelled = false;
    let debounceId: ReturnType<typeof setTimeout> | null = null;

    if (!query.trim()) {
      setTranslation('');
      return;
    }

    const generateAndSetTranslation = async () => {
      hasTriggeredSearchRef.current = false;

      const immediateResult = await generateTranslation(query, true);
      if (!cancelled) setTranslation(immediateResult);

      if (/(^|\s)by:/i.test(query)) {
        const resolvedResult = await generateTranslation(query, false);
        if (!cancelled) {
          setTranslation(resolvedResult);
          if (resolutionTimeoutRef.current) clearTimeout(resolutionTimeoutRef.current);
          resolutionTimeoutRef.current = setTimeout(() => {
            if (lastResolvedQueryRef.current !== query && !hasTriggeredSearchRef.current) {
              lastResolvedQueryRef.current = query;
              hasTriggeredSearchRef.current = true;
              onAuthorResolved?.();
            }
          }, 2000);
        }
      }
    };

    debounceId = setTimeout(generateAndSetTranslation, getAdaptiveDebounceMs());

    return () => {
      cancelled = true;
      if (debounceId) clearTimeout(debounceId);
      if (resolutionTimeoutRef.current) {
        clearTimeout(resolutionTimeoutRef.current);
        resolutionTimeoutRef.current = null;
      }
    };
  }, [query, generateTranslation, onAuthorResolved]);

  const filtersJson = (() => {
    try {
      const filters = getLastReducedFilters();
      if (!filters || filters.length === 0) return '';
      const json = JSON.stringify(filters, null, 2);
      return json.length > 2000 ? `${json.slice(0, 2000)}\n…` : json;
    } catch {
      return '';
    }
  })();

  if (!translation) return null;

  const isLongTranslation = translation.split('\n').length > 4;

  return (
    <div
      id="search-explanation"
      className={`mt-1 text-[11px] text-gray-400 font-mono break-all whitespace-pre-wrap flex items-start gap-2 ${
        isLongTranslation ? 'cursor-pointer hover:bg-gray-800/20 rounded px-1 py-0.5 -mx-1 -my-0.5' : ''
      }`}
      onClick={() => { if (isLongTranslation) setIsExplanationExpanded(!isExplanationExpanded); }}
    >
      <button
        type="button"
        className="mt-0.5 flex-shrink-0 text-xs text-gray-500 hover:text-gray-200"
        onClick={(e) => { e.stopPropagation(); if (filtersJson) setShowFilters((prev) => !prev); }}
        aria-label="Show effective filters"
        aria-expanded={showFilters}
      >
        <FontAwesomeIcon icon={faEquals} />
      </button>
      <div className="flex-1 min-w-0">
        {isLongTranslation && !isExplanationExpanded ? (
          <>
            <div className="overflow-hidden" style={{
              display: '-webkit-box',
              WebkitLineClamp: 4,
              WebkitBoxOrient: 'vertical'
            }}>
              {translation.split('\n').slice(0, 4).join('\n')}
            </div>
            <div className="flex items-center justify-center mt-1 text-gray-500">
              <FontAwesomeIcon icon={faChevronDown} className="text-[10px]" />
            </div>
          </>
        ) : (
          <>
            <span>{translation}</span>
            {isLongTranslation && (
              <div className="flex items-center justify-center mt-1 text-gray-500">
                <FontAwesomeIcon icon={faChevronUp} className="text-[10px]" />
              </div>
            )}
          </>
        )}
        {showFilters && filtersJson && (
          <pre className="mt-1 max-h-48 overflow-auto rounded border border-gray-700/60 bg-black/40 p-2 text-[10px] leading-snug whitespace-pre-wrap">
            {filtersJson}
          </pre>
        )}
      </div>
    </div>
  );
}
