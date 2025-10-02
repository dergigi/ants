'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEquals, faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';
import { expandParenthesizedOr, parseOrQuery } from '@/lib/search';
import { resolveAuthorToNpub } from '@/lib/vertex';
import { applySimpleReplacements } from '@/lib/search/replacements';
import { nip19 } from 'nostr-tools';

interface QueryTranslationProps {
  query: string;
  onAuthorResolved?: () => void;
}

export default function QueryTranslation({ query, onAuthorResolved }: QueryTranslationProps) {
  const [isExplanationExpanded, setIsExplanationExpanded] = useState(false);
  const [translation, setTranslation] = useState<string>('');
  const authorResolutionCache = useRef<Map<string, string>>(new Map());
  const lastResolvedQueryRef = useRef<string | null>(null);
  const resolutionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasTriggeredSearchRef = useRef<boolean>(false);

  const generateTranslation = useCallback(async (query: string, skipAuthorResolution = false): Promise<string> => {
    try {
      // 1) Apply simple replacements first
      const afterReplacements = await applySimpleReplacements(query);

      // 2) Recursive OR substitution (distribute parentheses)
      const distributed = expandParenthesizedOr(afterReplacements);

      // Helper: resolve all by:<author> tokens within a single query string
      const resolveByTokensInQuery = async (q: string): Promise<string> => {
        const rx = /(^|\s)by:(\S+)/gi;
        let result = '';
        let lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = rx.exec(q)) !== null) {
          const full = m[0];
          const pre = m[1] || '';
          const raw = m[2] || '';
          const match = raw.match(/^([^),.;]+)([),.;]*)$/);
          const core = (match && match[1]) || raw;
          const suffix = (match && match[2]) || '';
          let replacement = core;
          
          if (!skipAuthorResolution && !/^npub1[0-9a-z]+$/i.test(core)) {
            // Check cache first
            if (authorResolutionCache.current.has(core)) {
              replacement = authorResolutionCache.current.get(core) || core;
            } else {
              try {
                const npub = await resolveAuthorToNpub(core);
                if (npub) {
                  replacement = npub;
                  authorResolutionCache.current.set(core, npub);
                }
              } catch {}
            }
          }
          result += q.slice(lastIndex, m.index);
          result += `${pre}by:${replacement}${suffix}`;
          lastIndex = m.index + full.length;
        }
        result += q.slice(lastIndex);
        return result;
      };

      // Helper: normalize p:<token> where token may be hex, npub or nprofile
      const resolvePTokensInQuery = (q: string): string => {
        const rx = /(^|\s)p:(\S+)/gi;
        let result = '';
        let lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = rx.exec(q)) !== null) {
          const full = m[0];
          const pre = m[1] || '';
          const raw = m[2] || '';
          const match = raw.match(/^([^),.;]+)([),.;]*)$/);
          const core = (match && match[1]) || raw;
          const suffix = (match && match[2]) || '';
          let replacement = core;
          if (/^[0-9a-fA-F]{64}$/.test(core)) {
            try { replacement = nip19.npubEncode(core.toLowerCase()); } catch {}
          } else if (/^npub1[0-9a-z]+$/i.test(core)) {
            replacement = core;
          } else if (/^nprofile1[0-9a-z]+$/i.test(core)) {
            try {
              const decoded = nip19.decode(core);
              if (decoded?.type === 'nprofile') {
                const pk = (decoded.data as { pubkey: string }).pubkey;
                replacement = nip19.npubEncode(pk);
              }
            } catch {}
          }
          result += q.slice(lastIndex, m.index);
          result += `${pre}p:${replacement}${suffix}`;
          lastIndex = m.index + full.length;
        }
        result += q.slice(lastIndex);
        return result;
      };

      // 3) Resolve authors inside each distributed branch (if not skipping)
      const resolvedDistributed = skipAuthorResolution 
        ? distributed 
        : await Promise.all(distributed.map((q) => resolveByTokensInQuery(q)));

      const withPResolved = resolvedDistributed.map((q) => resolvePTokensInQuery(q));

      // 4) For parenthesized OR expansion, show all expanded queries
      // Don't split further if we already have multiple distributed queries
      if (distributed.length > 1) {
        // We have parenthesized OR expansion - show all expanded queries
        const preview = withPResolved.join('\n');
        return preview;
      }

      // 5) Split into multiple queries if top-level OR exists (for non-parenthesized OR)
      const finalQueriesSet = new Set<string>();
      for (const q of withPResolved) {
        const parts = parseOrQuery(q);
        if (parts.length > 1) {
          parts.forEach((p) => { const s = p.trim(); if (s) finalQueriesSet.add(s); });
        } else {
          const s = q.trim(); if (s) finalQueriesSet.add(s);
        }
      }
      const finalQueries = Array.from(finalQueriesSet);

      // Format compact preview
      const preview = finalQueries.length > 0 ? finalQueries.join('\n') : afterReplacements;
      return preview;
    } catch {
      return '';
    }
  }, [authorResolutionCache]);

  // Generate translation when query changes
  useEffect(() => {
    let cancelled = false;
    let debounceId: ReturnType<typeof setTimeout> | null = null;
    
    if (!query.trim()) {
      setTranslation('');
      return;
    }

    const generateAndSetTranslation = async () => {
      // Reset search trigger flag for new query
      hasTriggeredSearchRef.current = false;
      
      // Phase 1: Show expanded queries immediately (without author resolution)
      const immediateResult = await generateTranslation(query, true);
      if (!cancelled) {
        setTranslation(immediateResult);
      }

      // Phase 2: Update with resolved authors (if any by: tokens exist)
      if (query.includes('by:')) {
        const resolvedResult = await generateTranslation(query, false);
        if (!cancelled) {
          setTranslation(resolvedResult);
          
          // Clear any existing timeout
          if (resolutionTimeoutRef.current) {
            clearTimeout(resolutionTimeoutRef.current);
          }
          
          // Set a timeout to trigger search after resolution stabilizes
          // This allows time for NIP-05 verification and re-ranking to complete
          resolutionTimeoutRef.current = setTimeout(() => {
            if (lastResolvedQueryRef.current !== query && !hasTriggeredSearchRef.current) {
              lastResolvedQueryRef.current = query;
              hasTriggeredSearchRef.current = true;
              onAuthorResolved?.();
            }
          }, 2000); // Wait 2 seconds for final resolution
        }
      }
    };

    debounceId = setTimeout(() => {
      generateAndSetTranslation();
    }, 700); // Debounce translation to reduce typing lag

    return () => { 
      cancelled = true;
      if (debounceId) {
        clearTimeout(debounceId);
        debounceId = null;
      }
      if (resolutionTimeoutRef.current) {
        clearTimeout(resolutionTimeoutRef.current);
        resolutionTimeoutRef.current = null;
      }
    };
  }, [query, generateTranslation, onAuthorResolved]);

  if (!translation) return null;

  const isLongTranslation = translation.split('\n').length > 4;

  return (
    <div 
      id="search-explanation" 
      className={`mt-1 text-[11px] text-gray-400 font-mono break-all whitespace-pre-wrap flex items-start gap-2 ${
        isLongTranslation ? 'cursor-pointer hover:bg-gray-800/20 rounded px-1 py-0.5 -mx-1 -my-0.5' : ''
      }`}
      onClick={() => {
        if (isLongTranslation) {
          setIsExplanationExpanded(!isExplanationExpanded);
        }
      }}
    >
      <FontAwesomeIcon icon={faEquals} className="mt-0.5 flex-shrink-0" />
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
      </div>
    </div>
  );
}
