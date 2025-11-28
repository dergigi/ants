'use client';

import { useEffect, useState } from 'react';
import { NDKUser } from '@nostr-dev-kit/ndk';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers } from '@fortawesome/free-solid-svg-icons';
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
    <div className="w-7 h-7 rounded-full overflow-hidden border border-[#3d3d3d] bg-[#1f1f1f] flex items-center justify-center text-[10px] text-gray-300">
      {user ? (
        <ProfileImage user={user} size={28} className="w-full h-full object-cover" />
      ) : (
        <span>..</span>
      )}
    </div>
  );
}

export default function FollowPackCard({ followPack, onExploreClick }: FollowPackCardProps) {
  const maxAvatars = 5;
  const visiblePubkeys = followPack.memberPubkeys.slice(0, maxAvatars);
  const remaining = Math.max(0, followPack.memberCount - visiblePubkeys.length);

  return (
    <div className="mb-3 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <FontAwesomeIcon icon={faUsers} className="text-blue-400" />
        <span className="font-semibold text-gray-100">
          {followPack.title || 'Follow Pack'}
        </span>
      </div>

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
          {remaining > 0 && (
            <div className="text-sm text-gray-400">
              +{remaining} more
            </div>
          )}
        </div>
      )}

      {onExploreClick && followPack.memberPubkeys.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={onExploreClick}
            className="text-blue-400 hover:text-blue-300 hover:underline text-sm"
          >
            Explore pack
          </button>
        </div>
      )}
    </div>
  );
}


