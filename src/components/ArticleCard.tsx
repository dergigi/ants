'use client';

import { NDKEvent } from '@nostr-dev-kit/ndk';
import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faChevronUp, faNewspaper } from '@fortawesome/free-solid-svg-icons';
import AuthorBadge from '@/components/AuthorBadge';
import Nip05Display from '@/components/Nip05Display';
import CardActions from '@/components/CardActions';
import ArticleMarkdown from '@/components/ArticleMarkdown';
import Image from 'next/image';
import { extractArticleMetadata, formatArticleDate, truncateMarkdown } from '@/lib/utils/articleUtils';
import { NDKUser } from '@nostr-dev-kit/ndk';
import { ndk } from '@/lib/ndk';

interface ArticleCardProps {
  event: NDKEvent;
  onAuthorClick?: (npub: string) => void;
  className?: string;
  showFooter?: boolean;
  footerRight?: React.ReactNode;
}

export default function ArticleCard({
  event,
  onAuthorClick,
  className,
  showFooter = true,
  footerRight,
}: ArticleCardProps) {
  const [expanded, setExpanded] = useState(false);
  const meta = extractArticleMetadata(event);
  const fallbackUser = new NDKUser({ pubkey: event.pubkey });
  fallbackUser.ndk = ndk;
  const user = event.author ?? fallbackUser;

  const contentPreview = event.content || '';
  const truncated = truncateMarkdown(contentPreview);
  const shouldTruncate = truncated.length < contentPreview.length;
  const displayContent = expanded ? contentPreview : truncated;

  const baseClasses = 'relative p-4 bg-[#2d2d2d] border border-[#3d3d3d]';
  const containerClasses = className
    ? `${baseClasses} ${className}`
    : `${baseClasses} rounded-lg`;

  return (
    <div className={containerClasses}>
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
            />
          </div>
        </div>
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
  return (
    <>
      {/* Cover image */}
      {meta.image && (
        <div className="rounded overflow-hidden">
          <Image
            src={meta.image}
            alt={meta.title || 'Article cover'}
            width={800}
            height={256}
            className="w-full max-h-64 object-cover rounded"
            unoptimized
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

function ArticleTopics({ topics }: { topics: string[] }) {
  if (topics.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {topics.map((tag, idx) => (
        <span
          key={`${tag}-${idx}`}
          className="px-2 py-0.5 text-xs rounded-full bg-[#3d3d3d] text-gray-300"
        >
          #{tag}
        </span>
      ))}
    </div>
  );
}
