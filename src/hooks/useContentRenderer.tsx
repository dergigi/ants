'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import emojiRegex from 'emoji-regex';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExternalLink } from '@fortawesome/free-solid-svg-icons';
import EventCard from '@/components/EventCard';
import TruncatedText from '@/components/TruncatedText';
import InlineNostrToken from '@/components/InlineNostrToken';
import NoteHeader from '@/components/NoteHeader';
import NoteMedia from '@/components/NoteMedia';
import NeventSearchButton from '@/components/NeventSearchButton';
import { stripAllUrls } from '@/lib/utils/textUtils';
import { formatUrlForDisplay } from '@/lib/utils/urlUtils';
import { createNostrTokenRegex } from '@/lib/utils/nostrIdentifiers';
import { setPrefetchedProfile, prepareProfileEventForPrefetch } from '@/lib/profile/prefetch';
import { formatEventTimestamp, getReplyToEventId } from '@/lib/utils/eventHelpers';
import { formatExactDate } from '@/lib/relativeTime';
import { TEXT_MAX_LENGTH } from '@/lib/constants';

export type ContentRenderer = ReturnType<typeof useContentRenderer>;

/**
 * Render helpers for note content: clickable hashtags/emojis/urls,
 * inline nostr tokens, media previews, note headers, and parent chains.
 */
export function useContentRenderer(options: {
  setQuery: (q: string) => void;
  updateUrlForSearch: (q: string) => void;
  handleSearch: (q: string) => void;
  handleContentSearch: (q: string) => void;
}) {
  const { setQuery, updateUrlForSearch, handleSearch, handleContentSearch } = options;
  const router = useRouter();
  const [expandedParents, setExpandedParents] = useState<Record<string, NDKEvent | 'loading'>>({});
  const [successfulPreviews, setSuccessfulPreviews] = useState<Set<string>>(new Set());

  const goToProfile = useCallback((npub: string, prefetchEvent?: NDKEvent) => {
    try {
      if (prefetchEvent) {
        const { data } = nip19.decode(npub);
        const pk = data as string;
        setPrefetchedProfile(pk, prepareProfileEventForPrefetch(prefetchEvent));
      }
    } catch {}
    router.push(`/p/${npub}`);
  }, [router]);

  // DRY helper for nevent search buttons
  const handleNeventSearch = useCallback((eventId: string) => {
    try {
      const nevent = nip19.neventEncode({ id: eventId });
      setQuery(nevent);
      updateUrlForSearch(nevent);
      handleSearch(nevent);
    } catch {}
  }, [setQuery, updateUrlForSearch, handleSearch]);

  // DRY helper for common EventCard props
  const getCommonEventCardProps = useCallback((event: NDKEvent, className: string) => ({
    event,
    onAuthorClick: goToProfile,
    className,
    footerRight: <NeventSearchButton eventId={event.id} timestamp={formatEventTimestamp(event)} exactDate={event.created_at ? formatExactDate(event.created_at) : undefined} exactTimestamp={event.created_at} onSearch={handleNeventSearch} />
  }), [goToProfile, handleNeventSearch]);

  const renderContentWithClickableHashtags = useCallback((content: string, options?: { disableNevent?: boolean; skipIdentifierIds?: Set<string> }) => {
    const strippedContent = stripAllUrls(content, successfulPreviews);
    if (!strippedContent) return null;

    const initialIdentifierIds = options?.skipIdentifierIds
      ? Array.from(options.skipIdentifierIds, (id) => id.toLowerCase())
      : [];
    const seenIdentifierIds = new Set<string>(initialIdentifierIds);

    const deriveIdentifierKey = (token: string): string | null => {
      if (!/^nostr:(?:nevent1|naddr1|note1)/i.test(token)) return null;
      try {
        const decoded = nip19.decode(token.replace(/^nostr:/i, ''));
        if (!decoded) return null;

        if (decoded.type === 'nevent') {
          const data = decoded.data as { id?: string };
          const id = (data?.id || '').toLowerCase();
          return id || null;
        }

        if (decoded.type === 'note') {
          const noteId = (decoded.data as string) || '';
          return noteId ? noteId.toLowerCase() : null;
        }

        if (decoded.type === 'naddr') {
          const data = decoded.data as { pubkey?: string; identifier?: string; kind?: number };
          const kind = typeof data?.kind === 'number' ? data.kind : '';
          const pubkey = (data?.pubkey || '').toLowerCase();
          const identifier = (data?.identifier || '').toLowerCase();
          if (!pubkey || !identifier || kind === '') return null;
          return `${kind}:${pubkey}:${identifier}`;
        }
      } catch {}
      return null;
    };

    const urlRegex = /(https?:\/\/[^\s'"<>]+)(?!\w)/gi;
    const nostrPattern = createNostrTokenRegex();
    const hashtagRegex = /(#\w+)/g;
    const emojiRx = emojiRegex();

    const splitByUrls = strippedContent.split(urlRegex);
    const finalNodes: (string | React.ReactNode)[] = [];

    splitByUrls.forEach((segment, segIndex) => {
      const isUrl = /^https?:\/\//i.test(segment);
      if (isUrl) {
        const cleanedUrl = segment.replace(/[),.;]+$/, '').trim();
        const { displayText, fullUrl } = formatUrlForDisplay(cleanedUrl, 25);
        finalNodes.push(
          <span key={`url-${segIndex}`} className="inline-flex items-center gap-1">
            <button
              type="button"
              className="text-blue-400 hover:text-blue-300 hover:underline break-all text-left"
              onClick={(e) => { 
                e.stopPropagation();
                handleContentSearch(fullUrl);
              }}
              title={`Search for: ${fullUrl}`}
            >
              {displayText}
            </button>
            <button
              type="button"
              title="Open URL in new tab"
              className="p-0.5 text-gray-400 hover:text-gray-200 opacity-70"
              onClick={(e) => {
                e.stopPropagation();
                window.open(fullUrl, '_blank', 'noopener,noreferrer');
              }}
            >
              <FontAwesomeIcon icon={faExternalLink} className="text-xs" />
            </button>
          </span>
        );
        return;
      }

      // Process nostr tokens, hashtags, and emojis
      const nostrSplitRegex = new RegExp(nostrPattern.source, nostrPattern.flags);
      const segmentTokens: string[] = [];
      const segmentParts: string[] = [];
      let lastIndex = 0;
      let execMatch: RegExpExecArray | null;
      while ((execMatch = nostrSplitRegex.exec(segment)) !== null) {
        const tokenStart = execMatch.index;
        const tokenEnd = tokenStart + execMatch[0].length;
        segmentParts.push(segment.slice(lastIndex, tokenStart));
        segmentTokens.push(execMatch[0]);
        lastIndex = tokenEnd;
      }
      segmentParts.push(segment.slice(lastIndex));
      const nostrSplit = segmentParts;
      const nostrTokens = segmentTokens;
      
      nostrSplit.forEach((textPart, partIndex) => {
        if (textPart) {
          // Process hashtags and emojis in text
          const hashtagSplit = textPart.split(hashtagRegex);
          hashtagSplit.forEach((hashtagPart, hashtagIndex) => {
            if (hashtagPart.startsWith('#')) {
              finalNodes.push(
                <button
                  key={`hashtag-${segIndex}-${partIndex}-${hashtagIndex}`}
                  onClick={() => handleContentSearch(hashtagPart)}
                  className="text-blue-400 hover:text-blue-300 hover:underline cursor-pointer"
                >
                  {hashtagPart}
                </button>
              );
            } else if (hashtagPart && hashtagPart.trim()) {
              // Process emojis
              const emojiSplit = hashtagPart.split(emojiRx);
              const emojis = hashtagPart.match(emojiRx) || [];
              emojiSplit.forEach((emojiPart, emojiIndex) => {
                if (emojiPart) finalNodes.push(emojiPart);
                if (emojis[emojiIndex]) {
                  finalNodes.push(
                    <button
                      key={`emoji-${segIndex}-${partIndex}-${hashtagIndex}-${emojiIndex}`}
                      onClick={() => handleContentSearch(emojis[emojiIndex] as string)}
                      className="text-yellow-400 hover:text-yellow-300 hover:scale-110 transition-transform cursor-pointer"
                    >
                      {emojis[emojiIndex]}
                    </button>
                  );
                }
              });
            } else {
              finalNodes.push(hashtagPart);
            }
          });
        }
        
        // Add nostr token if it exists
        if (nostrTokens[partIndex]) {
          const token = nostrTokens[partIndex];
          
          const identifierKey = deriveIdentifierKey(token);
          if (identifierKey) {
            if (seenIdentifierIds.has(identifierKey)) {
              return;
            }
            seenIdentifierIds.add(identifierKey);
          }
          
          if (options?.disableNevent && /^nostr:(?:nevent1|naddr1|note1)/i.test(token)) {
            finalNodes.push(token);
          } else {
            finalNodes.push(
              <InlineNostrToken
                key={`nostr-${segIndex}-${partIndex}`}
                token={token}
                onProfileClick={goToProfile}
                onSearch={handleContentSearch}
                renderContentWithClickableHashtags={renderContentWithClickableHashtags}
              />
            );
          }
        }
      });
    });

    return finalNodes;
  }, [successfulPreviews, handleContentSearch, goToProfile]);

  const renderNoteMedia = useCallback((content: string) => (
    <NoteMedia
      content={content}
      onSearch={handleContentSearch}
      onUrlLoaded={(loadedUrl) => {
        setSuccessfulPreviews((prev) => {
          if (prev.has(loadedUrl)) return prev;
          const next = new Set(prev);
          next.add(loadedUrl);
          return next;
        });
      }}
    />
  ), [handleContentSearch]);

  const handleParentToggle = useCallback((parentId: string, parent: NDKEvent | 'loading' | null) => {
    if (parent === null) {
      const updated = { ...expandedParents };
      delete updated[parentId];
      setExpandedParents(updated);
    } else {
      setExpandedParents((prev) => ({ ...prev, [parentId]: parent }));
    }
  }, [expandedParents, setExpandedParents]);

  const renderNoteHeader = useCallback((event: NDKEvent): React.ReactNode => {
    // Hide header for profile events (kind:0)
    if (event.kind === 0) return null;
    return (
      <NoteHeader
        event={event}
        expandedParents={expandedParents}
        onParentToggle={handleParentToggle}
        onSearch={handleSearch}
      />
    );
  }, [expandedParents, handleParentToggle, handleSearch]);

  const renderParentChain = useCallback((event: NDKEvent): React.ReactNode => {
    const parentChain: NDKEvent[] = [];
    let currentEvent = event;
    
    // Build the parent chain by following expanded parents
    while (currentEvent) {
      const parentId = getReplyToEventId(currentEvent);
      if (!parentId) break;
      
      const parentState = expandedParents[parentId];
      if (parentState && parentState !== 'loading' && parentState !== null) {
        parentChain.push(parentState as NDKEvent);
        currentEvent = parentState as NDKEvent;
      } else {
        break;
      }
    }
    
    // Render all parents as stacked blocks (reverse order so most recent is on top)
    return parentChain.reverse().map((parentEvent, index) => (
      <EventCard
        key={`parent-${parentEvent.id}-${index}`}
        event={parentEvent}
        onAuthorClick={goToProfile}
        renderContent={(text) => (
          <TruncatedText 
            content={text} 
            maxLength={TEXT_MAX_LENGTH}
            className="text-gray-100 whitespace-pre-wrap break-words"
            renderContentWithClickableHashtags={renderContentWithClickableHashtags}
          />
        )}
        mediaRenderer={renderNoteMedia}
        className="relative p-4 bg-[#2d2d2d] border border-[#3d3d3d] border-t-0 w-full rounded-none"
        showFooter={true}
        footerRight={<NeventSearchButton eventId={parentEvent.id} timestamp={formatEventTimestamp(parentEvent)} exactDate={parentEvent.created_at ? formatExactDate(parentEvent.created_at) : undefined} exactTimestamp={parentEvent.created_at} onSearch={handleNeventSearch} />}
      />
    ));
  }, [expandedParents, goToProfile, renderContentWithClickableHashtags, renderNoteMedia, handleNeventSearch]);

  return useMemo(() => ({
    expandedParents,
    goToProfile,
    handleNeventSearch,
    getCommonEventCardProps,
    renderContentWithClickableHashtags,
    renderNoteMedia,
    renderNoteHeader,
    renderParentChain
  }), [expandedParents, goToProfile, handleNeventSearch, getCommonEventCardProps, renderContentWithClickableHashtags, renderNoteMedia, renderNoteHeader, renderParentChain]);
}
