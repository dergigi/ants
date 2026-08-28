'use client';

import { memo } from 'react';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { type SlashCommand } from '@/lib/slashCommands';
import EventCard from '@/components/EventCard';
import ArticleCard from '@/components/ArticleCard';
import ProfileCard from '@/components/ProfileCard';
import MuteListCard from '@/components/MuteListCard';
import TruncatedText from '@/components/TruncatedText';
import ImageWithBlurhash from '@/components/ImageWithBlurhash';
import VideoWithBlurhash from '@/components/VideoWithBlurhash';
import RawEventJson from '@/components/RawEventJson';
import CodeSnippet from '@/components/CodeSnippet';
import NeventSearchButton from '@/components/NeventSearchButton';
import SearchCommandCard from '@/components/SearchCommandCard';
import { SearchResultsPlaceholder } from '@/components/Placeholder';
import { detectSearchType } from '@/lib/search/searchTypeDetection';
import { getMuteListResultData } from '@/lib/search/muteListResultData';
import { extractImetaImageUrls, extractImetaVideoUrls, extractImetaBlurhashes, extractImetaDimensions, extractImetaHashes } from '@/lib/picture';
import { extractVideoUrls, getFilenameFromUrl } from '@/lib/utils/urlUtils';
import { trimImageUrl } from '@/lib/utils';
import { formatEventTimestamp, getReplyToEventId } from '@/lib/utils/eventHelpers';
import { TEXT_MAX_LENGTH, FOLLOW_PACK_KIND } from '@/lib/constants';
import { HIGHLIGHTS_KIND } from '@/lib/highlights';
import { type ContentRenderer } from '@/hooks/useContentRenderer';

type Props = {
  results: NDKEvent[];
  loading: boolean;
  query: string;
  isDirectQuery: boolean;
  topCommandText: string | null;
  helpCommands: readonly SlashCommand[] | null;
  topExamples: string[] | null;
  kindsRules: Array<{ token: string; expansion: string }> | null;
  kindsLoading: boolean;
  kindsError: string | null;
  onContentSearch: (query: string) => void;
  renderer: ContentRenderer;
};

/** The search results panel: command card, loading placeholder, and per-kind result cards */
function SearchResultsList({ results, loading, query, isDirectQuery, topCommandText, helpCommands, topExamples, kindsRules, kindsLoading, kindsError, onContentSearch, renderer }: Props) {
  const {
    expandedParents,
    goToProfile,
    handleNeventSearch,
    getCommonEventCardProps,
    renderContentWithClickableHashtags,
    renderNoteMedia,
    renderNoteHeader,
    renderParentChain
  } = renderer;

  return (
    <div className="mt-8 space-y-4">
      {topCommandText ? (
        <SearchCommandCard
          topCommandText={topCommandText}
          helpCommands={helpCommands}
          topExamples={topExamples}
          kindsRules={kindsRules}
          kindsLoading={kindsLoading}
          kindsError={kindsError}
          onSearch={onContentSearch}
          onAuthorClick={goToProfile}
        />
      ) : null}
      {loading && results.length === 0 && (
        <SearchResultsPlaceholder 
          count={isDirectQuery ? 1 : 2} 
          searchType={detectSearchType(query)}
        />
      )}
      {results.map((event, idx) => {
        // Check if this note has any parent chain blocks rendered above it
        const hasExpandedParents = (() => {
          let currentEvent = event;
          while (currentEvent) {
            const parentId = getReplyToEventId(currentEvent);
            if (!parentId) break;
            const parentState = expandedParents[parentId];
            if (parentState && parentState !== 'loading' && parentState !== null) {
              return true;
            }
            currentEvent = parentState as unknown as NDKEvent;
          }
          return false;
        })();
        
        const noteCardClasses = `relative p-4 bg-[#2d2d2d] border border-[#3d3d3d] rounded-t-none border-t-0 ${hasExpandedParents ? 'rounded-none' : 'rounded-b-lg'}`;
        const key = `${event.id || 'unknown'}:${idx}`;
        return (
          <div key={key}>
            {renderNoteHeader(event)}
            {renderParentChain(event)}
            {event.kind === 0 ? (
              <ProfileCard event={event} onAuthorClick={(npub) => goToProfile(npub, event)} showBanner={false} />
            ) : event.kind === 1 ? (
              <EventCard
                {...getCommonEventCardProps(event, noteCardClasses)}
                renderContent={(text) => (
                  <TruncatedText 
                    content={text} 
                    maxLength={TEXT_MAX_LENGTH}
                    className="text-gray-100 whitespace-pre-wrap break-words"
                    renderContentWithClickableHashtags={(value) => renderContentWithClickableHashtags(value, { skipIdentifierIds: new Set([event.id?.toLowerCase?.() || '']) })}
                  />
                )}
                mediaRenderer={renderNoteMedia}
              />
            ) : event.kind === 10000 && getMuteListResultData(event) ? (
              <MuteListCard
                event={event}
                onAuthorClick={goToProfile}
                className={noteCardClasses}
                footerRight={<NeventSearchButton eventId={event.id} timestamp={formatEventTimestamp(event)} onSearch={handleNeventSearch} />}
              />
            ) : event.kind === 20 ? (
              <EventCard
                {...getCommonEventCardProps(event, noteCardClasses)}
                renderContent={() => {
                  const urls = extractImetaImageUrls(event);
                  const blurhashes = extractImetaBlurhashes(event);
                  const dimensions = extractImetaDimensions(event);
                  const hashes = extractImetaHashes(event);
                  if (urls.length === 0) {
                    return <div className="text-gray-400">(no images)</div>;
                  }
                  return (
                    <div className="mt-0 grid grid-cols-1 gap-3">
                      {urls.map((src, idx) => {
                        const blurhash = blurhashes[idx] || blurhashes[0];
                        const dim = dimensions[idx] || dimensions[0];
                        const hash = hashes[idx] || hashes[0] || null;
                        return (
                          <div key={`image-${idx}-${src}`} className="relative">
                            <ImageWithBlurhash
                              src={trimImageUrl(src)}
                              blurhash={blurhash}
                              alt="picture"
                              width={dim?.width || 1024}
                              height={dim?.height || 1024}
                              dim={dim || null}
                              onClickSearch={() => onContentSearch(hash ? hash : getFilenameFromUrl(src))}
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                }}
              />
            ) : event.kind === 1337 ? (
              <EventCard
                {...getCommonEventCardProps(event, noteCardClasses)}
                renderContent={() => (
                  <CodeSnippet event={event} onSearch={onContentSearch} />
                )}
              />
            ) : event.kind === 21 || event.kind === 22 ? (
              <EventCard
                {...getCommonEventCardProps(event, noteCardClasses)}
                renderContent={() => {
                  const urls = extractImetaVideoUrls(event);
                  const contentUrls = extractVideoUrls(event.content || '').slice(0, 2);
                  const blurhashes = extractImetaBlurhashes(event);
                  const dimensions = extractImetaDimensions(event);
                  const hashes = extractImetaHashes(event);
                  const all = Array.from(new Set([...
                    urls,
                    ...contentUrls
                  ]));
                  if (all.length === 0) {
                    return <div className="text-gray-400">(no video)</div>;
                  }
                  return (
                    <div className="mt-0 grid grid-cols-1 gap-3">
                      {all.map((src, idx) => {
                        const blurhash = blurhashes[idx] || blurhashes[0];
                        const dim = dimensions[idx] || dimensions[0];
                        const hash = hashes[idx] || hashes[0] || null;
                        return (
                          <div key={`video-${idx}-${src}`} className="relative">
                            <VideoWithBlurhash
                              src={trimImageUrl(src)}
                              blurhash={blurhash}
                              dim={dim || null}
                              onClickSearch={() => onContentSearch(hash ? hash : getFilenameFromUrl(src))}
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                }}
              />
            ) : event.kind === 30023 ? (
              <ArticleCard
                event={event}
                onAuthorClick={(npub) => goToProfile(npub, event)}
                className={`rounded-t-none border-t-0 ${hasExpandedParents ? 'rounded-none' : 'rounded-b-lg'}`}
                footerRight={<NeventSearchButton eventId={event.id} timestamp={formatEventTimestamp(event)} onSearch={handleNeventSearch} />}
                defaultExpanded={isDirectQuery}
              />
            ) : event.kind === HIGHLIGHTS_KIND ? (
              <EventCard
                {...getCommonEventCardProps(event, noteCardClasses)}
                renderContent={(text) => (
                  <TruncatedText 
                    content={text} 
                    maxLength={TEXT_MAX_LENGTH}
                    className="text-gray-100 whitespace-pre-wrap break-words"
                    renderContentWithClickableHashtags={(value) => renderContentWithClickableHashtags(value, { skipIdentifierIds: new Set([event.id?.toLowerCase?.() || '']) })}
                  />
                )}
                mediaRenderer={renderNoteMedia}
              />
            ) : event.kind === FOLLOW_PACK_KIND ? (
              <EventCard
                {...getCommonEventCardProps(event, noteCardClasses)}
                renderContent={(text) => (
                  <TruncatedText 
                    content={text} 
                    maxLength={TEXT_MAX_LENGTH}
                    className="text-gray-100 whitespace-pre-wrap break-words"
                    renderContentWithClickableHashtags={(value) => renderContentWithClickableHashtags(value, { skipIdentifierIds: new Set([event.id?.toLowerCase?.() || '']) })}
                  />
                )}
                mediaRenderer={renderNoteMedia}
              />
            ) : (
              <EventCard
                {...getCommonEventCardProps(event, noteCardClasses)}
                renderContent={() => (
                  <RawEventJson event={event} />
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default memo(SearchResultsList);
