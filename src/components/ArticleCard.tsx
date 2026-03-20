'use client';

import { NDKEvent } from '@nostr-dev-kit/ndk';
import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faChevronUp, faNewspaper } from '@fortawesome/free-solid-svg-icons';
import AuthorBadge from '@/components/AuthorBadge';
import CardActions from '@/components/CardActions';
import RawEventJson from '@/components/RawEventJson';
import { extractArticleMetadata, formatArticleDate } from '@/lib/utils/articleUtils';
import { NDKUser } from '@nostr-dev-kit/ndk';

interface ArticleCardProps {
  event: NDKEvent;
  onAuthorClick?: (npub: string) => void;
  renderContent: (content: string) => React.ReactNode;
  className?: string;
  showFooter?: boolean;
  footerRight?: React.ReactNode;
}

export default function ArticleCard({
  event,
  onAuthorClick,
  renderContent,
  className,
  showFooter = true,
  footerRight,
}: ArticleCardProps) {
  const [showRaw, setShowRaw] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const meta = extractArticleMetadata(event);
  const user = new NDKUser({ pubkey: event.pubkey });

  const contentPreview = event.content || '';
  const shouldTruncate = contentPreview.length > 600;
  const displayContent = expanded || !shouldTruncate
    ? contentPreview
    : contentPreview.slice(0, 600);

  const baseClasses = 'relative p-4 bg-[#2d2d2d] border border-[#3d3d3d]';
  const containerClasses = className
    ? `${baseClasses} ${className}`
    : `${baseClasses} rounded-lg`;

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
            renderContent={renderContent}
          />
          <ArticleTopics topics={meta.topics} />
        </div>
      )}
      {showFooter && (
        <CardActions
          event={event}
          onShowRaw={() => setShowRaw(!showRaw)}
          showingRaw={showRaw}
          eventKind={event.kind}
          footerRight={footerRight}
        />
      )}
    </div>
  );
}

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
          {meta.title || 'Untitled Article'}
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

function ArticleBody({
  meta,
  displayContent,
  shouldTruncate,
  expanded,
  setExpanded,
  renderContent,
}: {
  meta: ReturnType<typeof extractArticleMetadata>;
  displayContent: string;
  shouldTruncate: boolean;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  renderContent: (content: string) => React.ReactNode;
}) {
  return (
    <>
      {/* Cover image */}
      {meta.image && (
        <div className="rounded overflow-hidden">
          <img
            src={meta.image}
            alt={meta.title || 'Article cover'}
            className="w-full max-h-64 object-cover rounded"
            loading="lazy"
          />
        </div>
      )}

      {/* Content preview */}
      {displayContent && (
        <div className="relative">
          <div className={`text-gray-100 whitespace-pre-wrap break-words ${
            shouldTruncate && !expanded ? 'relative' : ''
          }`}>
            {renderContent(displayContent)}
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

function ArticleTopics({ topics }: { topics: string[] }) {
  if (topics.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {topics.map((tag) => (
        <span
          key={tag}
          className="px-2 py-0.5 text-xs rounded-full bg-[#3d3d3d] text-gray-300"
        >
          #{tag}
        </span>
      ))}
    </div>
  );
}
