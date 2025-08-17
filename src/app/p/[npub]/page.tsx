'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { ndk, connect } from '@/lib/ndk';
import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import Image from 'next/image';
import { getOldestProfileMetadata, getNewestProfileMetadata } from '@/lib/vertex';
import SearchView from '@/components/SearchView';
import ProfileCard from '@/components/ProfileCard';

function useNostrUser(npub: string | undefined) {
  const [user, setUser] = useState<NDKUser | null>(null);
  const [profileEvent, setProfileEvent] = useState<NDKEvent | null>(null);
  const [pubkey, setPubkey] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!npub) return;
      try { await connect(); } catch {}
      try {
        const { data } = nip19.decode(npub);
        const pk = data as string;
        setPubkey(pk);
        const u = new NDKUser({ pubkey: pk });
        u.ndk = ndk;
        try { await u.fetchProfile(); } catch {}
        setUser(u);
        const evt = new NDKEvent(ndk, {
          kind: 0,
          created_at: Math.floor(Date.now() / 1000),
          content: JSON.stringify(u.profile || {}),
          pubkey: pk,
          tags: [],
          id: '',
          sig: ''
        });
        evt.author = u;
        setProfileEvent(evt);
      } catch {
        setUser(null);
        setProfileEvent(null);
      }
    })();
  }, [npub]);

  return { user, profileEvent, pubkey };
}

function useLatestNotes(pubkey: string | null, limit: number = 30) {
  const [notes, setNotes] = useState<NDKEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!pubkey) return;
    let stopped = false;
    setLoading(true);
    (async () => {
      try { await connect(); } catch {}
      const collected = new Map<string, NDKEvent>();
      const sub = ndk.subscribe([{ kinds: [1], authors: [pubkey], limit }], { closeOnEose: true });
      const timer = setTimeout(() => { try { sub.stop(); } catch {}; if (!stopped) setLoading(false); }, 8000);
      sub.on('event', (evt: NDKEvent) => {
        if (!collected.has(evt.id)) {
          collected.set(evt.id, evt);
        }
      });
      sub.on('eose', () => {
        clearTimeout(timer);
        if (stopped) return;
        const arr = Array.from(collected.values()).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
        setNotes(arr);
        setLoading(false);
      });
      sub.start();
    })();
    return () => { stopped = true; };
  }, [pubkey, limit]);

  return { notes, loading };
}

function RelativeProfileMeta({ pubkey }: { pubkey: string }) {
  const [createdAt, setCreatedAt] = useState<number | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [updatedId, setUpdatedId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const [oldest, newest] = await Promise.all([
          getOldestProfileMetadata(pubkey),
          getNewestProfileMetadata(pubkey)
        ]);
        if (!isMounted) return;
        if (oldest) { setCreatedAt(oldest.created_at || null); setCreatedId(oldest.id || null); }
        if (newest) { setUpdatedAt(newest.created_at || null); setUpdatedId(newest.id || null); }
      } catch {
        // ignore
      }
    })();
    return () => { isMounted = false; };
  }, [pubkey]);

  const relative = (fromTs: number) => {
    const diffMs = Date.now() - fromTs * 1000;
    const seconds = Math.round(diffMs / 1000);
    const minutes = Math.round(seconds / 60);
    const hours = Math.round(minutes / 60);
    const days = Math.round(hours / 24);
    const months = Math.round(days / 30);
    const years = Math.round(days / 365);
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    if (Math.abs(years) >= 1) return rtf.format(-years, 'year');
    if (Math.abs(months) >= 1) return rtf.format(-months, 'month');
    if (Math.abs(days) >= 1) return rtf.format(-days, 'day');
    if (Math.abs(hours) >= 1) return rtf.format(-hours, 'hour');
    if (Math.abs(minutes) >= 1) return rtf.format(-minutes, 'minute');
    return rtf.format(-seconds, 'second');
  };
  const monthYear = (ts: number) => new Date(ts * 1000).toLocaleString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="text-sm text-gray-400 flex justify-end gap-2 flex-wrap">
      {updatedAt && updatedId ? (
        <a href={`https://njump.me/${nip19.neventEncode({ id: updatedId })}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
          {`Updated ${relative(updatedAt)}.`}
        </a>
      ) : null}
      {createdAt && createdId ? (
        <a href={`https://njump.me/${nip19.neventEncode({ id: createdId })}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
          {`On nostr since ${monthYear(createdAt)}.`}
        </a>
      ) : null}
    </div>
  );
}

export default function ProfilePage() {
  const params = useParams<{ npub: string }>();
  const npub = params?.npub;
  const { user, profileEvent, pubkey } = useNostrUser(npub);

  const npubShort = useMemo(() => {
    if (!npub) return '';
    return `${npub.slice(0, 10)}…${npub.slice(-3)}`;
  }, [npub]);

  return (
    <main className="min-h-screen bg-[#1a1a1a] text-gray-100">
      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-4">
        {profileEvent ? (
          <ProfileCard event={profileEvent} onAuthorClick={(n) => {}} />
        ) : null}

        {npub ? (
          <div className="mt-4">
            <SearchView initialQuery={`by:${npub}`} manageUrl={false} />
          </div>
        ) : null}
      </div>
    </main>
  );
}


