"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { NDKEvent } from "@nostr-dev-kit/ndk";
import Link from "next/link";
import { nip19 } from "nostr-tools";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faComment,
  faHashtag,
  faLock,
  faFont,
} from "@fortawesome/free-solid-svg-icons";
import { ndk } from "@/lib/ndk";
import { getDisplayName } from "@/lib/utils/profileUtils";
import { parseMuteList, type MuteEntry } from "@/lib/muteLists";
import { getMuteListResultData } from "@/lib/search/muteListResultData";
import ProfileImage from "@/components/ProfileImage";

const rowClass =
  "flex min-w-0 items-center gap-3 rounded-md border border-[#3d3d3d] bg-[#262626] px-3 py-2 hover:bg-[#333]";

function MutedProfile({
  pubkey,
  profile,
  onAuthorClick,
}: {
  pubkey: string;
  profile?: NDKEvent;
  onAuthorClick?: (npub: string) => void;
}) {
  const user = useMemo(
    () => profile?.author || ndk.getUser({ pubkey }),
    [pubkey, profile],
  );
  const [, refresh] = useState(0);
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    let active = true;
    // A search may return hundreds of lists. Resolve only rows near the viewport.
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        user
          .fetchProfile()
          .then(() => {
            if (active) refresh((v) => v + 1);
          })
          .catch(() => {});
      },
      { rootMargin: "200px" },
    );
    if (ref.current) observer.observe(ref.current);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [user]);
  const name = getDisplayName(user);
  return (
    <Link
      ref={ref}
      href={`/p/${user.npub}`}
      className={rowClass}
      title={user.npub}
      aria-label={`Muted profile: ${name}`}
      onClick={(e) => {
        if (onAuthorClick) {
          e.preventDefault();
          onAuthorClick(user.npub);
        }
      }}
    >
      <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-[#3d3d3d]">
        <ProfileImage user={user} size={36} alt="" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-blue-400">{name}</span>
        <span className="block truncate text-xs text-gray-400">
          {user.npub.slice(0, 12)}…{user.npub.slice(-6)}
        </span>
      </span>
      <span className="text-xs text-gray-400">Profile</span>
    </Link>
  );
}

function EntryLink({ entry }: { entry: MuteEntry }) {
  const { type, value } = entry;
  const label = type === "e" ? "Thread" : type === "t" ? "Hashtag" : "Word";
  const icon = type === "e" ? faComment : type === "t" ? faHashtag : faFont;
  const text =
    type === "e" ? nip19.noteEncode(value) : type === "t" ? `#${value}` : value;
  const href =
    type === "e"
      ? `/e/${nip19.neventEncode({ id: value })}`
      : `/?q=${encodeURIComponent(type === "t" ? `#${value}` : JSON.stringify(value))}`;
  return (
    <Link
      href={href}
      className={rowClass}
      title={text}
      aria-label={`Muted ${label.toLowerCase()}: ${text}`}
    >
      <span className="h-9 w-9 shrink-0 flex items-center justify-center rounded bg-[#333] text-gray-400">
        <FontAwesomeIcon icon={icon} />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-blue-400">
        {type === "e" ? `${text.slice(0, 14)}…${text.slice(-6)}` : text}
      </span>
      <span className="text-xs text-gray-400">{label}</span>
    </Link>
  );
}

export default function MuteListContent({
  event,
  onAuthorClick,
}: {
  event: NDKEvent;
  onAuthorClick?: (npub: string) => void;
}) {
  const [limit, setLimit] = useState(8);
  const cached = getMuteListResultData(event);
  const data = useMemo(
    () =>
      parseMuteList({
        content: event.content,
        tags: [
          ...event.tags,
          ...(cached?.pubkeys || []).map((key) => ["p", key]),
        ],
      }),
    [event, cached],
  );
  const profiles = useMemo(
    () =>
      new Map(
        (cached?.profiles || []).map((profile) => [
          profile.pubkey.toLowerCase(),
          profile,
        ]),
      ),
    [cached],
  );
  const remaining = data.entries.length - limit;
  return (
    <div className="space-y-3" data-testid="mute-list-content">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-gray-200">Mute list</h3>
        <span className="text-xs text-gray-400">
          {data.entries.length} public muted{" "}
          {data.entries.length === 1 ? "entry" : "entries"}
        </span>
      </div>
      {data.entries.length ? (
        <div className="grid grid-cols-1 gap-2">
          {data.entries
            .slice(0, limit)
            .map((entry) =>
              entry.type === "p" ? (
                <MutedProfile
                  key={`p:${entry.value}`}
                  pubkey={entry.value}
                  profile={profiles.get(entry.value)}
                  onAuthorClick={onAuthorClick}
                />
              ) : (
                <EntryLink key={`${entry.type}:${entry.value}`} entry={entry} />
              ),
            )}
        </div>
      ) : (
        <p className="text-sm text-gray-400">No public muted entries.</p>
      )}
      {remaining > 0 && (
        <button
          type="button"
          className="text-sm text-blue-400 hover:underline"
          onClick={() => setLimit((v) => v + 20)}
        >
          Show {Math.min(remaining, 20)} more ({remaining} remaining)
        </button>
      )}
      {limit > 8 && (
        <button
          type="button"
          className="block text-sm text-gray-400 hover:underline"
          onClick={() => setLimit(8)}
        >
          Show fewer
        </button>
      )}
      {data.hasPrivateContent && (
        <p className="flex items-center gap-2 text-xs text-gray-400">
          <FontAwesomeIcon icon={faLock} />
          Private entries are encrypted.
        </p>
      )}
    </div>
  );
}
