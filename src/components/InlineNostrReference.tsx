'use client';

import { useState, useEffect } from 'react';
import { nip19 } from 'nostr-tools';
import { NDKEvent, NDKRelaySet, type NDKFilter } from '@nostr-dev-kit/ndk';
import { ndk, safeSubscribe } from '@/lib/ndk';
import { TEXT_MAX_LENGTH } from '@/lib/constants';
import EventCard from '@/components/EventCard';
import TruncatedText from '@/components/TruncatedText';
import { formatRelativeTimeAuto } from '@/lib/relativeTime';

interface InlineNostrReferenceProps {
  token: string;
  onAuthorClick: (npub: string) => void;
  onSearch: (query: string) => void;
  renderContentWithClickableHashtags: (content: string, options?: { disableNevent?: boolean; skipPointerIds?: Set<string> }) => React.ReactNode;
}

export default function InlineNostrReference({ 
  token, 
  onAuthorClick, 
  onSearch, 
  renderContentWithClickableHashtags 
}: InlineNostrReferenceProps) {
  const [embedded, setEmbedded] = useState<NDKEvent | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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
        const m = token.match(/^(nostr:(?:nevent1|naddr1|note1)[0-9a-z]+)([),.;]*)$/i);
        const coreToken = (m ? m[1] : token).replace(/^nostr:/i, '');
        const decoded = nip19.decode(coreToken);
        if (!decoded || (decoded.type !== 'nevent' && decoded.type !== 'naddr' && decoded.type !== 'note')) {
          throw new Error('Unsupported pointer');
        }

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
          setEmbedded(fetched);
        } else {
          setError('Not found');
        }
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Invalid reference');
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => { isMounted = false; };
  }, [token]);

  if (loading) {
    return (
      <span className="inline-block align-middle text-gray-400 bg-[#262626] border border-[#3d3d3d] rounded px-2 py-1">Loading note...</span>
    );
  }
  if (error || !embedded) {
    return (
      <span className="inline-block align-middle text-gray-400 bg-[#262626] border border-[#3d3d3d] rounded px-2 py-1" title={token}>Quoted note unavailable</span>
    );
  }

  const createdAt = embedded.created_at;

  return (
    <div className="w-full">
      <EventCard
        event={embedded}
        onAuthorClick={onAuthorClick}
        renderContent={(text) => (
          <TruncatedText 
            content={text} 
            maxLength={TEXT_MAX_LENGTH}
            className="text-gray-100 whitespace-pre-wrap break-words"
            renderContentWithClickableHashtags={(value) => renderContentWithClickableHashtags(value, { disableNevent: true, skipPointerIds: new Set([embedded.id?.toLowerCase?.() || '']) })}
          />
        )}
        variant="inline"
        footerRight={createdAt ? (
          <button
            type="button"
            className="text-xs hover:underline opacity-80"
            title="Search this reference"
            onClick={() => {
              const q = token;
              onSearch(q);
            }}
          >
            {formatRelativeTimeAuto(createdAt)}
          </button>
        ) : null}
      />
    </div>
  );
}
