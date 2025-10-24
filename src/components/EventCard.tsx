'use client';

import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import AuthorBadge from '@/components/AuthorBadge';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUpRightFromSquare, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { createEventExplorerItems } from '@/lib/portals';
import { calculateAbsoluteMenuPosition } from '@/lib/utils';
import RawEventJson from '@/components/RawEventJson';
import CardActions from '@/components/CardActions';
import Nip05Display from '@/components/Nip05Display';
import { parseHighlightEvent, HIGHLIGHTS_KIND } from '@/lib/highlights';
import { compareTwoStrings } from 'string-similarity';
import { shortenNpub } from '@/lib/utils';
import { formatUrlResponsive } from '@/lib/utils/urlUtils';
import { nip19 } from 'nostr-tools';
import { ndk } from '@/lib/ndk';

// Helper function for search navigation
const navigateToSearch = (query: string) => {
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


type Props = {
  event: NDKEvent;
  onAuthorClick?: (npub: string) => void;
  renderContent: (content: string) => React.ReactNode;
  variant?: 'card' | 'inline';
  mediaRenderer?: (content: string) => React.ReactNode;
  footerRight?: React.ReactNode;
  className?: string;
  showFooter?: boolean;
};

// No local media helpers; media should be rendered by the provided mediaRenderer prop to keep this component generic.

export default function EventCard({ event, onAuthorClick, renderContent, variant = 'card', mediaRenderer, footerRight, className, showFooter = true }: Props) {
  const baseContainerClasses = variant === 'inline'
    ? 'flex w-full max-w-full flex-col gap-1 px-3 py-2 rounded-md bg-[#1f1f1f] border border-[#3d3d3d]'
    : 'relative p-4 bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg';
  const containerClasses = className ? `${baseContainerClasses} ${className}` : baseContainerClasses;

  const contentClasses = variant === 'inline'
    ? 'text-gray-100 whitespace-pre-wrap break-words'
    : 'text-gray-100 whitespace-pre-wrap break-words';

  const [showPortalMenu, setShowPortalMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const portalButtonRef = useRef<HTMLButtonElement>(null);
  const [showRaw, setShowRaw] = useState(false);

  // Check if this is a highlight event
  const isHighlight = event.kind === HIGHLIGHTS_KIND;
  const highlight = isHighlight ? parseHighlightEvent(event) : null;

  // Inline component to render author like a mention
  function InlineAuthor({ pubkeyHex }: { pubkeyHex: string }) {
    const [label, setLabel] = useState<string>('');
    const [npub, setNpub] = useState<string>('');

    useEffect(() => {
      let isMounted = true;
      (async () => {
        try {
          const user = new NDKUser({ pubkey: pubkeyHex });
          user.ndk = ndk;
          try { await user.fetchProfile(); } catch {}
          if (!isMounted) return;
          const profile = user.profile as { display?: string; displayName?: string; name?: string } | undefined;
          const display = profile?.displayName || profile?.display || profile?.name || '';
          const npubVal = nip19.npubEncode(pubkeyHex);
          setNpub(npubVal);
          setLabel(display || `npub:${shortenNpub(npubVal)}`);
        } catch {
          if (!isMounted) return;
          setLabel(`npub:${shortenNpub(nip19.npubEncode(pubkeyHex))}`);
        }
      })();
      return () => { isMounted = false; };
    }, [pubkeyHex]);

    return (
      <button
        type="button"
        onClick={() => onAuthorClick && onAuthorClick(npub)}
        className="text-blue-400 hover:text-blue-300 hover:underline"
        title={npub}
      >
        {label || <FontAwesomeIcon icon={faSpinner} className="animate-spin" />}
      </button>
    );
  }


  const normalizeForSimilarity = (value?: string) => (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

  const contextSimilarity = highlight?.context
    ? compareTwoStrings(
        normalizeForSimilarity(highlight.content),
        normalizeForSimilarity(highlight.context)
      )
    : 0;
  const shouldShowHighlightContext = Boolean(highlight?.context && contextSimilarity < 0.9);


  // Helper function to render metadata items
  const renderMetadataItem = (label: string, value: string, type: 'text' | 'button' | 'link' = 'text', onClick?: () => void, href?: string) => {
    if (!value) return null;
    
    const linkClasses = "text-blue-400 hover:text-blue-300 hover:underline";
    
    const content = type === 'button' ? (
      <button onClick={onClick} className={linkClasses}>
        {value}
      </button>
    ) : type === 'link' ? (
      <a href={href} target="_blank" rel="noopener noreferrer" className={linkClasses}>
        {value}
      </a>
    ) : (
      <span>{value}</span>
    );

    return (
      <div>
        <span className="font-medium">{label}:</span>{' '}
        {content}
      </div>
    );
  };

  return (
    <div className={containerClasses}>
      {showRaw ? (
        <div className="mt-0">
          <RawEventJson event={event} />
        </div>
      ) : (
        <>
          {isHighlight && highlight ? (
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
                                  <span
                                    className="inline rounded-[2px] bg-[#f6de74]/30 px-1 py-[1px] text-gray-100 shadow-[0_1px_4px_rgba(246,222,116,0.15)] border-b-2 border-[#f6de74]"
                                    style={{ boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}
                                  >
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
                        <span
                          className="inline rounded-[2px] bg-[#f6de74]/30 px-1 py-[1px] text-gray-100 shadow-[0_1px_4px_rgba(246,222,116,0.15)] border-b-2 border-[#f6de74]"
                          style={{ boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}
                        >
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
                  {renderMetadataItem("Range", highlight.range)}
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
                                  <InlineAuthor pubkeyHex={authorHex} />
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
                                  <InlineAuthor pubkeyHex={authorHex} />
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
                                  <InlineAuthor pubkeyHex={authorHex} />
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
          ) : (
            <div className={contentClasses}>{renderContent(event.content || '')}</div>
          )}
          {variant !== 'inline' && mediaRenderer ? mediaRenderer(event.content || '') : null}
        </>
      )}
      {showFooter && (
        <div className={variant === 'inline' ? 'text-xs text-gray-300 pt-1 border-t border-[#3d3d3d] flex items-center justify-between gap-2' : 'mt-4 text-xs text-gray-300 bg-[#2d2d2d] border-t border-[#3d3d3d] -mx-4 -mb-4 px-4 py-2 flex items-center gap-3 flex-wrap rounded-b-lg'}>
          <div className="flex items-center gap-2 min-h-[1rem]">
            {event.author && <Nip05Display user={event.author} compact={true} />}
            <AuthorBadge user={event.author} onAuthorClick={onAuthorClick} />
          </div>
          {footerRight ? (
            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center gap-2">
                {footerRight}
                <CardActions
                  eventId={event?.id}
                  profilePubkey={event?.author?.pubkey}
                  eventKind={event?.kind}
                  showRaw={showRaw}
                  onToggleRaw={() => setShowRaw(v => !v)}
                  onToggleMenu={() => {
                    if (portalButtonRef.current) {
                      const rect = portalButtonRef.current.getBoundingClientRect();
                      const position = calculateAbsoluteMenuPosition(rect);
                      setMenuPosition(position);
                    }
                    setShowPortalMenu((v) => !v);
                  }}
                  menuButtonRef={portalButtonRef}
                />
              </div>
            </div>
          ) : null}
        </div>
      )}
      
      {showPortalMenu && typeof window !== 'undefined' && event?.id && createPortal(
        <>
          <div
            className="fixed inset-0 z-[9998]"
            onClick={(e) => { e.preventDefault(); setShowPortalMenu(false); }}
          />
          <div
            className="absolute z-[9999] w-56 rounded-md bg-[#2d2d2d]/95 border border-[#3d3d3d] shadow-lg backdrop-blur-sm"
            style={{ top: menuPosition.top, left: menuPosition.left }}
            onClick={(e) => { e.stopPropagation(); }}
          >
            <ul className="py-1 text-sm text-gray-200">
              {(() => {
                const nevent = event.id;
                const items = createEventExplorerItems(nevent);
                return items.map((item) => (
                  <li key={item.name}>
                    <a
                      href={item.href}
                      target={item.href.startsWith('http') ? '_blank' : undefined}
                      rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                      className="px-3 py-2 hover:bg-[#3a3a3a] flex items-center justify-between"
                      onClick={(e) => { e.stopPropagation(); setShowPortalMenu(false); }}
                    >
                      <span>{item.name}</span>
                      <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-gray-400 text-xs" />
                    </a>
                  </li>
                ));
              })()}
            </ul>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}


