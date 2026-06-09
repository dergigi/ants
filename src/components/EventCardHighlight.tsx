'use client';

import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons';
import { compareTwoStrings } from 'string-similarity';
import { HighlightData } from '@/lib/highlights';
import { formatUrlResponsive } from '@/lib/utils/urlUtils';
import InlineAuthor from '@/components/InlineAuthor';

// Helper function for search navigation
export const navigateToSearch = (query: string) => {
  window.location.href = `/?q=${encodeURIComponent(query)}`;
};

// Reusable search button component
const SearchButton = ({ query, children, className = "text-blue-400 hover:text-blue-300 hover:underline" }: { query: string; children: React.ReactNode; className?: string }) => (
  <button
    type="button"
    onClick={() => navigateToSearch(query)}
    className={className}
  >
    {children}
  </button>
);

const HIGHLIGHT_SPAN_CLASSES = 'inline rounded-[2px] bg-[#f6de74]/30 px-1 py-[1px] text-gray-100 shadow-[0_1px_4px_rgba(246,222,116,0.15)] border-b-2 border-[#f6de74]';
const HIGHLIGHT_SPAN_STYLE = { boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' } as const;

type Props = {
  highlight: HighlightData;
  contentClasses: string;
  renderContent: (content: string) => React.ReactNode;
  onAuthorClick?: (npub: string) => void;
};

/** The highlight (NIP-84) rendering: comment, highlighted context, range, and source */
export default function EventCardHighlight({ highlight, contentClasses, renderContent, onAuthorClick }: Props) {
  const normalizeForSimilarity = (value?: string) => (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

  const contextSimilarity = highlight.context
    ? compareTwoStrings(
        normalizeForSimilarity(highlight.content),
        normalizeForSimilarity(highlight.context)
      )
    : 0;
  const shouldShowHighlightContext = Boolean(highlight.context && contextSimilarity < 0.9);

  return (
    <div className="mb-3 space-y-3">
      {/* Comment if present */}
      {highlight.comment ? (
        <div className="mb-3">
          <div className={contentClasses}>
            {renderContent(highlight.comment)}
          </div>
          <div className="border-t border-[#3d3d3d] mt-3"></div>
        </div>
      ) : null}

      {/* Render context with highlighted content embedded */}
      <div className={contentClasses}>
        {(() => {
          if (highlight.context && shouldShowHighlightContext) {
            // When context is present, render the full context with the content highlighted within it
            const context = highlight.context;
            const content = highlight.content;

            // Split context by double newlines to get paragraphs
            const paragraphs = context.split(/\n\s*\n/).filter(p => p.trim() !== '');

            return paragraphs.map((paragraph, index) => {
              // Check if this paragraph contains the highlighted content
              const containsHighlight = paragraph.includes(content);

              return (
                <p key={index} className="mb-4 last:mb-0">
                  {containsHighlight ? (
                    // Split paragraph around the content and highlight it
                    paragraph.split(content).map((part, partIndex) => (
                      <span key={partIndex}>
                        {part}
                        {partIndex < paragraph.split(content).length - 1 && (
                          <span className={HIGHLIGHT_SPAN_CLASSES} style={HIGHLIGHT_SPAN_STYLE}>
                            {content}
                          </span>
                        )}
                      </span>
                    ))
                  ) : (
                    // Regular paragraph without highlight
                    paragraph.trim()
                  )}
                </p>
              );
            });
          } else {
            // No context, just highlight the content directly
            const content = highlight.content;
            const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim() !== '');

            return paragraphs.map((paragraph, index) => (
              <p key={index} className="mb-4 last:mb-0">
                <span className={HIGHLIGHT_SPAN_CLASSES} style={HIGHLIGHT_SPAN_STYLE}>
                  {paragraph.trim()}
                </span>
              </p>
            ));
          }
        })()}
      </div>

      {/* Range metadata if present */}
      {highlight.range ? (
        <div className="text-xs text-gray-400">
          <div>
            <span className="font-medium">Range:</span>{' '}
            <span>{highlight.range}</span>
          </div>
        </div>
      ) : null}

      {/* Simple source display */}
      {(() => {
        const sourceUrl = highlight.referencedUrl;
        const sourceEvent = highlight.referencedEvent;
        const authorHex = highlight.referencedAuthorHex;

        if (!sourceUrl && !sourceEvent) return null;

        return (
          <div className="text-xs text-gray-400 flex items-center gap-1">
            {sourceUrl ? (
              // r tag - external URL
              (() => {
                const { displayText, fullUrl } = formatUrlResponsive(sourceUrl, {
                  desktopMaxLength: 42,
                  mobileMaxLength: 28
                });
                return (
                  <>
                    <span className="font-medium">Source:</span>{' '}
                    <SearchButton query={fullUrl}>
                      {displayText}
                    </SearchButton>
                    <a
                      href={fullUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 text-gray-500 hover:text-gray-400"
                      title="Open in new tab"
                    >
                      <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-xs" />
                    </a>
                  </>
                );
              })()
            ) : sourceEvent ? (
              // a or e tag - nostr event
              (() => {
                const isLongForm = sourceEvent.startsWith('30023:');
                const isETag = highlight.referencedEventType === 'e';

                if (isLongForm) {
                  // Blog post - use "Highlight from a blog post by [Author]"
                  return (
                    <span>
                      Highlight from a{' '}
                      <SearchButton query={`a:${sourceEvent}`}>
                        blog post
                      </SearchButton>
                      {authorHex && (
                        <>
                          {' by '}
                          <InlineAuthor pubkeyHex={authorHex} onAuthorClick={onAuthorClick} />
                        </>
                      )}
                    </span>
                  );
                } else if (isETag) {
                  // Simple nostr event (e tag) - link to /e/ path
                  return (
                    <span>
                      Highlight from a{' '}
                      <a
                        href={`/e/${sourceEvent}`}
                        className="text-blue-400 hover:text-blue-300 hover:underline"
                      >
                        nostr post
                      </a>
                      {authorHex && (
                        <>
                          {' by '}
                          <InlineAuthor pubkeyHex={authorHex} onAuthorClick={onAuthorClick} />
                        </>
                      )}
                    </span>
                  );
                } else {
                  // Regular nostr post (a tag) - use search
                  return (
                    <span>
                      <span className="font-medium">Source:</span>{' '}
                      <SearchButton query={`a:${sourceEvent}`}>
                        nostr post
                      </SearchButton>
                      {authorHex && (
                        <>
                          {' by '}
                          <InlineAuthor pubkeyHex={authorHex} onAuthorClick={onAuthorClick} />
                        </>
                      )}
                    </span>
                  );
                }
              })()
            ) : null}
          </div>
        );
      })()}
    </div>
  );
}
