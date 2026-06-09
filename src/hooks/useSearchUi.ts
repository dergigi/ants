'use client';

import { useState, useEffect, useCallback, useRef, type MutableRefObject } from 'react';
import { nextExample } from '@/lib/ndk';
import { useClearTrigger } from '@/lib/ClearTrigger';

/**
 * Owns the search input chrome: placeholder rotation, autofocus,
 * input change handling, and the clear handler registration.
 */
export function useSearchUi(options: {
  query: string;
  loading: boolean;
  setQuery: (q: string) => void;
  suppressSearchRef: MutableRefObject<boolean>;
  onClear: () => void;
}) {
  const { query, loading, setQuery, suppressSearchRef, onClear } = options;
  const [placeholder, setPlaceholder] = useState('/examples');
  const [rotationProgress, setRotationProgress] = useState(0);
  const [rotationSeed, setRotationSeed] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const { setClearHandler } = useClearTrigger();

  // Simple input change handler: update local query state; searches run on submit
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setQuery(newValue);
    // Release suppression on next tick so explicit submit still works
    setTimeout(() => { suppressSearchRef.current = false; }, 0);
  }, [setQuery, suppressSearchRef]);

  // Rotate placeholder when idle and show a small progress indicator
  useEffect(() => {
    if (query || loading) { setRotationProgress(0); return; }
    let rafId = 0;
    const ROTATION_MS = 7000;
    let start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const p = Math.min(1, elapsed / ROTATION_MS);
      setRotationProgress(p);
      if (p >= 1) {
        setPlaceholder(nextExample());
        start = now;
        setRotationProgress(0);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(rafId); };
  }, [query, loading, rotationSeed]);

  // Auto-focus the search input on component mount
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  // Register clear handler for favicon click
  useEffect(() => {
    setClearHandler(onClear);
  }, [setClearHandler, onClear]);

  const handleExampleNext = useCallback(() => {
    setPlaceholder(nextExample());
    setRotationProgress(0);
    setRotationSeed((s) => s + 1);
  }, []);

  return {
    placeholder,
    setPlaceholder,
    rotationProgress,
    searchInputRef,
    handleInputChange,
    handleExampleNext
  };
}
