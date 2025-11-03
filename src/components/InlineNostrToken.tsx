'use client';

import { useState, useEffect } from 'react';
import { nip19 } from 'nostr-tools';
import { NDKEvent, NDKRelaySet, type NDKFilter } from '@nostr-dev-kit/ndk';
import { NDKUser } from '@nostr-dev-kit/ndk';
import { ndk, safeSubscribe } from '@/lib/ndk';
import { shortenNpub } from '@/lib/utils';
import { TEXT_MAX_LENGTH } from '@/lib/constants';
import { NOSTR_TOKEN_PARSE_REGEX } from '@/lib/utils/nostrIdentifiers';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';
import EventCard from '@/components/EventCard';
import TruncatedText from '@/components/TruncatedText';
import { formatRelativeTimeAuto, formatExactDate } from '@/lib/relativeTime';

interface InlineNostrTokenProps {
  token: string;
  onProfileClick: (npub: string) => void;
  onSearch: (query: string) => void;
  renderContentWithClickableHashtags: (content: string, options?: { disableNevent?: boolean; skipIdentifierIds?: Set<string> }) => React.ReactNode;
}

export default function InlineNostrToken({ 
  token, 
  onProfileClick, 
  onSearch, 
  renderContentWithClickableHashtags 
}: InlineNostrTokenProps) {
  const [content, setContent] = useState<React.ReactNode>(null);
  const [loading, setLoading] = useState(true);

  const fetchWithRelayHints = async (filters: NDKFilter[], relayUrls?: string[], hintedTimeout = 5000, fallbackTimeout = 8000): Promise<NDKEvent | null> => {
    const attempt = async (options: { relaySet?: NDKRelaySet | null; timeout: number }): Promise<NDKEvent | null> => {
      return new Promise<NDKEvent | null>((resolve) => {
        const sub = safeSubscribe(filters, { closeOnEose: true, relaySet: options.relaySet ?? undefined });
        if (!sub) {
          resolve(null);
          return;
        }
        let resolved = false;
        const finish = (result: NDKEvent | null) => {
          if (resolved) return;
          resolved = true;
          try { sub.stop(); } catch {}
          resolve(result);
        };
        const timer = setTimeout(() => finish(null), options.timeout);
        sub.on('event', (evt: NDKEvent) => {
          clearTimeout(timer);
          finish(evt);
        });
        sub.on('eose', () => {
          clearTimeout(timer);
          finish(null);
        });
        sub.start();
      });
    };

    const hintedRelays = Array.isArray(relayUrls)
      ? Array.from(
          new Set(
            relayUrls
              .map((r) => (typeof r === 'string' ? r.trim() : ''))
              .filter(Boolean)
              .map((r) => (/^wss?:\/\//i.test(r) ? r : `wss://${r}`))
          )
        )
      : [];

    if (hintedRelays.length > 0) {
      try {
        const relaySet = NDKRelaySet.fromRelayUrls(hintedRelays, ndk);
        const viaHints = await attempt({ relaySet, timeout: hintedTimeout });
        if (viaHints) return viaHints;
      } catch {
        // Ignore relay set creation issues and fall back
      }
    }

    return attempt({ relaySet: null, timeout: fallbackTimeout });
  };

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const m = token.match(NOSTR_TOKEN_PARSE_REGEX);
        const coreToken = (m ? m[1] : token).replace(/^nostr:/i, '');
        const decoded = nip19.decode(coreToken);
        
        if (!decoded) {
          throw new Error('Invalid token');
        }

        // Handle profile tokens (nprofile, npub)
        if (decoded.type === 'nprofile' || decoded.type === 'npub') {
          let pubkey: string;
          if (decoded.type === 'nprofile') {
            pubkey = (decoded.data as { pubkey: string }).pubkey;
          } else {
            pubkey = decoded.data as string;
          }
          
          const user = new NDKUser({ pubkey });
          user.ndk = ndk;
          try { await user.fetchProfile(); } catch {}
          
          if (!isMounted) return;
          
          type UserProfileLike = { display?: string; displayName?: string; name?: string } | undefined;
          const profile = user.profile as UserProfileLike;
          const display = profile?.displayName || profile?.display || profile?.name || '';
          const npubVal = nip19.npubEncode(pubkey);
          
          setContent(
            <button
              type="button"
              className="text-blue-400 hover:text-blue-300 hover:underline inline"
              title={token}
              onClick={() => onProfileClick(npubVal)}
            >
              {display || `npub:${shortenNpub(npubVal)}`}
            </button>
          );
          return;
        }

        // Handle event tokens (nevent, naddr, note)
        if (decoded.type === 'nevent' || decoded.type === 'naddr' || decoded.type === 'note') {
          let fetched: NDKEvent | null = null;
          
          if (decoded.type === 'nevent' || decoded.type === 'note') {
            const data = decoded.data as { id: string; relays?: string[] };
            const { id, relays } = data;
            fetched = await fetchWithRelayHints([{ ids: [id] }], relays ?? []);
          } else if (decoded.type === 'naddr') {
            const data = decoded.data as { pubkey: string; identifier: string; kind: number; relays?: string[] };
            const filter: NDKFilter = {
              kinds: [data.kind],
              authors: [data.pubkey],
              '#d': [data.identifier],
              limit: 1
            };
            fetched = await fetchWithRelayHints([filter], data.relays ?? []);
          }

          if (!isMounted) return;
          
          if (fetched) {
            const createdAt = fetched.created_at;
            setContent(
              <div className="w-full">
                <EventCard
                  event={fetched}
                  onAuthorClick={onProfileClick}
                  renderContent={(text) => (
                    <TruncatedText 
                      content={text} 
                      maxLength={TEXT_MAX_LENGTH}
                      className="text-gray-100 whitespace-pre-wrap break-words"
                      renderContentWithClickableHashtags={(value) => renderContentWithClickableHashtags(value, { disableNevent: true, skipIdentifierIds: new Set([fetched.id?.toLowerCase?.() || '']) })}
                    />
                  )}
                  variant="inline"
                  footerRight={createdAt ? (
                    <button
                      type="button"
                      className="text-xs hover:underline opacity-80"
                      title={formatExactDate(createdAt)}
                      onClick={() => onSearch(token)}
                    >
                      {formatRelativeTimeAuto(createdAt)}
                    </button>
                  ) : null}
                />
              </div>
            );
          } else {
            setContent(
              <span className="inline-block align-middle text-gray-400 bg-[#262626] border border-[#3d3d3d] rounded px-2 py-1" title={token}>
                Quoted note unavailable
              </span>
            );
          }
          return;
        }

        throw new Error('Unsupported token type');
      } catch (err) {
        if (!isMounted) return;
        setContent(
          <span className="inline-block align-middle text-gray-400 bg-[#262626] border border-[#3d3d3d] rounded px-2 py-1" title={token}>
            {err instanceof Error ? err.message : 'Invalid reference'}
          </span>
        );
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => { isMounted = false; };
  }, [token, onProfileClick, onSearch, renderContentWithClickableHashtags]);

  if (loading) {
    return (
      <span className="inline-flex align-middle text-gray-400 bg-[#262626] border border-[#3d3d3d] rounded px-2 py-1 items-center gap-1">
        <FontAwesomeIcon icon={faSpinner} className="animate-spin text-xs" />
      </span>
    );
  }

  // Fallback: if content is null/undefined, render the original token as a clickable link
  if (!content) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onSearch(token);
        }}
        className="text-blue-400 hover:text-blue-300 hover:underline cursor-pointer"
        title={`Search for: ${token}`}
      >
        {token}
      </button>
    );
  }

  return <>{content}</>;
}
