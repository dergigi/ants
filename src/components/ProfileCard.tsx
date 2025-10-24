'use client';

import Image from 'next/image';
import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import AuthorBadge from '@/components/AuthorBadge';
import { getNewestProfileMetadata, getNewestProfileEvent } from '@/lib/vertex';
import { isAbsoluteHttpUrl } from '@/lib/urlPatterns';
import { useEffect, useMemo, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExternalLink, faArrowLeft, faBoltLightning, faHouseUser, faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons';
import TitleBarButton from '@/components/TitleBarButton';
import CopyButton from '@/components/CopyButton';
import { shortenNpub, trimImageUrl, calculateAbsoluteMenuPosition } from '@/lib/utils';
import { nip19 } from 'nostr-tools';
import { setPrefetchedProfile, prepareProfileEventForPrefetch } from '@/lib/profile/prefetch';
import { createProfileExplorerItems } from '@/lib/portals';
import RawEventJson from '@/components/RawEventJson';
import CardActions from '@/components/CardActions';
import { formatRelativeTimeAuto } from '@/lib/relativeTime';
import Nip05Display from '@/components/Nip05Display';
import { useHasSentZap, useHasSentNutzap } from '@/hooks/useHasSentZap';
import { createPortal } from 'react-dom';

// Import centralized URL utilities
import { cleanWebsiteUrl } from '@/lib/utils/urlUtils';

function cleanLightningAddress(lightning: string, npub: string): string {
  // If lightning address starts with the user's npub, remove it
  if (lightning.startsWith(npub)) {
    return lightning.substring(npub.length);
  }
  return lightning;
}

function ProfileCreatedAt({ pubkey, fallbackEventId, fallbackCreatedAt, lightning, website, npub, onToggleRaw, showRaw, user, onAuthorClick }: { pubkey: string; fallbackEventId?: string; fallbackCreatedAt?: number; lightning?: string; website?: string; npub: string; onToggleRaw: () => void; showRaw: boolean; user: NDKUser; onAuthorClick?: (npub: string) => void }) {
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [updatedEventId, setUpdatedEventId] = useState<string | null>(null);
  const bottomItems = useMemo(() => createProfileExplorerItems(npub, pubkey), [npub, pubkey]);
  const nativeAppHref = useMemo(() => bottomItems.find((item) => item.name === 'Native App')?.href, [bottomItems]);
  const router = useRouter();
  const pathname = usePathname();
  const hasSentZap = useHasSentZap(pubkey);
  const hasSentNutzap = useHasSentNutzap(pubkey);
  const lightningButtonAccent = hasSentZap && hasSentNutzap ? 'text-green-400' : hasSentZap ? 'text-yellow-200' : hasSentNutzap ? 'text-purple-400' : '';
  const lightningIconAccent = hasSentZap && hasSentNutzap ? 'text-green-400' : hasSentZap ? 'text-yellow-200' : hasSentNutzap ? 'text-purple-400' : '';
  const lightningAnchorAccent = hasSentZap && hasSentNutzap
    ? 'text-green-400 hover:text-green-300'
    : hasSentZap
      ? 'text-yellow-200 hover:text-yellow-100'
      : hasSentNutzap
        ? 'text-purple-400 hover:text-purple-300'
        : 'text-gray-400 hover:text-gray-200';

  const handleLightningSearch = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!lightning) return;
    const searchQuery = `(kind:0 OR kind:1) ${lightning}`;
    const params = new URLSearchParams();
    params.set('q', searchQuery);
    router.push(`/?${params.toString()}`);
  };

  const handleWebsiteSearch = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!website) return;
    const params = new URLSearchParams();
    params.set('q', website);
    router.push(`/?${params.toString()}`);
  };

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const newest = await getNewestProfileMetadata(pubkey);
        if (!isMounted) return;
        if (newest) { setUpdatedAt(newest.created_at || null); setUpdatedEventId(newest.id || null); }
      } catch {
        if (!isMounted) return;
        setUpdatedAt(fallbackCreatedAt || null);
        setUpdatedEventId(fallbackEventId || null);
      }
    })();
    return () => { isMounted = false; };
  }, [pubkey, fallbackEventId, fallbackCreatedAt]);

  const updatedLabel = updatedAt ? formatRelativeTimeAuto(updatedAt) : 'Unknown';
  const cleanedLightning = lightning ? cleanLightningAddress(lightning, npub) : undefined;

  return (
    <div className="text-xs text-gray-300 bg-[#2d2d2d] border-t border-[#3d3d3d] px-4 py-2 flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2 min-h-[1rem]">
        {user && <Nip05Display user={user} onProfileClick={onAuthorClick} />}
        {lightning ? (
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={handleLightningSearch}
              className={`inline-flex items-center gap-1 hover:underline p-1 rounded ${lightningButtonAccent}`.trim()}
              title={`Search for ${lightning}`}
            >
              <FontAwesomeIcon icon={faBoltLightning} className={`h-4 w-4 ${lightningIconAccent}`.trim()} />
              <span className="truncate max-w-[14rem] hidden sm:inline">{cleanedLightning}</span>
            </button>
            <a
              href={`lightning:${lightning}`}
              className={`p-1 rounded hover:bg-gray-600 hidden sm:block ${lightningAnchorAccent}`.trim()}
              title={`Open ${lightning} in Lightning wallet`}
              onClick={(e) => e.stopPropagation()}
            >
              <FontAwesomeIcon icon={faExternalLink} className={`h-4 w-4 ${lightningIconAccent}`.trim()} />
            </a>
          </div>
        ) : null}
        {website && isAbsoluteHttpUrl(website) ? (
          <span className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={handleWebsiteSearch}
              className="inline-flex items-center gap-1 hover:underline p-1 rounded"
              title={`Search for ${website}`}
            >
              <FontAwesomeIcon icon={faHouseUser} className="h-4 w-4" />
              <span className="truncate max-w-[14rem] hidden sm:inline">{cleanWebsiteUrl(website)}</span>
            </button>
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-gray-200 p-1 rounded hover:bg-gray-600 hidden sm:block"
              title={`Open ${website} externally`}
              onClick={(e) => e.stopPropagation()}
            >
              <FontAwesomeIcon icon={faExternalLink} className="h-4 w-4" />
            </a>
          </span>
        ) : null}
        {/* NIP-05 controls moved to AuthorBadge next to the name */}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <div className="flex items-center gap-2">
          {updatedAt && updatedEventId ? (
            pathname.startsWith('/p/') ? (
              <button
                onClick={onToggleRaw}
                className="hover:underline cursor-pointer"
              >
                {updatedLabel}
              </button>
            ) : (
              <a href={`/p/${npub}`} className="hover:underline">{updatedLabel}</a>
            )
          ) : (
            <span>{updatedLabel}</span>
          )}
          <CardActions
            eventId={fallbackEventId}
            profilePubkey={pubkey}
            eventKind={0}
            showRaw={showRaw}
            onToggleRaw={onToggleRaw}
            onToggleMenu={() => {
              if (portalButtonRef.current) {
                const rect = portalButtonRef.current.getBoundingClientRect();
                const position = calculateAbsoluteMenuPosition(rect);
                setMenuPosition(position);
              }
              setShowPortalMenu((v) => !v);
            }}
            menuButtonRef={portalButtonRef}
            externalHref={nativeAppHref}
            externalTitle="Open in native app"
            externalTarget={nativeAppHref?.startsWith('http') ? '_blank' : undefined}
            onExternalClick={(e) => {
              if (!nativeAppHref) return;
              if (nativeAppHref.startsWith('/')) {
                e.preventDefault();
                router.push(nativeAppHref);
              }
            }}
          />
        </div>
      </div>
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
  type ProfileLike = { banner?: string; cover?: string; header?: string; lud16?: string; lud06?: string; website?: string; url?: string } | undefined;
  const profile = (event.author?.profile as ProfileLike);
  const bannerUrl = profile?.banner || profile?.cover || profile?.header;
  const safeBannerUrl = isAbsoluteHttpUrl(bannerUrl) ? bannerUrl : undefined;
  const [bannerExpanded, setBannerExpanded] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const [showRaw, setShowRaw] = useState(false);
  const [rawProfileEvent, setRawProfileEvent] = useState<NDKEvent | null>(null);
  const [rawLoading, setRawLoading] = useState<boolean>(false);
  const [showPortalMenu, setShowPortalMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const portalButtonRef = useRef<HTMLButtonElement>(null);

  // When raw view is toggled on, fetch the newest profile metadata for accurate id/sig
  useEffect(() => {
    if (!showRaw) return;
    if (rawProfileEvent) return;
    let cancelled = false;
    (async () => {
      try {
        setRawLoading(true);
        const newestEvt = await getNewestProfileEvent(event.author.pubkey);
        if (!cancelled) setRawProfileEvent(newestEvt || null);
      } catch {
        if (!cancelled) setRawProfileEvent(null);
      } finally {
        if (!cancelled) setRawLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [showRaw, event.author.pubkey, rawProfileEvent]);

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
      {/* Centralized preseed: whenever a ProfileCard renders, ensure its event is prepared and seeded */}
      {(() => { try { if (event?.kind === 0 && event?.author?.pubkey) { setPrefetchedProfile(event.author.pubkey, prepareProfileEventForPrefetch(event)); } } catch {} return null; })()}
      {showBanner && safeBannerUrl && (
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
            className="relative w-full border-b border-[#3d3d3d]"
            style={{ height: bannerExpanded ? 240 : 32 }}
          >
            <div className="absolute inset-0 overflow-hidden">
              <Image src={safeBannerUrl} alt="Banner" fill className="object-cover" unoptimized />
            </div>
            <div className="absolute top-1 left-1 z-50 flex gap-1">
              <TitleBarButton
                icon={faArrowLeft}
                title="Go back"
                onClick={() => router.back()}
              />
            </div>
            <div className="absolute top-1 right-1 flex gap-1">
              <TitleBarButton
                title="Minimize"
                textSize="text-[10px]"
                onClick={() => setBannerExpanded(false)}
              >
                –
              </TitleBarButton>
              <TitleBarButton
                title="Maximize"
                textSize="text-[10px]"
                onClick={() => {
                  if (safeBannerUrl) window.open(safeBannerUrl, '_blank', 'noopener,noreferrer');
                }}
              >
                ▢
              </TitleBarButton>
              <TitleBarButton
                title="Close"
                textSize="text-[10px]"
                onClick={() => router.push('/')}
              >
                ×
              </TitleBarButton>
            </div>
          </div>
        </div>
      )}
      {showBanner && !bannerUrl && (
        <div className="relative w-full border-b border-[#3d3d3d] bg-[#2d2d2d] rounded-t-lg" style={{ height: 32 }}>
          <div className="absolute top-1 left-1 z-50 flex gap-1">
            <TitleBarButton
              icon={faArrowLeft}
              title="Go back"
              onClick={() => router.back()}
            />
          </div>
          <div className="absolute top-1 right-1 flex gap-1">
            <TitleBarButton
              title="Close"
              textSize="text-[10px]"
              onClick={() => router.push('/')}
            >
              ×
            </TitleBarButton>
          </div>
        </div>
      )}
      <div className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {(() => {
            const avatarUrl = (event.author?.profile as unknown as { image?: string } | undefined)?.image;
            const showAvatar = typeof avatarUrl === 'string' && /^https?:\/\//i.test(avatarUrl);
            if (!showAvatar) return null;
            const handleAvatarClick = (e: React.MouseEvent<HTMLButtonElement>) => {
              e.preventDefault();
              e.stopPropagation();
              // Only run profile-picture search from profile pages
              if (pathname.startsWith('/p/')) {
                const url = avatarUrl as string;
                try {
                  // Extract filename from URL path
                  const parsed = new URL(url);
                  const p = parsed.pathname;
                  const segments = p.split('/').filter(Boolean);
                  const last = segments[segments.length - 1] || '';
                  const filename = last.split('?')[0];
                  if (filename) {
                    const params = new URLSearchParams();
                    params.set('q', filename);
                    router.push(`/?${params.toString()}`);
                    return;
                  }
                } catch {}
              }
              // Otherwise, go to the author's profile; seed prefetch first
              try {
                const { data } = nip19.decode(event.author.npub);
                const pk = data as string;
                setPrefetchedProfile(pk, prepareProfileEventForPrefetch(event));
              } catch {}
              if (onAuthorClick && event.author?.npub) onAuthorClick(event.author.npub);
            };
            return (
            <button
              type="button"
              onClick={handleAvatarClick}
              className="rounded-full w-12 h-12 overflow-hidden hover:opacity-80 transition-opacity"
            >
              <Image
                src={trimImageUrl(avatarUrl)}
                alt="Profile"
                width={48}
                height={48}
                className="w-full h-full object-cover"
                unoptimized
              />
            </button>
            );
          })()}
          <AuthorBadge user={event.author} onAuthorClick={onAuthorClick} />
        </div>
        {event.author?.npub && (
          <div className="flex items-center gap-2 max-w-[50%] text-right text-sm text-gray-400">
            <a
              href={`/p/${event.author.npub}`}
              className="truncate hover:underline hidden sm:block"
              title={event.author.npub}
              onClick={() => {
                try {
                  const { data } = nip19.decode(event.author.npub);
                  const pk = data as string;
                  setPrefetchedProfile(pk, event);
                } catch {}
                // Allow default navigation
              }}
            >
              {shortenNpub(event.author.npub)}
            </a>
            <CopyButton
              text={event.author.npub}
              title="Copy npub"
              className="p-1 rounded border-0 hover:bg-[#3a3a3a]"
            />
          </div>
        )}
      </div>
      {showRaw ? (
        <div className="mt-4">
          <RawEventJson event={rawProfileEvent || event} loading={rawLoading} parseContent={true} />
        </div>
      ) : event.author?.profile?.about ? (
        <div className="mt-4 text-gray-300 break-words">
          {renderBioWithHashtags(event.author?.profile?.about)}
        </div>
      ) : null}
      </div>
      <ProfileCreatedAt
        pubkey={event.author.pubkey}
        fallbackEventId={event.id}
        fallbackCreatedAt={event.created_at}
        lightning={profile?.lud16 || profile?.lud06}
        website={(profile?.website || profile?.url) as string | undefined}
        npub={event.author.npub}
        onToggleRaw={() => setShowRaw(v => !v)}
        showRaw={showRaw}
        user={event.author}
        onAuthorClick={onAuthorClick}
      />
      
      {showPortalMenu && typeof window !== 'undefined' && event?.author?.npub && createPortal(
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
                const items = createProfileExplorerItems(event.author.npub, event.author.pubkey);
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


