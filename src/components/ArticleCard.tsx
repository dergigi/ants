'use client';

import { NDKEvent } from '@nostr-dev-kit/ndk';
import { useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faChevronUp, faNewspaper } from '@fortawesome/free-solid-svg-icons';
import { nip19 } from 'nostr-tools';
import AuthorBadge from '@/components/AuthorBadge';
import Nip05Display from '@/components/Nip05Display';
import CardActions from '@/components/CardActions';
import ArticleMarkdown from '@/components/ArticleMarkdown';
import ExplorerPortalMenu, { type ExplorerMenuItem } from '@/components/ExplorerPortalMenu';
import RawEventJson from '@/components/RawEventJson';
import Image from 'next/image';
import { createArticleExplorerItems, createEventExplorerItems } from '@/lib/portals';
import { extractArticleMetadata, formatArticleDate, truncateMarkdown } from '@/lib/utils/articleUtils';
import { calculateAbsoluteMenuPosition } from '@/lib/utils';
import { NDKUser } from '@nostr-dev-kit/ndk';
import { ndk } from '@/lib/ndk';

interface ArticleCardProps {
  event: NDKEvent;
  onAuthorClick?: (npub: string) => void;
  className?: string;
  showFooter?: boolean;
  footerRight?: React.ReactNode;
  defaultExpanded?: boolean;
}

/**
 * Render a NIP-23 article card with article-aware portal actions and raw-event inspection.
 */
export default function ArticleCard({
  event,
  onAuthorClick,
  className,
  showFooter = true,
  footerRight,
  defaultExpanded = false,
}: ArticleCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showPortalMenu, setShowPortalMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [showRaw, setShowRaw] = useState(false);
  const portalButtonRef = useRef<HTMLButtonElement>(null);
  const meta = extractArticleMetadata(event);
  const fallbackUser = new NDKUser({ pubkey: event.pubkey });
  fallbackUser.ndk = ndk;
  const user = event.author ?? fallbackUser;

  const contentPreview = event.content || '';
  const truncated = truncateMarkdown(contentPreview);
  const shouldTruncate = truncated.length < contentPreview.length;
  const displayContent = expanded ? contentPreview : truncated;
  const articleNostrId = meta.naddr || encodeNevent(event.id);
  const articleNevent = event.id ? encodeNevent(event.id) : '';

  const baseClasses = 'relative p-4 bg-[#2d2d2d] border border-[#3d3d3d]';
  const containerClasses = className
    ? `${baseClasses} ${className}`
    : `${baseClasses} rounded-lg`;

  const buildMenuItems = (): { portalItems: ExplorerMenuItem[]; clientItems: ExplorerMenuItem[] } => {
    if (!articleNostrId) return { portalItems: [], clientItems: [] };

    const items = createEventExplorerItems(articleNostrId);
    const articleItems = meta.naddr
      ? createArticleExplorerItems(meta.naddr, event.pubkey, meta.dTag)
      : [];
    return {
      portalItems: [...articleItems, ...items.slice(0, -2)],
      clientItems: items.slice(-2),
    };
  };

  return (
    <div className={containerClasses}>
      {showRaw ? (
        <RawEventJson event={event} />
      ) : (
        <div className="space-y-3">
          <ArticleHeader meta={meta} user={user} onAuthorClick={onAuthorClick} />
          <ArticleBody
            meta={meta}
            displayContent={displayContent}
            shouldTruncate={shouldTruncate}
            expanded={expanded}
            setExpanded={setExpanded}
          />
          <ArticleTopics topics={meta.topics} />
        </div>
      )}
      {showFooter && (
        <div className="mt-4 text-xs text-gray-300 bg-[#2d2d2d] border-t border-[#3d3d3d] -mx-4 -mb-4 px-4 py-2 flex items-center gap-3 flex-wrap rounded-b-lg">
          <div className="flex items-center gap-2 min-h-[1rem]">
            {event.author && <Nip05Display user={event.author} compact={true} />}
            <AuthorBadge user={event.author ?? user} onAuthorClick={onAuthorClick} />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {footerRight}
            <CardActions
              eventId={event?.id}
              profilePubkey={event?.author?.pubkey}
              eventKind={event?.kind}
              nostrId={meta.naddr || undefined}
              copyTitle={meta.naddr ? 'Copy naddr' : undefined}
              secondaryCopyText={meta.naddr && articleNevent ? `nostr:${articleNevent}` : undefined}
              secondaryCopyTitle="Copy nevent"
              externalHref={articleNostrId ? `nostr:${articleNostrId}` : undefined}
              externalTitle={meta.naddr ? 'Open article in native client' : undefined}
              onToggleMenu={articleNostrId ? () => {
                if (portalButtonRef.current) {
                  const rect = portalButtonRef.current.getBoundingClientRect();
                  setMenuPosition(calculateAbsoluteMenuPosition(rect));
                }
                setShowPortalMenu((v) => !v);
              } : undefined}
              menuButtonRef={portalButtonRef}
            />
          </div>
        </div>
      )}

      {showPortalMenu && articleNostrId && (() => {
        const { portalItems, clientItems } = buildMenuItems();
        return (
          <ExplorerPortalMenu
            position={menuPosition}
            onClose={() => setShowPortalMenu(false)}
            portalItems={portalItems}
            clientItems={clientItems}
            showRaw={showRaw}
            onToggleRaw={() => setShowRaw((v) => !v)}
          />
        );
      })()}
    </div>
  );
}

/**
 * Safely encode a raw event id as `nevent`, returning an empty string when encoding fails.
 */
function encodeNevent(eventId: string | undefined): string {
  if (!eventId) return '';

  try {
    return nip19.neventEncode({ id: eventId });
  } catch {
    return '';
  }
}

/**
 * Render the article header with title, author metadata, and optional summary.
 */
function ArticleHeader({
  meta,
  user,
  onAuthorClick,
}: {
  meta: ReturnType<typeof extractArticleMetadata>;
  user: NDKUser;
  onAuthorClick?: (npub: string) => void;
}) {
  return (
    <div className="space-y-2">
      {/* Title */}
      <div className="flex items-start gap-2">
        <FontAwesomeIcon icon={faNewspaper} className="text-blue-400 mt-1 flex-shrink-0" />
        <h3 className="text-lg font-semibold text-gray-100 leading-tight">
          {meta.naddr ? (
            <a href={`/e/${meta.naddr}`} className="hover:text-blue-300 hover:underline">
              {meta.title || 'Untitled Article'}
            </a>
          ) : (
            meta.title || 'Untitled Article'
          )}
        </h3>
      </div>

      {/* Author + date row */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <AuthorBadge user={user} onAuthorClick={onAuthorClick} />
        {meta.publishedAt && (
          <>
            <span>·</span>
            <span>{formatArticleDate(meta.publishedAt)}</span>
          </>
        )}
      </div>

      {/* Summary if present and different from content start */}
      {meta.summary && (
        <p className="text-gray-300 text-sm italic leading-relaxed">
          {meta.summary}
        </p>
      )}
    </div>
  );
}

/**
 * Render the cover image and expandable markdown preview for an article.
 */
function ArticleBody({
  meta,
  displayContent,
  shouldTruncate,
  expanded,
  setExpanded,
}: {
  meta: ReturnType<typeof extractArticleMetadata>;
  displayContent: string;
  shouldTruncate: boolean;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
}) {
  const [imgError, setImgError] = useState(false);
  const trimmedImage = meta.image.trim();

  return (
    <>
      {/* Cover image */}
      {trimmedImage && !imgError && (
        <div className="rounded overflow-hidden">
          <Image
            src={trimmedImage}
            alt={meta.title || 'Article cover'}
            width={800}
            height={256}
            className="w-full max-h-64 object-cover rounded"
            onError={() => setImgError(true)}
          />
        </div>
      )}

      {/* Content preview */}
      {displayContent && (
        <div className="relative">
          <div className={shouldTruncate && !expanded ? 'relative' : ''}>
            <ArticleMarkdown content={displayContent} />
            {shouldTruncate && !expanded && (
              <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#2d2d2d] to-transparent pointer-events-none" />
            )}
          </div>
          {shouldTruncate && (
            <div className="mt-0.5">
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-center text-gray-400 hover:text-gray-200 transition-colors"
              >
                <FontAwesomeIcon
                  icon={expanded ? faChevronUp : faChevronDown}
                  className="w-3 h-3"
                />
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/**
 * Render topic tags for a NIP-23 article.
 */
function ArticleTopics({ topics }: { topics: string[] }) {
  if (topics.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {topics.map((tag, idx) => (
        <a
          key={`${tag}-${idx}`}
          href={`/t/${encodeURIComponent(tag)}`}
          className="px-2 py-0.5 text-xs rounded-full bg-[#3d3d3d] text-gray-300 hover:bg-[#4d4d4d] hover:text-gray-100 transition-colors"
        >
          #{tag}
        </a>
      ))}
    </div>
  );
}
