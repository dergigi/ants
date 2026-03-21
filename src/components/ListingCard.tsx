'use client';

import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTag } from '@fortawesome/free-solid-svg-icons';
import AuthorBadge from '@/components/AuthorBadge';
import Nip05Display from '@/components/Nip05Display';
import CardActions from '@/components/CardActions';
import Image from 'next/image';
import { extractListingMetadata, formatPrice } from '@/lib/utils/listingUtils';
import { decode as decodeGeohash, approximateArea } from '@/lib/geohash';
import { ndk } from '@/lib/ndk';

interface ListingCardProps {
  event: NDKEvent;
  onAuthorClick?: (npub: string) => void;
  className?: string;
  showFooter?: boolean;
  footerRight?: React.ReactNode;
}

export default function ListingCard({
  event,
  onAuthorClick,
  className,
  showFooter = true,
  footerRight,
}: ListingCardProps) {
  const meta = extractListingMetadata(event);
  const [imgError, setImgError] = useState(false);
  const fallbackUser = new NDKUser({ pubkey: event.pubkey });
  fallbackUser.ndk = ndk;
  const user = event.author ?? fallbackUser;

  const formattedPrice = formatPrice(meta.price, meta.currency, meta.frequency);
  const isSold = meta.status.toLowerCase() === 'sold';

  const baseClasses = 'relative p-4 bg-[#2d2d2d] border border-[#3d3d3d]';
  const containerClasses = className
    ? `${baseClasses} ${className}`
    : `${baseClasses} rounded-lg`;

  return (
    <div className={containerClasses}>
      <div className="space-y-3">
        {/* Title + price row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <FontAwesomeIcon icon={faTag} className="text-green-400 mt-1 flex-shrink-0" />
            <h3 className="text-lg font-semibold text-gray-100 leading-tight">
              {meta.title || 'Untitled Listing'}
            </h3>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isSold && (
              <span className="px-2 py-0.5 text-xs font-medium rounded bg-red-900/50 text-red-300 border border-red-800">
                SOLD
              </span>
            )}
            {formattedPrice && (
              <span className="text-lg font-bold text-green-400 whitespace-nowrap">
                {formattedPrice}
              </span>
            )}
          </div>
        </div>

        {/* Author */}
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <AuthorBadge user={user} onAuthorClick={onAuthorClick} />
        </div>

        {/* Image */}
        {meta.image && !imgError && (
          <div className="rounded overflow-hidden">
            <Image
              src={meta.image.trim()}
              alt={meta.title || 'Listing image'}
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

        {/* Content (markdown description) */}
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
