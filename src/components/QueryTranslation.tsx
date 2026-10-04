'use client';

import { useEffect, useState, useRef } from 'react';
import { planQuery } from '@/lib/search/query/plan';
import { resolvePreviewAuthors } from '@/lib/search/query/preview';
import { resolveQueryAuthor } from '@/lib/search/query/resolveAuthor';
import { abortable } from '@/lib/search/query/execute';
import { Leaf, printQuery } from '@/lib/search/query/ast';
import { loadRules } from '@/lib/search/replacements';
import { parseDateValue } from '@/lib/search/relativeDates';
import { SEARCH_DEFAULT_KINDS } from '@/lib/constants';
import { useLoginTrigger } from '@/lib/LoginTrigger';
import { getLastReducedFilters } from '@/lib/ndk';

interface QueryTranslationProps {
  query: string;
  onAuthorResolved?: () => void;
}

// Preview and execution use the same parser, branch planner, and Vertex resolver.
export default function QueryTranslation({ query, onAuthorResolved }: QueryTranslationProps) {
  const { currentUser } = useLoginTrigger();
  const [translation, setTranslation] = useState('');
  const [error, setError] = useState('');
  const notify = useRef(onAuthorResolved);
  notify.current = onAuthorResolved;
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setTranslation('');
    setError('');
    if (!query.trim() || query.startsWith('/')) return;
    const timer = setTimeout(async () => {
      try {
        const now = new Date();
        const plan = planQuery(query, await loadRules(), SEARCH_DEFAULT_KINDS, now);
        const format = (branches: Leaf[][]) => branches.map(branch => branch.map(node => {
          if (node.type === 'field' && (node.name === 'since' || node.name === 'until')) {
            return `${node.name}:${parseDateValue(node.value, node.name, now)!.displayValue}`;
          }
          return printQuery(node);
        }).join(' ')).join('\nOR ');
        const preview = format(plan.leaves);
        if (!cancelled) setTranslation(preview);
        const resolved = await abortable(resolvePreviewAuthors(plan.leaves, resolveQueryAuthor, controller.signal), controller.signal);
        if (!cancelled) {
          const translated = format(resolved);
          setTranslation(translated);
          if (translated !== preview) notify.current?.();
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Invalid query');
      }
    }, 700);
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, [query, currentUser?.pubkey]);
  if (error) return <div id="search-explanation" role="alert" className="mt-1 text-xs text-red-400">{error}</div>;
  if (!translation) return null;
  const filters = getLastReducedFilters();
  const firstLine = translation.split('\n')[0];
  const summary = firstLine.length > 180 ? `${firstLine.slice(0, 180)}…` : firstLine;
  return (
    <div id="search-explanation" className="mt-1 text-[11px] text-gray-400 font-mono break-all whitespace-pre-wrap">
      <details>
        <summary className="cursor-pointer">{summary}{translation.includes('\n') ? ' …' : ''}</summary>
        <div>{translation}</div>
      </details>
      {!!filters?.length && <details><summary className="cursor-pointer">Effective filters</summary><pre>{JSON.stringify(filters, null, 2)}</pre></details>}
    </div>
  );
}
