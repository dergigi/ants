'use client';

import { useMemo, useRef, type MutableRefObject } from 'react';

export type SearchViewRefs = {
  currentSearchId: MutableRefObject<number>;
  abortControllerRef: MutableRefObject<AbortController | null>;
  /** Suppress accidental searches caused by programmatic query edits (e.g., toggle) */
  suppressSearchRef: MutableRefObject<boolean>;
  lastIdentifierRedirectRef: MutableRefObject<string | null>;
  initialSearchDoneRef: MutableRefObject<boolean>;
  initialQueryNormalizedRef: MutableRefObject<string | null>;
  initialQueryRef: MutableRefObject<string>;
  lastHashQueryRef: MutableRefObject<string | null>;
  lastExecutedQueryRef: MutableRefObject<string | null>;
};

/** Mutable refs shared between the search execution and URL sync hooks */
export function useSearchViewRefs(initialQuery: string, manageUrl: boolean): SearchViewRefs {
  const normalizedInitialQuery = initialQuery.trim() || null;
  const bootstrapInitial = !manageUrl ? normalizedInitialQuery : null;

  const currentSearchId = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const suppressSearchRef = useRef(false);
  const lastIdentifierRedirectRef = useRef<string | null>(null);
  const initialSearchDoneRef = useRef(false);
  const initialQueryNormalizedRef = useRef<string | null>(normalizedInitialQuery);
  const initialQueryRef = useRef(initialQuery);
  const lastHashQueryRef = useRef<string | null>(bootstrapInitial);
  const lastExecutedQueryRef = useRef<string | null>(bootstrapInitial);

  return useMemo(() => ({
    currentSearchId,
    abortControllerRef,
    suppressSearchRef,
    lastIdentifierRedirectRef,
    initialSearchDoneRef,
    initialQueryNormalizedRef,
    initialQueryRef,
    lastHashQueryRef,
    lastExecutedQueryRef
  }), []);
}
