'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { connect, getCurrentExample, nextExample, ConnectionStatus, addConnectionStatusListener, removeConnectionStatusListener, getRecentlyActiveRelays } from '@/lib/ndk';
import { getCurrentProfileNpub, toImplicitUrlQuery, toExplicitInputFromUrl, ensureAuthorForBackend } from '@/lib/search/queryTransforms';
import { useSearchState, useNip05Verification, useSearchLogic } from './hooks';
import ConnectionStatusComponent from './ConnectionStatus';
import SearchInput from './SearchInput';
import SearchResults from './SearchResults';
import { FilterSettings } from '@/components/ClientFilters';

type Props = {
  initialQuery?: string;
  manageUrl?: boolean;
};

export default function SearchView({ initialQuery = '', manageUrl = true }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  // Connection state
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'timeout'>('connecting');
  const [connectionDetails, setConnectionDetails] = useState<ConnectionStatus | null>(null);
  const [loadingDots, setLoadingDots] = useState('...');
  const [showConnectionDetails, setShowConnectionDetails] = useState(false);
  const [recentlyActive, setRecentlyActive] = useState<string[]>([]);

  // Search state
  const {
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
  } = useSearchState(initialQuery);

  // UI state
  const [placeholder, setPlaceholder] = useState('');
  const [expandedParents, setExpandedParents] = useState<Record<string, any>>({});
  const [avatarOverlap, setAvatarOverlap] = useState(false);
  const [expandedLabel, setExpandedLabel] = useState<string | null>(null);
  const [expandedTerms, setExpandedTerms] = useState<string[]>([]);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [successfulPreviews, setSuccessfulPreviews] = useState<Set<string>>(new Set());
  const [translation, setTranslation] = useState<string>('');
  const [filterSettings, setFilterSettings] = useState<FilterSettings>({
    maxEmojis: 3,
    maxHashtags: 3,
    hideLinks: false,
    resultFilter: '',
    verifiedOnly: false,
    fuzzyEnabled: true,
    hideBots: false,
    hideNsfw: false
  });

  // Use NIP-05 verification hook
  useNip05Verification(results);

  // Use search logic hook
  const { handleSearch } = useSearchLogic(
    query,
    setResults,
    setBaseResults,
    setLoading,
    setResolvingAuthor,
    currentSearchId,
    abortControllerRef,
    pathname,
    router
  );

  // Connection status listener
  useEffect(() => {
    const handleConnectionStatus = (status: ConnectionStatus) => {
      setConnectionDetails(status);
      if (status.connectedRelays > 0) {
        setIsConnecting(false);
        setConnectionStatus('connected');
      } else if (status.failedRelays > 0) {
        setIsConnecting(false);
        setConnectionStatus('timeout');
      }
    };

    addConnectionStatusListener(handleConnectionStatus);
    return () => removeConnectionStatusListener(handleConnectionStatus);
  }, []);

  // Loading dots animation
  useEffect(() => {
    if (!isConnecting) return;
    const interval = setInterval(() => {
      setLoadingDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);
    return () => clearInterval(interval);
  }, [isConnecting]);

  // Example rotation
  useEffect(() => {
    const interval = setInterval(() => {
      const example = getCurrentExample();
      setPlaceholder(`Search for "${example}"...`);
      nextExample();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // URL management
  useEffect(() => {
    if (!manageUrl) return;

    const urlQuery = searchParams.get('q') || '';
    if (urlQuery && urlQuery !== query) {
      const currentNpub = getCurrentProfileNpub(pathname);
      const explicitQuery = toExplicitInputFromUrl(urlQuery, currentNpub);
      setQuery(explicitQuery);
    }
  }, [searchParams, query, setQuery, pathname, manageUrl]);

  // Update URL when query changes
  useEffect(() => {
    if (!manageUrl) return;

    const currentNpub = getCurrentProfileNpub(pathname);
    const urlQuery = toImplicitUrlQuery(query, currentNpub);
    const currentUrlQuery = searchParams.get('q') || '';

    if (urlQuery !== currentUrlQuery) {
      const newSearchParams = new URLSearchParams(searchParams);
      if (urlQuery) {
        newSearchParams.set('q', urlQuery);
      } else {
        newSearchParams.delete('q');
      }
      const newUrl = `${pathname}${newSearchParams.toString() ? `?${newSearchParams.toString()}` : ''}`;
      router.replace(newUrl);
    }
  }, [query, pathname, searchParams, router, manageUrl]);

  // Handle form submission
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(query);
  }, [handleSearch, query]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch(query);
    }
  }, [handleSearch, query]);

  // Initialize connection
  useEffect(() => {
    const initConnection = async () => {
      try {
        await connect();
      } catch (error) {
        console.error('Connection failed:', error);
        setIsConnecting(false);
        setConnectionStatus('timeout');
      }
    };
    initConnection();
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <ConnectionStatusComponent
        isConnecting={isConnecting}
        connectionStatus={connectionStatus}
        connectionDetails={connectionDetails}
        loadingDots={loadingDots}
        showConnectionDetails={showConnectionDetails}
        setShowConnectionDetails={setShowConnectionDetails}
        recentlyActive={recentlyActive}
      />

      <SearchInput
        query={query}
        placeholder={placeholder}
        loading={loading}
        resolvingAuthor={resolvingAuthor}
        onInputChange={handleInputChange}
        onSubmit={handleSubmit}
        onKeyDown={handleKeyDown}
      />

      <SearchResults
        results={results}
        baseResults={baseResults}
        filterSettings={filterSettings}
        setFilterSettings={setFilterSettings}
        verifiedMapRef={verifiedMapRef}
        expandedParents={expandedParents}
        setExpandedParents={setExpandedParents}
        avatarOverlap={avatarOverlap}
        setAvatarOverlap={setAvatarOverlap}
        expandedLabel={expandedLabel}
        setExpandedLabel={setExpandedLabel}
        expandedTerms={expandedTerms}
        setExpandedTerms={setExpandedTerms}
        activeFilters={activeFilters}
        setActiveFilters={setActiveFilters}
        successfulPreviews={successfulPreviews}
        setSuccessfulPreviews={setSuccessfulPreviews}
        translation={translation}
        setTranslation={setTranslation}
      />
    </div>
  );
}
