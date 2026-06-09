'use client';

import { useEffect, useState } from 'react';
import { NDKUser } from '@nostr-dev-kit/ndk';
import { useRouter, usePathname } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExternalLink, faBoltLightning, faHouseUser } from '@fortawesome/free-solid-svg-icons';
import { getNewestProfileMetadata } from '@/lib/vertex';
import { isAbsoluteHttpUrl } from '@/lib/urlPatterns';
import { formatRelativeTimeAuto, formatExactDate } from '@/lib/relativeTime';
import { cleanWebsiteUrl } from '@/lib/utils/urlUtils';
import { useHasSentZap, useHasSentNutzap } from '@/hooks/useHasSentZap';
import CardActions from '@/components/CardActions';
import Nip05Display from '@/components/Nip05Display';

function cleanLightningAddress(lightning: string, npub: string): string {
  // If lightning address starts with the user's npub, remove it
  if (lightning.startsWith(npub)) {
    return lightning.substring(npub.length);
  }
  return lightning;
}

type Props = {
  pubkey: string;
  fallbackEventId?: string;
  fallbackCreatedAt?: number;
  lightning?: string;
  website?: string;
  npub: string;
  onToggleRaw: () => void;
  user: NDKUser;
  onAuthorClick?: (npub: string) => void;
  onToggleMenu?: () => void;
  menuButtonRef?: React.RefObject<HTMLButtonElement | null>;
};

/** Profile card footer: NIP-05, lightning/website shortcuts, and last-updated timestamp */
export default function ProfileCreatedAt({ pubkey, fallbackEventId, fallbackCreatedAt, lightning, website, npub, onToggleRaw, user, onAuthorClick, onToggleMenu, menuButtonRef }: Props) {
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [updatedEventId, setUpdatedEventId] = useState<string | null>(null);
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
  const timestampProps = typeof updatedAt === 'number'
    ? { 'data-timestamp': String(updatedAt) }
    : {};

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
                title={updatedAt ? formatExactDate(updatedAt) : undefined}
                {...timestampProps}
              >
                {updatedLabel}
              </button>
            ) : (
              <a href={`/p/${npub}`} className="hover:underline" title={updatedAt ? formatExactDate(updatedAt) : undefined} {...timestampProps}>{updatedLabel}</a>
            )
          ) : (
            <span title={updatedAt ? formatExactDate(updatedAt) : undefined} {...timestampProps}>{updatedLabel}</span>
          )}
          <CardActions
            eventId={fallbackEventId}
            profilePubkey={pubkey}
            eventKind={0}
            onToggleMenu={onToggleMenu}
            menuButtonRef={menuButtonRef}
          />
        </div>
      </div>
    </div>
  );
}
