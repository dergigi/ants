'use client';

import Image from 'next/image';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import AuthorBadge from '@/components/AuthorBadge';
import { getNewestProfileEvent } from '@/lib/vertex';
import { isAbsoluteHttpUrl } from '@/lib/urlPatterns';
import { useEffect, useMemo, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import CopyButton from '@/components/CopyButton';
import { shortenNpub, trimImageUrl, calculateAbsoluteMenuPosition } from '@/lib/utils';
import { nip19 } from 'nostr-tools';
import { setPrefetchedProfile, prepareProfileEventForPrefetch } from '@/lib/profile/prefetch';
import { createProfileExplorerItems } from '@/lib/portals';
import RawEventJson from '@/components/RawEventJson';
import ExplorerPortalMenu from '@/components/ExplorerPortalMenu';
import ProfileBanner from '@/components/ProfileBanner';
import ProfileCreatedAt from '@/components/ProfileCreatedAt';

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
  const router = useRouter();
  const pathname = usePathname();
  const [showRaw, setShowRaw] = useState(false);
  const [rawProfileEvent, setRawProfileEvent] = useState<NDKEvent | null>(null);
  const [rawLoading, setRawLoading] = useState<boolean>(false);
  const [showPortalMenu, setShowPortalMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const portalButtonRef = useRef<HTMLButtonElement | null>(null);

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
      {showBanner && safeBannerUrl && <ProfileBanner bannerUrl={safeBannerUrl} />}
      {showBanner && !bannerUrl && <ProfileBanner />}
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
        user={event.author}
        onAuthorClick={onAuthorClick}
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

      {showPortalMenu && event?.author?.npub && (() => {
        const items = createProfileExplorerItems(event.author.npub, event.author.pubkey);
        return (
          <ExplorerPortalMenu
            position={menuPosition}
            onClose={() => setShowPortalMenu(false)}
            portalItems={items.slice(0, -2)}
            clientItems={items.slice(-2)}
            showRaw={showRaw}
            onToggleRaw={() => setShowRaw(v => !v)}
          />
        );
      })()}
    </div>
  );
}
