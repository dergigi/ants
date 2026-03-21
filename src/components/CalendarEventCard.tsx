'use client';

import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendarDays } from '@fortawesome/free-solid-svg-icons';
import AuthorBadge from '@/components/AuthorBadge';
import Nip05Display from '@/components/Nip05Display';
import CardActions from '@/components/CardActions';
import Image from 'next/image';
import {
  extractCalendarEventMetadata,
  extractCalendarMetadata,
  formatCalendarDate,
  calendarEventStatus,
} from '@/lib/utils/calendarUtils';
import { decode as decodeGeohash, approximateArea } from '@/lib/geohash';
import { ndk } from '@/lib/ndk';

interface CalendarEventCardProps {
  event: NDKEvent;
  onAuthorClick?: (npub: string) => void;
  className?: string;
  showFooter?: boolean;
  footerRight?: React.ReactNode;
}

export default function CalendarEventCard({
  event,
  onAuthorClick,
  className,
  showFooter = true,
  footerRight,
}: CalendarEventCardProps) {
  const isCalendarCollection = event.kind === 31924;
  const [imgError, setImgError] = useState(false);
  const fallbackUser = new NDKUser({ pubkey: event.pubkey });
  fallbackUser.ndk = ndk;
  const user = event.author ?? fallbackUser;

  const baseClasses = 'relative p-4 bg-[#2d2d2d] border border-[#3d3d3d]';
  const containerClasses = className
    ? `${baseClasses} ${className}`
    : `${baseClasses} rounded-lg`;

  if (isCalendarCollection) {
    const cal = extractCalendarMetadata(event);
    return (
      <div className={containerClasses}>
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <FontAwesomeIcon icon={faCalendarDays} className="text-purple-400 mt-1 flex-shrink-0" />
            <h3 className="text-lg font-semibold text-gray-100 leading-tight">
              {cal.title || 'Untitled Calendar'}
            </h3>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <AuthorBadge user={user} onAuthorClick={onAuthorClick} />
            <span>·</span>
            <span>{cal.eventRefs.length} event{cal.eventRefs.length !== 1 ? 's' : ''}</span>
          </div>
          {event.content && (
            <p className="text-gray-300 text-sm leading-relaxed line-clamp-3">
              {event.content}
            </p>
          )}
        </div>
        {showFooter && <CardFooter event={event} user={user} onAuthorClick={onAuthorClick} footerRight={footerRight} />}
      </div>
    );
  }

  // Kind 31922 or 31923
  const meta = extractCalendarEventMetadata(event);
  const dateDisplay = formatCalendarDate(meta);
  const status = calendarEventStatus(meta);

  const statusColors = {
    upcoming: 'bg-blue-900/50 text-blue-300 border-blue-800',
    ongoing: 'bg-green-900/50 text-green-300 border-green-800',
    past: 'bg-gray-700/50 text-gray-400 border-gray-600',
  };

  return (
    <div className={containerClasses}>
      <div className="space-y-3">
        {/* Title + status */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <FontAwesomeIcon icon={faCalendarDays} className="text-purple-400 mt-1 flex-shrink-0" />
            <h3 className="text-lg font-semibold text-gray-100 leading-tight">
              {meta.title || 'Untitled Event'}
            </h3>
          </div>
          <span className={`px-2 py-0.5 text-xs font-medium rounded border flex-shrink-0 ${statusColors[status]}`}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        </div>

        {/* Author */}
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <AuthorBadge user={user} onAuthorClick={onAuthorClick} />
        </div>

        {/* Date/time */}
        {dateDisplay && (
          <div className="text-sm text-gray-300 font-medium">
            {dateDisplay}
          </div>
        )}

        {/* Image */}
        {meta.image && !imgError && (
          <div className="rounded overflow-hidden">
            <Image
              src={meta.image.trim()}
              alt={meta.title || 'Event image'}
              width={800}
              height={256}
              className="w-full max-h-64 object-cover rounded"
              unoptimized
              onError={() => setImgError(true)}
            />
          </div>
        )}

        {/* Summary */}
        {meta.summary && (
          <p className="text-gray-300 text-sm leading-relaxed">
            {meta.summary}
          </p>
        )}

        {/* Content */}
        {event.content && !meta.summary && (
          <p className="text-gray-300 text-sm leading-relaxed line-clamp-3">
            {event.content}
          </p>
        )}

        {/* Location + geohash */}
        {(meta.location || meta.geohash) && (
          <div className="text-xs text-gray-400 flex items-center gap-1">
            <span className="text-gray-500">&#x1f4cd;</span>
            {meta.location && <span>{meta.location}</span>}
            {meta.location && meta.geohash && <span className="text-gray-600">·</span>}
            {meta.geohash && (() => {
              const { lat, lon } = decodeGeohash(meta.geohash);
              return (
                <a
                  href={`/?q=${encodeURIComponent(`g:${meta.geohash}`)}`}
                  className="text-gray-400 hover:text-gray-300 hover:underline"
                >
                  {lat.toFixed(2)}, {lon.toFixed(2)} ({approximateArea(meta.geohash)})
                </a>
              );
            })()}
          </div>
        )}

        {/* Participants count */}
        {meta.participants.length > 0 && (
          <div className="text-xs text-gray-400">
            {meta.participants.length} participant{meta.participants.length !== 1 ? 's' : ''}
          </div>
        )}

        {/* Hashtags */}
        {meta.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {meta.hashtags.map((tag, idx) => (
              <a
                key={`${tag}-${idx}`}
                href={`/t/${encodeURIComponent(tag)}`}
                className="px-2 py-0.5 text-xs rounded-full bg-[#3d3d3d] text-gray-300 hover:bg-[#4d4d4d] hover:text-gray-100 transition-colors"
              >
                #{tag}
              </a>
            ))}
          </div>
        )}
      </div>

      {showFooter && <CardFooter event={event} user={user} onAuthorClick={onAuthorClick} footerRight={footerRight} />}
    </div>
  );
}

function CardFooter({ event, user, onAuthorClick, footerRight }: {
  event: NDKEvent;
  user: NDKUser;
  onAuthorClick?: (npub: string) => void;
  footerRight?: React.ReactNode;
}) {
  return (
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
  );
}
