'use client';

import React, { useEffect, useState, useRef } from 'react';
import { NDKUser } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEllipsis } from '@fortawesome/free-solid-svg-icons';
import ProfileImage from '@/components/ProfileImage';
import ImageWithBlurhash from '@/components/ImageWithBlurhash';
import { ndk } from '@/lib/ndk';
import { getIsKindTokens } from '@/lib/search/replacements';
import { calculateAbsoluteMenuPosition } from '@/lib/utils';

export type FollowPackData = {
  title?: string;
  description?: string;
  image?: string;
  memberCount: number;
  memberPubkeys: string[];
};

type FollowPackCardProps = {
  followPack: FollowPackData;
  onExploreClick?: () => void;
  renderContent?: (content: string) => React.ReactNode;
};

function FollowPackMemberAvatar({ pubkeyHex }: { pubkeyHex: string }) {
  const [user, setUser] = useState<NDKUser | null>(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const u = new NDKUser({ pubkey: pubkeyHex });
        u.ndk = ndk;
        try {
          await u.fetchProfile();
        } catch {
          // Ignore fetch errors; fallback avatar will be shown.
        }
        if (!isMounted) return;
        setUser(u);
      } catch {
        if (!isMounted) return;
        setUser(null);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [pubkeyHex]);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        try {
          const npub = nip19.npubEncode(pubkeyHex);
          window.location.href = `/p/${npub}`;
        } catch {
          // If encoding fails, fall back to no-op.
        }
      }}
      className="w-7 h-7 rounded-full overflow-hidden border border-[#3d3d3d] bg-[#1f1f1f] flex items-center justify-center text-[10px] text-gray-300 hover:opacity-80 transition-opacity"
      title="Open profile"
    >
      {user ? (
        <ProfileImage user={user} size={28} className="w-full h-full object-cover" />
      ) : (
        <span>..</span>
      )}
    </button>
  );
}

export default function FollowPackCard({ followPack, onExploreClick, renderContent }: FollowPackCardProps) {
  const maxAvatars = 5;
  const visiblePubkeys = followPack.memberPubkeys.slice(0, maxAvatars);
  const remaining = Math.max(0, followPack.memberCount - visiblePubkeys.length);

  const [quickSearchItems, setQuickSearchItems] = useState<string[]>([]);
  const [showPortalMenu, setShowPortalMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tokens = await getIsKindTokens();
        if (!cancelled) setQuickSearchItems(tokens);
      } catch {
        if (!cancelled) setQuickSearchItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleMenuToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      const position = calculateAbsoluteMenuPosition(rect);
      setMenuPosition(position);
    }
    setShowPortalMenu((v) => !v);
  };

  const handleQuickSearchClick = (token: string) => {
    if (!followPack.memberPubkeys.length) return;
    const byClause = followPack.memberPubkeys.map((p) => `by:${p}`).join(' OR ');
    const query = `${token} (${byClause})`;
    try {
      window.location.href = `/?q=${encodeURIComponent(query)}`;
    } catch {
      // Swallow navigation errors; nothing else to do here.
    }
    setShowPortalMenu(false);
  };

  return (
    <div className="mb-3 space-y-3">
      {followPack.description && (
        <div className="text-gray-100 whitespace-pre-wrap break-words">
          {renderContent ? renderContent(followPack.description) : followPack.description}
        </div>
      )}

      {followPack.image && (
        <div className="mb-2 h-48 rounded-md relative">
          <ImageWithBlurhash
            src={followPack.image}
            alt={followPack.title || 'Follow pack image'}
            width={800}
            height={200}
            dim={null}
            objectFit="cover"
            containerClassName="h-full overflow-visible"
          />
        </div>
      )}

      {followPack.memberCount > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            {visiblePubkeys.map((pubkey) => (
              <FollowPackMemberAvatar key={pubkey} pubkeyHex={pubkey} />
            ))}
          </div>
          {(remaining > 0 || followPack.memberPubkeys.length > 0) && (
            <div className="flex items-center gap-1">
              {remaining > 0 && onExploreClick && (
                <button
                  type="button"
                  onClick={onExploreClick}
                  className="text-sm text-blue-400 hover:text-blue-300 hover:underline"
                >
                  +{remaining} more
                </button>
              )}
              {followPack.memberPubkeys.length > 0 && (
                <button
                  ref={menuButtonRef}
                  type="button"
                  onClick={handleMenuToggle}
                  className="w-7 h-7 rounded-full border border-[#3d3d3d] bg-[#1f1f1f] flex items-center justify-center text-gray-300 hover:bg-[#3a3a3a] transition-colors"
                  title="Quick search in this follow pack"
                >
                  <FontAwesomeIcon icon={faEllipsis} className="text-xs" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {showPortalMenu && typeof window !== 'undefined' && createPortal(
        <>
          <div
            className="fixed inset-0 z-[9998]"
            onClick={(e) => {
              e.preventDefault();
              setShowPortalMenu(false);
            }}
          />
          <div
            className="absolute z-[9999] w-56 rounded-md bg-[#2d2d2d]/95 border border-[#3d3d3d] shadow-lg backdrop-blur-sm"
            style={{ top: menuPosition.top, left: menuPosition.left }}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <ul className="py-1 text-sm text-gray-200">
              {quickSearchItems.map((token) => (
                <li key={token}>
                  <button
                    type="button"
                    className="block w-full text-left px-3 py-2 hover:bg-[#3a3a3a]"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleQuickSearchClick(token);
                    }}
                  >
                    {token}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}


