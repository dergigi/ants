'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { useRelayStatus } from '@/hooks/useRelayStatus';
import { useSearchUi } from '@/hooks/useSearchUi';
import { useProfileScope } from '@/hooks/useProfileScope';
import { useResultPipeline } from '@/hooks/useResultPipeline';
import { useContentRenderer } from '@/hooks/useContentRenderer';
import { useSlashCommands } from '@/hooks/useSlashCommands';
import { useSearchViewRefs } from '@/hooks/useSearchViewRefs';
import { useSearchExecution } from '@/hooks/useSearchExecution';
import { useUrlUpdater, useUrlSync } from '@/hooks/useUrlSync';
import { getCurrentProfileNpub, ensureAuthorForBackend } from '@/lib/search/queryTransforms';
import { getProfileScopeIdentifiers, hasProfileScope, addProfileScope } from '@/lib/search/profileScope';
import ClientFilters from '@/components/ClientFilters';
import ProfileScopeIndicator from '@/components/ProfileScopeIndicator';
import FilterCollapsed from '@/components/FilterCollapsed';
import RelayCollapsed from '@/components/RelayCollapsed';
import RelayStatusDisplay from '@/components/RelayStatusDisplay';
import SortCollapsed from '@/components/SortCollapsed';
import ShareButton from '@/components/ShareButton';
import SearchInput from '@/components/SearchInput';
import QueryTranslation from '@/components/QueryTranslation';
import SearchResultsList from '@/components/SearchResultsList';
import { isSlashCommand, buildCli } from '@/lib/utils/searchViewUtils';
import { SEARCH_FILTER_THRESHOLD } from '@/lib/constants';
import { useClearTrigger } from '@/lib/ClearTrigger';
import { PlaceholderStyles } from './Placeholder';

type Props = {
  initialQuery?: string;
  manageUrl?: boolean;
  onUrlUpdate?: (query: string) => void;
};

export default function SearchView({ initialQuery = '', manageUrl = true, onUrlUpdate }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<NDKEvent[]>([]);
  const [loading, setLoading] = useState(Boolean(initialQuery && !manageUrl));
  const [resolvingAuthor, setResolvingAuthor] = useState(false);
  const [showFilterDetails, setShowFilterDetails] = useState(false);
  const [showExternalButton, setShowExternalButton] = useState(false);
  const refs = useSearchViewRefs(initialQuery, manageUrl);

  const {
    isConnecting,
    setIsConnecting,
    connectionDetails,
    setConnectionDetails,
    showConnectionDetails,
    setShowConnectionDetails,
    relayInfo
  } = useRelayStatus(results.length);

  const {
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
  } = useResultPipeline({ results, setResults, query });

  const {
    placeholder,
    setPlaceholder,
    rotationProgress,
    searchInputRef,
    handleInputChange,
    handleExampleNext
  } = useSearchUi({ query, loading, setQuery, suppressSearchRef: refs.suppressSearchRef });

  const {
    runSlashCommand,
    topCommandText,
    setTopCommandText,
    topExamples,
    setTopExamples,
    helpCommands,
    kindsRules,
    setKindsRules,
    kindsLoading,
    kindsError,
    triggerLogin,
    onLoginTrigger
  } = useSlashCommands({ setQuery, setResults, setPlaceholder });

  const { profileScopeUser, profileScopeIdentifiers, profileScoped } = useProfileScope({ manageUrl, pathname, query });

  const updateUrlForSearch = useUrlUpdater({ manageUrl, onUrlUpdate, profileScopeUser });

  const { isDirectQuery, handleSearch, handleContentSearch } = useSearchExecution({
    query,
    initialQuery,
    manageUrl,
    refs,
    loading,
    setQuery,
    setResults,
    setLoading,
    setResolvingAuthor,
    setShowExternalButton,
    setSuccessfullyActiveRelays,
    setToggledRelays,
    setTopCommandText,
    setTopExamples,
    setKindsRules,
    setIsConnecting,
    setConnectionDetails,
    triggerLogin,
    runSlashCommand,
    updateUrlForSearch,
    profileScopeUser
  });

  useUrlSync({
    manageUrl,
    initialQuery,
    refs,
    profileScopeUser,
    profileIdentifier: profileScopeIdentifiers?.profileIdentifier,
    setQuery,
    handleSearch,
    runSlashCommand,
    setTopCommandText,
    setTopExamples,
    setKindsRules
  });

  const contentRenderer = useContentRenderer({ setQuery, updateUrlForSearch, handleSearch, handleContentSearch });

  const { setClearHandler } = useClearTrigger();
  const handleClear = useCallback(() => {
    // Abort any ongoing search immediately
    if (refs.abortControllerRef.current) {
      refs.abortControllerRef.current.abort();
    }
    refs.currentSearchId.current++;
    setQuery('');
    setResults([]);
    setLoading(false);
    setResolvingAuthor(false);
    setTopCommandText(null);
    setTopExamples(null);
    setKindsRules(null);
    // Always reset to root path when clearing
    router.replace('/');
  }, [router, refs, setTopCommandText, setTopExamples, setKindsRules]);

  // Register clear handler for favicon click
  useEffect(() => {
    setClearHandler(handleClear);
  }, [setClearHandler, handleClear]);

  // Handle opening external URL
  const handleOpenExternal = useCallback(() => {
    if (query.trim()) {
      window.open(query.trim(), '_blank', 'noopener,noreferrer');
      // Immediately transform back to regular search button
      setShowExternalButton(false);
    }
  }, [query]);

  // Listen for login trigger from Header
  useEffect(() => {
    const cleanup = onLoginTrigger(() => {
      // Always attempt login, but only set /login in search field if it's empty
      if (!query.trim()) {
        setQuery('/login');
        // Focus the search input
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
        // Update URL immediately
        updateUrlForSearch('/login');
      }
      // Always execute the /login command regardless of search field state
      const unknownCmd = runSlashCommand('/login');
      if (unknownCmd) {
        setTopCommandText(buildCli(unknownCmd, 'Unknown command'));
        setTopExamples(null);
        setKindsRules(null);
      }
    });
    return cleanup;
  }, [onLoginTrigger, runSlashCommand, updateUrlForSearch, query, searchInputRef, setTopCommandText, setTopExamples, setKindsRules]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const effectivePlaceholder = isConnecting ? '/examples' : placeholder;
    const raw = query.trim() || effectivePlaceholder;

    // Slash-commands: show CLI-style top card but still run normal search
    if (isSlashCommand(raw)) {
      const unknownCmd = runSlashCommand(raw);
      if (unknownCmd) {
        setTopCommandText(buildCli(unknownCmd, 'Unknown command'));
        setTopExamples(null);
        setKindsRules(null);
      }
      setQuery(raw);
      updateUrlForSearch(raw);
      // Clear prior results immediately before async search
      setResults([]);
      setTopCommandText(buildCli(raw.replace(/^\//, ''), topExamples ? topExamples : ''));
      if (raw) handleSearch(raw);
      else setResults([]);
      return;
    } else {
      // Clear any previous command card for non-command searches
      setTopCommandText(null);
      setTopExamples(null);
      setKindsRules(null);
    }
    const currentProfileNpub = getCurrentProfileNpub(pathname);
    let displayVal = raw;
    const identifiers = getProfileScopeIdentifiers(profileScopeUser, currentProfileNpub);
    if (identifiers && profileScoped) {
      displayVal = addProfileScope(displayVal, identifiers);
    }
    setQuery(displayVal);
    if (manageUrl) {
      if (displayVal) {
        // Update URL immediately
        updateUrlForSearch(displayVal);
        const identifiers = getProfileScopeIdentifiers(profileScopeUser, currentProfileNpub);
        const shouldScope = identifiers ? hasProfileScope(displayVal, identifiers) : false;
        const backend = shouldScope ? ensureAuthorForBackend(displayVal, currentProfileNpub) : displayVal;
        handleSearch(backend.trim());
      } else {
        const params = new URLSearchParams(searchParams.toString());
        params.delete('q');
        router.replace(`?${params.toString()}`);
        setResults([]);
      }
    } else {
      if (displayVal) handleSearch(displayVal);
      else setResults([]);
    }
  };

  return (
    <div className="w-full pt-4">
      <PlaceholderStyles />
      <div className="flex gap-2">
        <ProfileScopeIndicator
          key={profileScopeUser?.npub || 'no-user'}
          user={profileScopeUser}
          isEnabled={profileScoped}
        />
        <SearchInput
          ref={searchInputRef}
          query={query}
          placeholder={placeholder}
          loading={loading}
          resolvingAuthor={resolvingAuthor}
          showExternalButton={showExternalButton}
          profileScopeUser={profileScopeUser}
          onInputChange={handleInputChange}
          onClear={handleClear}
          onOpenExternal={handleOpenExternal}
          onSubmit={handleSubmit}
          onExampleNext={handleExampleNext}
          rotationProgress={rotationProgress}
        />
      </div>
      
      <QueryTranslation 
        query={query} 
        onAuthorResolved={() => {
          // Re-execute search after final author resolution completes
          if (refs.lastExecutedQueryRef.current) {
            handleSearch(refs.lastExecutedQueryRef.current);
          }
        }} 
      />

      {/* Command output will be injected as first result card below */}

      {/* Collapsed state - always in same row */}
      {(loading || results.length > 0) && (
        <div className="w-full mt-2">
          {/* Button row - sort on left, other controls on right */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <ShareButton />
              {hasNonProfileResults && (
                <SortCollapsed
                  sortOrder={sortOrder}
                  onToggle={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
                />
              )}
            </div>
            
            <div className="flex items-center gap-3 ml-auto">
              <RelayCollapsed
                connectedCount={successfullyActiveRelays.size}
                totalCount={relayInfo.totalCount}
                onExpand={() => setShowConnectionDetails(!showConnectionDetails)}
                isExpanded={showConnectionDetails}
              />

              <FilterCollapsed
                filtersAreActive={filterSettings.filterMode !== 'never' && (filterSettings.filterMode === 'always' || loading || (filterSettings.filterMode === 'intelligently' && results.length >= SEARCH_FILTER_THRESHOLD))}
                hasActiveFilters={filterSettings.maxEmojis !== null || filterSettings.maxHashtags !== null || filterSettings.maxMentions !== null || filterSettings.hideLinks || filterSettings.hideBridged || filterSettings.hideBots || filterSettings.hideNsfw || filterSettings.verifiedOnly || (filterSettings.fuzzyEnabled && (filterSettings.resultFilter || '').trim().length > 0)}
                filteredCount={fuseFilteredResults.length}
                resultCount={results.length}
                onExpand={() => setShowFilterDetails(!showFilterDetails)}
                isExpanded={showFilterDetails}
              />
            </div>
          </div>

          {/* Expanded views - below button row, full width */}
          {showConnectionDetails && connectionDetails && relayInfo.totalCount > 0 && (
            <RelayStatusDisplay 
              connectionDetails={connectionDetails}
              relayInfo={relayInfo}
              onSearch={handleSearch}
              activeRelays={successfullyActiveRelays}
              toggledRelays={toggledRelays}
              onToggleRelay={toggleRelay}
            />
          )}

          {showFilterDetails && (
            <div className="mt-2">
              <ClientFilters
                filterSettings={filterSettings}
                onFilterChange={setFilterSettings}
                resultCount={results.length}
                filteredCount={fuseFilteredResults.length}
                emojiAutoDisabled={emojiAutoDisabled}
                showButton={false}
              />
            </div>
          )}
        </div>
      )}

      <SearchResultsList
        results={sortedResults}
        loading={loading}
        query={query}
        isDirectQuery={isDirectQuery}
        topCommandText={topCommandText}
        helpCommands={helpCommands}
        topExamples={topExamples}
        kindsRules={kindsRules}
        kindsLoading={kindsLoading}
        kindsError={kindsError}
        onContentSearch={handleContentSearch}
        renderer={contentRenderer}
      />
    </div>
  );
}
