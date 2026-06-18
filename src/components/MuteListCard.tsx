'use client';

import { useMemo, type ReactNode } from 'react';
import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import EventCard from '@/components/EventCard';
import AuthorBadge from '@/components/AuthorBadge';
import ProfileImage from '@/components/ProfileImage';
import { ndk } from '@/lib/ndk';
import { shortenNpub } from '@/lib/utils';
import { prepareProfileEventForPrefetch, setPrefetchedProfile } from '@/lib/profile/prefetch';
import { getMuteListResultData } from '@/lib/search/muteListResultData';

function buildUser(pubkey: string, profileEvent: NDKEvent | null): NDKUser {
  const user = profileEvent?.author || new NDKUser({ pubkey });
  user.ndk = ndk;

  if (profileEvent?.author?.profile) {
    user.profile = profileEvent.author.profile;
  }

  return user;
}

function MutedProfileRow({
  pubkey,
  profileEvent,
  onAuthorClick
}: {
  pubkey: string;
  profileEvent: NDKEvent | null;
  onAuthorClick?: (npub: string) => void;
}) {
  const user = useMemo(() => buildUser(pubkey, profileEvent), [profileEvent, pubkey]);

  const handleOpenProfile = () => {
    try {
      if (profileEvent) {
        setPrefetchedProfile(pubkey, prepareProfileEventForPrefetch(profileEvent));
      }
    } catch {}

    if (onAuthorClick) {
      onAuthorClick(user.npub);
      return;
    }

    if (typeof window !== 'undefined') {
      window.location.href = `/p/${user.npub}`;
    }
  };

  let npub = user.npub;
  if (!npub) {
    try {
      npub = nip19.npubEncode(pubkey);
    } catch {
      npub = pubkey;
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-md border border-[#3d3d3d] bg-[#1f1f1f] px-3 py-2">
      <button
        type="button"
        onClick={handleOpenProfile}
        className="h-10 w-10 overflow-hidden rounded-full border border-[#3d3d3d] bg-[#2d2d2d] hover:opacity-80 transition-opacity"
        title="Open profile"
      >
        <ProfileImage user={user} size={40} />
      </button>
      <div className="min-w-0 flex-1">
        <AuthorBadge user={user} onAuthorClick={onAuthorClick} />
        <div className="mt-1 min-w-0 text-xs text-gray-400">
          <button
            type="button"
            onClick={handleOpenProfile}
            className="truncate hover:underline"
            title={npub}
          >
            {shortenNpub(npub)}
          </button>
        </div>
      </div>
    </div>
  );
}

type MuteListCardProps = {
  event: NDKEvent;
  onAuthorClick?: (npub: string) => void;
  footerRight?: ReactNode;
  className?: string;
};

export default function MuteListCard({ event, onAuthorClick, footerRight, className }: MuteListCardProps) {
  const data = getMuteListResultData(event);
  const pubkeys = data?.pubkeys || [];
  const profilesByPubkey = useMemo(() => {
    const map = new Map<string, NDKEvent>();
    for (const profile of data?.profiles || []) {
      map.set(profile.pubkey.toLowerCase(), profile);
    }
    return map;
  }, [data]);

  return (
    <EventCard
      event={event}
      onAuthorClick={onAuthorClick}
      className={className}
      footerRight={footerRight}
      renderContent={() => (
        <div className="space-y-3">
          <div className="text-sm text-gray-300">
            {pubkeys.length} muted {pubkeys.length === 1 ? 'profile' : 'profiles'}
          </div>
          {pubkeys.length > 0 ? (
            <div className="grid grid-cols-1 gap-2">
              {pubkeys.map((pubkey) => (
                <MutedProfileRow
                  key={pubkey}
                  pubkey={pubkey}
                  profileEvent={profilesByPubkey.get(pubkey.toLowerCase()) || null}
                  onAuthorClick={onAuthorClick}
                />
              ))}
            </div>
          ) : (
            <div className="text-gray-400">(no muted profiles)</div>
          )}
        </div>
      )}
    />
  );
}
