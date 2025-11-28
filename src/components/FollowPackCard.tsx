'use client';

import { useEffect, useState } from 'react';
import { NDKUser } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import ProfileImage from '@/components/ProfileImage';
import ImageWithBlurhash from '@/components/ImageWithBlurhash';
import { ndk } from '@/lib/ndk';

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

export default function FollowPackCard({ followPack, onExploreClick }: FollowPackCardProps) {
  const maxAvatars = 5;
  const visiblePubkeys = followPack.memberPubkeys.slice(0, maxAvatars);
  const remaining = Math.max(0, followPack.memberCount - visiblePubkeys.length);

  return (
    <div className="mb-3 space-y-3">
      {followPack.description && (
        <div className="text-gray-100 whitespace-pre-wrap break-words">
          {followPack.description}
        </div>
      )}

      {followPack.image && (
        <div className="mb-2">
          <ImageWithBlurhash
            src={followPack.image}
            alt={followPack.title || 'Follow pack image'}
            width={800}
            height={450}
            dim={null}
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
          {remaining > 0 && onExploreClick && (
            <button
              type="button"
              onClick={onExploreClick}
              className="text-sm text-blue-400 hover:text-blue-300 hover:underline"
            >
              +{remaining} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}


