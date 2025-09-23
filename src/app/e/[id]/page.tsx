'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { nip19 } from 'nostr-tools';
import { NDKEvent, NDKRelaySet } from '@nostr-dev-kit/ndk';
import EventCard from '@/components/EventCard';
import UrlPreview from '@/components/UrlPreview';
import { connect, ndk, safeSubscribe } from '@/lib/ndk';
import { RELAYS } from '@/lib/relays';
import { URL_REGEX, IMAGE_EXT_REGEX, VIDEO_EXT_REGEX, isAbsoluteHttpUrl } from '@/lib/urlPatterns';

export default function EidPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const rawId = params?.id || '';

  const token = useMemo(() => {
    const decodeMaybe = (s: string): string => { try { return decodeURIComponent(s); } catch { return s; } };
    let t = decodeMaybe(rawId).trim();
    if (!t) return '';
    if (/^nostr:/i.test(t)) t = t.replace(/^nostr:/i, '');
    return t;
  }, [rawId]);

  const [event, setEvent] = useState<NDKEvent | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const goToProfile = useCallback((npub: string) => {
    router.push(`/p/${npub}`);
  }, [router]);

  const extractImageUrls = useCallback((text: string): string[] => {
    if (!text) return [];
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = URL_REGEX.exec(text)) !== null) {
      const url = (m[1] || '').replace(/[),.;]+$/, '').trim();
      if (IMAGE_EXT_REGEX.test(url) && !matches.includes(url)) matches.push(url);
    }
    return matches.slice(0, 3);
  }, []);

  const extractVideoUrls = useCallback((text: string): string[] => {
    if (!text) return [];
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = URL_REGEX.exec(text)) !== null) {
      const url = (m[1] || '').replace(/[),.;]+$/, '').trim();
      if (VIDEO_EXT_REGEX.test(url) && !matches.includes(url)) matches.push(url);
    }
    return matches.slice(0, 2);
  }, []);

  const extractNonMediaUrls = (text: string): string[] => {
    if (!text) return [];
    const urls: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = URL_REGEX.exec(text)) !== null) {
      const raw = (m[1] || '').replace(/[),.;]+$/, '').trim();
      if (!IMAGE_EXT_REGEX.test(raw) && !VIDEO_EXT_REGEX.test(raw) && !urls.includes(raw)) {
        urls.push(raw);
      }
    }
    return urls.slice(0, 2);
  };

  const renderNoteMedia = useCallback((content: string) => (
    <>
      {extractImageUrls(content).length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-3">
          {extractImageUrls(content).map((src) => (
            <div key={src} className="relative w-full overflow-hidden rounded-md border border-[#3d3d3d] bg-[#1f1f1f]">
              {isAbsoluteHttpUrl(src) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="linked media" className="h-auto w-full object-cover" />
              ) : null}
            </div>
          ))}
        </div>
      )}
      {extractVideoUrls(content).length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-3">
          {extractVideoUrls(content).map((src) => (
            <div key={src} className="relative w-full overflow-hidden rounded-md border border-[#3d3d3d] bg-[#1f1f1f]">
              <video controls playsInline className="w-full h-auto">
                <source src={src} />
                Your browser does not support the video tag.
              </video>
            </div>
          ))}
        </div>
      )}
      {extractNonMediaUrls(content).length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-3">
          {extractNonMediaUrls(content).map((u) => (
            <UrlPreview key={u} url={u} />
          ))}
        </div>
      )}
    </>
  ), [extractImageUrls, extractVideoUrls]);

  const renderContent = useCallback((text: string) => (
    <div className="text-gray-100 whitespace-pre-wrap break-words">{text}</div>
  ), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEvent(null);

    (async () => {
      try {
        try { await connect(); } catch {}

        // Try to decode token as nevent or note; otherwise treat as hex id
        let id: string | null = null;
        let relaySets: NDKRelaySet[] = [];
        try {
          const decoded = nip19.decode(token.toLowerCase());
          if (decoded?.type === 'nevent') {
            const data = decoded.data as { id: string; relays?: string[] };
            id = data.id;
            const neventRelays = Array.isArray(data.relays) ? Array.from(new Set(
              data.relays
                .filter((r: unknown): r is string => typeof r === 'string')
                .map((r) => /^wss?:\/\//i.test(r) ? r : `wss://${r}`)
            )) : [];
            if (neventRelays.length > 0) relaySets.push(NDKRelaySet.fromRelayUrls(neventRelays, ndk));
          } else if (decoded?.type === 'note') {
            id = decoded.data as string;
          }
        } catch {}

        if (!id) {
          // Accept 64-char hex
          if (/^[0-9a-fA-F]{64}$/.test(token)) {
            id = token.toLowerCase();
          }
        }

        if (!id) {
          setError('Invalid event identifier');
          setLoading(false);
          return;
        }

        // Always try default and search relay sets after any nevent-provided relays
        relaySets.push(
          NDKRelaySet.fromRelayUrls([...RELAYS.DEFAULT], ndk),
          NDKRelaySet.fromRelayUrls([...RELAYS.SEARCH], ndk)
        );

        let found: NDKEvent | null = null;
        for (const rs of relaySets) {
          // eslint-disable-next-line no-await-in-loop
          const evt = await new Promise<NDKEvent | null>((resolve) => {
            let local: NDKEvent | null = null;
            const sub = safeSubscribe([{ ids: [id as string], limit: 1 }], { closeOnEose: true, relaySet: rs });
            if (!sub) { resolve(null); return; }
            const timer = setTimeout(() => { try { sub.stop(); } catch {}; resolve(local); }, 8000);
            sub.on('event', (e: NDKEvent) => { local = e; });
            sub.on('eose', () => { clearTimeout(timer); try { sub.stop(); } catch {}; resolve(local); });
            sub.start();
          });
          if (evt) { found = evt; break; }
        }

        if (cancelled) return;
        if (!found) {
          setError('Event not found');
          setLoading(false);
          return;
        }
        setEvent(found);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError('Failed to load event');
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [token]);

  return (
    <main className="min-h-screen bg-[#1a1a1a] text-gray-100">
      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-4">
        {loading && (
          <div className="text-sm text-gray-400">Loading event…</div>
        )}
        {!loading && error && (
          <div className="text-sm text-red-400">{error}</div>
        )}
        {!loading && event && (
          <EventCard
            event={event}
            onAuthorClick={goToProfile}
            renderContent={renderContent}
            mediaRenderer={renderNoteMedia}
          />
        )}
      </div>
    </main>
  );
}
