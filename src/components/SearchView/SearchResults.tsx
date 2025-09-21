import { useState, useMemo } from 'react';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import EventCard from '@/components/EventCard';
import UrlPreview from '@/components/UrlPreview';
import ProfileCard from '@/components/ProfileCard';
import ClientFilters, { FilterSettings } from '@/components/ClientFilters';
import { applyContentFilters } from '@/lib/contentAnalysis';
import { URL_REGEX, IMAGE_EXT_REGEX, VIDEO_EXT_REGEX, isAbsoluteHttpUrl } from '@/lib/urlPatterns';
import Fuse from 'fuse.js';

interface SearchResultsProps {
  results: NDKEvent[];
  baseResults: NDKEvent[];
  filterSettings: FilterSettings;
  setFilterSettings: (settings: FilterSettings) => void;
  verifiedMapRef: React.MutableRefObject<Map<string, boolean>>;
  expandedParents: Record<string, NDKEvent | 'loading'>;
  setExpandedParents: (parents: Record<string, NDKEvent | 'loading'>) => void;
  avatarOverlap: boolean;
  setAvatarOverlap: (overlap: boolean) => void;
  expandedLabel: string | null;
  setExpandedLabel: (label: string | null) => void;
  expandedTerms: string[];
  setExpandedTerms: (terms: string[]) => void;
  activeFilters: Set<string>;
  setActiveFilters: (filters: Set<string>) => void;
  successfulPreviews: Set<string>;
  setSuccessfulPreviews: (previews: Set<string>) => void;
  translation: string;
  setTranslation: (translation: string) => void;
}

export default function SearchResults({
  results,
  baseResults,
  filterSettings,
  setFilterSettings,
  verifiedMapRef,
  expandedParents,
  setExpandedParents,
  avatarOverlap,
  setAvatarOverlap,
  expandedLabel,
  setExpandedLabel,
  expandedTerms,
  setExpandedTerms,
  activeFilters,
  setActiveFilters,
  successfulPreviews,
  setSuccessfulPreviews,
  translation,
  setTranslation
}: SearchResultsProps) {
  const [showRawJson, setShowRawJson] = useState(false);

  // Memoized client-side filtered results
  const filteredResults = useMemo(() => {
    if (!filterSettings.resultFilter && !filterSettings.verifiedOnly && !filterSettings.fuzzyEnabled) {
      return results;
    }

    let filtered = [...results];

    // Apply content filters
    filtered = applyContentFilters(filtered, filterSettings);

    // Apply verification filter
    if (filterSettings.verifiedOnly) {
      filtered = filtered.filter(evt => {
        const pubkey = (evt.pubkey || evt.author?.pubkey) as string | undefined;
        return pubkey ? verifiedMapRef.current.get(pubkey) : false;
      });
    }

    // Apply fuzzy search
    if (filterSettings.resultFilter && filterSettings.fuzzyEnabled) {
      const fuse = new Fuse(filtered, {
        keys: ['content', 'author.profile.name', 'author.profile.displayName'],
        threshold: 0.3,
        includeScore: true
      });
      const fuzzyResults = fuse.search(filterSettings.resultFilter);
      filtered = fuzzyResults.map(result => result.item);
    }

    return filtered;
  }, [results, filterSettings, verifiedMapRef]);

  const handleAuthorClick = (npub: string) => {
    // Navigate to profile page
    window.location.href = `/p/${npub}`;
  };

  const handleHashtagClick = (hashtag: string) => {
    // Navigate to hashtag search
    window.location.href = `/?q=${encodeURIComponent(hashtag)}`;
  };

  const handleExpandParent = async (eventId: string) => {
    if (expandedParents[eventId]) return;
    
    setExpandedParents(prev => ({ ...prev, [eventId]: 'loading' }));
    
    try {
      // This would need to be implemented to fetch the parent event
      // For now, we'll just set it to loading
      console.log('Expanding parent for event:', eventId);
    } catch (error) {
      console.error('Error expanding parent:', error);
      setExpandedParents(prev => {
        const newPrev = { ...prev };
        delete newPrev[eventId];
        return newPrev;
      });
    }
  };

  const renderEvent = (event: NDKEvent, index: number) => {
    const isProfile = event.kind === 0;
    const isUrl = URL_REGEX.test(event.content || '');
    const isImage = IMAGE_EXT_REGEX.test(event.content || '');
    const isVideo = VIDEO_EXT_REGEX.test(event.content || '');

    if (isProfile) {
      return (
        <ProfileCard
          key={event.id}
          event={event}
          onAuthorClick={handleAuthorClick}
          onHashtagClick={handleHashtagClick}
        />
      );
    }

    if (isUrl && isAbsoluteHttpUrl(event.content || '')) {
      return (
        <div key={event.id} className="mb-4">
          <EventCard
            event={event}
            onAuthorClick={handleAuthorClick}
            onHashtagClick={handleHashtagClick}
            onExpandParent={handleExpandParent}
            expandedParents={expandedParents}
            avatarOverlap={avatarOverlap}
            setAvatarOverlap={setAvatarOverlap}
            showRawJson={showRawJson}
            setShowRawJson={setShowRawJson}
          />
          <UrlPreview
            url={event.content || ''}
            onSuccess={() => setSuccessfulPreviews(prev => new Set([...prev, event.id]))}
            onError={() => {}}
          />
        </div>
      );
    }

    return (
      <EventCard
        key={event.id}
        event={event}
        onAuthorClick={handleAuthorClick}
        onHashtagClick={handleHashtagClick}
        onExpandParent={handleExpandParent}
        expandedParents={expandedParents}
        avatarOverlap={avatarOverlap}
        setAvatarOverlap={setAvatarOverlap}
        showRawJson={showRawJson}
        setShowRawJson={setShowRawJson}
      />
    );
  };

  return (
    <div className="space-y-4">
      <ClientFilters
        settings={filterSettings}
        onSettingsChange={setFilterSettings}
        resultCount={filteredResults.length}
        baseResultCount={baseResults.length}
        expandedLabel={expandedLabel}
        setExpandedLabel={setExpandedLabel}
        expandedTerms={expandedTerms}
        setExpandedTerms={setExpandedTerms}
        activeFilters={activeFilters}
        setActiveFilters={setActiveFilters}
        translation={translation}
        setTranslation={setTranslation}
      />
      
      {filteredResults.length === 0 ? (
        <div className="text-center text-gray-500 py-8">
          {results.length === 0 ? 'No results found' : 'No results match your filters'}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredResults.map((event, index) => renderEvent(event, index))}
        </div>
      )}
    </div>
  );
}
