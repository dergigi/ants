'use client';

import Image from 'next/image';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import AuthorBadge from '@/components/AuthorBadge';
import { nip19 } from 'nostr-tools';
import { getOldestProfileMetadata, getNewestProfileMetadata } from '@/lib/vertex';
import { getStoredPubkey, logout } from '@/lib/nip07';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

function ProfileCreatedAt({ pubkey, fallbackEventId, fallbackCreatedAt, lightning }: { pubkey: string; fallbackEventId?: string; fallbackCreatedAt?: number; lightning?: string }) {
  const [createdAt, setCreatedAt] = useState<number | null>(null);
  const [createdEventId, setCreatedEventId] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [updatedEventId, setUpdatedEventId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const [oldest, newest] = await Promise.all([
          getOldestProfileMetadata(pubkey),
          getNewestProfileMetadata(pubkey)
        ]);
        if (!isMounted) return;
        if (oldest) { setCreatedAt(oldest.created_at || null); setCreatedEventId(oldest.id || null); }
        if (newest) { setUpdatedAt(newest.created_at || null); setUpdatedEventId(newest.id || null); }
      } catch {
        if (!isMounted) return;
        setCreatedAt(fallbackCreatedAt || null);
        setCreatedEventId(fallbackEventId || null);
        setUpdatedAt(fallbackCreatedAt || null);
        setUpdatedEventId(fallbackEventId || null);
      }
    })();
    return () => { isMounted = false; };
  }, [pubkey, fallbackEventId, fallbackCreatedAt]);

  const relative = (fromTs: number) => {
    const diffMs = Date.now() - fromTs * 1000;
    const seconds = Math.round(diffMs / 1000);
    const minutes = Math.round(seconds / 60);
    const hours = Math.round(minutes / 60);
    const days = Math.round(hours / 24);
    const months = Math.round(days / 30);
    const years = Math.round(days / 365);
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    if (Math.abs(years) >= 1) return rtf.format(-years, 'year');
    if (Math.abs(months) >= 1) return rtf.format(-months, 'month');
    if (Math.abs(days) >= 1) return rtf.format(-days, 'day');
    if (Math.abs(hours) >= 1) return rtf.format(-hours, 'hour');
    if (Math.abs(minutes) >= 1) return rtf.format(-minutes, 'minute');
    return rtf.format(-seconds, 'second');
  };

  const monthYear = (ts: number) => new Date(ts * 1000).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const updatedLabel = updatedAt ? `Updated ${relative(updatedAt)}.` : 'Updated unknown.';
  const sinceLabel = createdAt ? `On nostr since ${monthYear(createdAt)}.` : 'On nostr since unknown.';

  return (
    <div className="text-xs text-gray-300 bg-[#2d2d2d] border-t border-[#3d3d3d] px-4 py-2 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2 min-h-[1rem]">
        {lightning ? (
          <a
            href={`lightning:${lightning}`}
            className="inline-flex items-center gap-1 hover:underline"
            title={lightning}
          >
            <span className="text-yellow-400">⚡</span>
            <span className="truncate max-w-[14rem]">{lightning}</span>
          </a>
        ) : null}
      </div>
      {updatedAt && updatedEventId ? (
        <a href={`https://njump.me/${nip19.neventEncode({ id: updatedEventId })}`} target="_blank" rel="noopener noreferrer" className="hover:underline">{updatedLabel}</a>
      ) : (
        <span>{updatedLabel}</span>
      )}
      {createdAt && createdEventId ? (
        <a href={`https://njump.me/${nip19.neventEncode({ id: createdEventId })}`} target="_blank" rel="noopener noreferrer" className="hover:underline">{sinceLabel}</a>
      ) : (
        <span>{sinceLabel}</span>
      )}
    </div>
  );
}

type ProfileCardProps = {
  event: NDKEvent;
  onAuthorClick?: (npub: string) => void;
  onHashtagClick?: (tag: string) => void;
  showBanner?: boolean;
};

export default function ProfileCard({ event, onAuthorClick, onHashtagClick, showBanner = false }: ProfileCardProps) {
  const noteCardClasses = 'relative bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg overflow-hidden';
  const bannerUrl = (event.author.profile as any)?.banner || (event.author.profile as any)?.cover || (event.author.profile as any)?.header;
  const [bannerExpanded, setBannerExpanded] = useState(false);
  const router = useRouter();
  const isOwnProfile = (getStoredPubkey() || '') === event.author.pubkey;
  const [showPortalMenu, setShowPortalMenu] = useState(false);

  const renderBioWithHashtags = useMemo(() => {
    return (text?: string) => {
      if (!text) return null;
      const parts = text.split(/(#[A-Za-z0-9_]+)/g);
      return parts.map((part, idx) => {
        if (part.startsWith('#')) {
          return (
            <button
              key={`bio-hashtag-${idx}`}
              onClick={() => {
                const tag = part;
                if (onHashtagClick) {
                  onHashtagClick(tag);
                } else {
                  const params = new URLSearchParams();
                  params.set('q', tag);
                  router.push(`/?${params.toString()}`);
                }
              }}
              className="text-blue-400 hover:text-blue-300 hover:underline cursor-pointer"
            >
              {part}
            </button>
          );
        }
        return <span key={`bio-text-${idx}`}>{part}</span>;
      });
    };
  }, [onHashtagClick, router]);
  return (
    <div className={noteCardClasses}>
      {showBanner && bannerUrl && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setBannerExpanded((prev) => !prev)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setBannerExpanded((prev) => !prev);
            }
          }}
          className="block w-full focus:outline-none"
          aria-expanded={bannerExpanded}
          title={bannerExpanded ? 'Collapse banner' : 'Expand banner'}
        >
          <div
            className="relative w-full overflow-hidden border-b border-[#3d3d3d]"
            style={{ height: bannerExpanded ? 240 : 32 }}
          >
            <Image src={bannerUrl} alt="Banner" fill className="object-cover" unoptimized />
            <div className="absolute top-1 left-1">
              <div className="relative">
                <button
                  type="button"
                  aria-label="Open portals menu"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowPortalMenu((v) => !v); }}
                  className="w-5 h-5 rounded-md bg-[#2a2a2a]/70 text-gray-200 border border-[#4a4a4a]/70 shadow-sm flex items-center justify-center text-[12px] leading-none hover:bg-[#3a3a3a]/80 hover:border-[#5a5a5a]/80 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-[#5a5a5a]/40"
                >
                  ⋯
                </button>
                {showPortalMenu && (
                  <div
                    className="absolute z-10 mt-1 w-56 rounded-md bg-[#2d2d2d]/95 border border-[#3d3d3d] shadow-lg backdrop-blur-sm"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowPortalMenu(false); }}
                  >
                    <ul className="py-1 text-sm text-gray-200">
                      {[
                        { name: 'njump.me', base: 'https://njump.me/' },
                        { name: 'nostr.at', base: 'https://nostr.at/' },
                        { name: 'npub.world', base: 'https://npub.world/' },
                        { name: 'nosta.me', base: 'https://nosta.me/' },
                        { name: 'nostr.band', base: 'https://nostr.band/' },
                      ].map((p) => (
                        <li key={p.name}>
                          <a
                            href={`${p.base}${event.author.npub}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block px-3 py-2 hover:bg-[#3a3a3a]"
                            onClick={(e) => { e.stopPropagation(); }}
                          >
                            {p.name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
            <div className="absolute top-1 right-1 flex gap-1">
              <button
                type="button"
                aria-label="Minimize"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setBannerExpanded(false); }}
                className="w-5 h-5 rounded-md bg-[#2a2a2a]/70 text-gray-200 border border-[#4a4a4a]/70 shadow-sm flex items-center justify-center text-[10px] leading-none hover:bg-[#3a3a3a]/80 hover:border-[#5a5a5a]/80 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-[#5a5a5a]/40"
              >
                –
              </button>
              <button
                type="button"
                aria-label="Maximize"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (bannerUrl) window.open(bannerUrl, '_blank', 'noopener,noreferrer');
                }}
                className="w-5 h-5 rounded-md bg-[#2a2a2a]/70 text-gray-200 border border-[#4a4a4a]/70 shadow-sm flex items-center justify-center text-[10px] leading-none hover:bg-[#3a3a3a]/80 hover:border-[#5a5a5a]/80 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-[#5a5a5a]/40"
              >
                ▢
              </button>
              <button
                type="button"
                aria-label="Close"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!isOwnProfile) return;
                  logout();
                  router.push('/');
                }}
                disabled={!isOwnProfile}
                className={`w-5 h-5 rounded-md border shadow-sm flex items-center justify-center text-[10px] leading-none backdrop-blur-sm focus:outline-none focus:ring-2 ${
                  isOwnProfile
                    ? 'bg-[#2a2a2a]/70 text-gray-200 border-[#4a4a4a]/70 hover:bg-[#3a3a3a]/80 hover:border-[#5a5a5a]/80 focus:ring-[#5a5a5a]/40'
                    : 'bg-[#2a2a2a]/40 text-gray-500 border-[#4a4a4a]/40 cursor-not-allowed'
                }`}
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {event.author.profile?.image && (
            <Image
              src={event.author.profile.image}
              alt="Profile"
              width={48}
              height={48}
              className="rounded-full w-12 h-12 object-cover"
              unoptimized
            />
          )}
          <AuthorBadge user={event.author} onAuthorClick={onAuthorClick} />
        </div>
        {event.author?.npub && (
          <a href={`/p/${event.author.npub}`} className="text-sm text-gray-400 truncate max-w-[50%] text-right hover:underline" title={event.author.npub}>
            {`${event.author.npub.slice(0, 10)}…${event.author.npub.slice(-3)}`}
          </a>
        )}
      </div>
      {event.author.profile?.about && (
        <p className="mt-4 text-gray-300 break-words">
          {renderBioWithHashtags(event.author.profile.about)}
        </p>
      )}
      </div>
      <ProfileCreatedAt
        pubkey={event.author.pubkey}
        fallbackEventId={event.id}
        fallbackCreatedAt={event.created_at}
        lightning={(event.author.profile as any)?.lud16}
      />
    </div>
  );
}


