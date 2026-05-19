'use client';

/**
 * Inline resolution indicator for Namecoin `.bit` identifiers typed
 * into the global search bar. Mirrors the Kotlin
 * `NamecoinResolutionRow` composable used in Amethyst (PR #2956 /
 * #2957) and the Swift port in Nostur (PR #60).
 *
 * Renders nothing while the parsed query does not look like a `.bit`
 * identifier. Otherwise debounces ~400ms, kicks off
 * `resolveNamecoinNip05`, and shows one of: spinner, resolved npub
 * short-form with `Namecoin` badge, or an explicit failure message
 * (`name not found / expired`, `no nostr field on this name`, or
 * `lookup failed (network / TLS)`).
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { faIdBadge } from '@fortawesome/free-regular-svg-icons';
import { nip19 } from 'nostr-tools';

import { isDotBit, resolveNamecoinNip05, type NamecoinResolveResult } from '@/lib/namecoin';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'resolved'; result: NamecoinResolveResult; npub: string }
  | { kind: 'not-found' }
  | { kind: 'no-nostr' }
  | { kind: 'error' };

function shortNpub(npub: string): string {
  if (npub.length <= 16) return npub;
  return `${npub.slice(0, 12)}…${npub.slice(-4)}`;
}

export default function NamecoinResolutionIndicator({ query }: { query: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQueryRef = useRef<string>('');

  useEffect(() => {
    const trimmed = query.trim();
    if (!isDotBit(trimmed)) {
      lastQueryRef.current = '';
      setState({ kind: 'idle' });
      if (debounceRef.current) clearTimeout(debounceRef.current);
      return;
    }
    if (trimmed === lastQueryRef.current) return;
    lastQueryRef.current = trimmed;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setState({ kind: 'loading' });
    let cancelled = false;
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await resolveNamecoinNip05(trimmed);
        if (cancelled || lastQueryRef.current !== trimmed) return;
        if (!result) {
          // We cannot easily distinguish "name missing" from "name exists
          // but lacks a nostr field" without re-querying. Surface the
          // generic not-found state; the failure copy still nudges the
          // user toward a correct identifier.
          setState({ kind: 'not-found' });
          return;
        }
        let npub = '';
        try {
          npub = nip19.npubEncode(result.pubkey);
        } catch {
          // ignore — pubkey already validated as 64-char hex upstream
        }
        setState({ kind: 'resolved', result, npub });
      } catch {
        if (cancelled || lastQueryRef.current !== trimmed) return;
        setState({ kind: 'error' });
      }
    }, 400);
    return () => {
      cancelled = true;
    };
  }, [query]);

  if (state.kind === 'idle') return null;

  const badge = (
    <span className="inline-flex items-center gap-1 rounded bg-purple-900/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple-300">
      Namecoin
    </span>
  );

  if (state.kind === 'loading') {
    return (
      <div className="mt-1 flex items-center gap-2 px-1 text-xs text-gray-400">
        {badge}
        <FontAwesomeIcon icon={faSpinner} className="h-3 w-3 animate-spin" />
        <span>resolving .bit identity on the Namecoin chain…</span>
      </div>
    );
  }

  if (state.kind === 'resolved') {
    const { result, npub } = state;
    const onClick = (e: React.MouseEvent) => {
      e.preventDefault();
      if (npub) router.push(`/p/${npub}`);
    };
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2 px-1 text-xs text-gray-300">
        {badge}
        <FontAwesomeIcon icon={faIdBadge} className="h-3 w-3 text-green-400" />
        {npub ? (
          <button
            type="button"
            onClick={onClick}
            className="font-mono text-green-300 hover:underline"
            title={`Open profile ${npub}`}
          >
            {shortNpub(npub)}
          </button>
        ) : (
          <span className="font-mono text-green-300">{result.pubkey.slice(0, 12)}…</span>
        )}
        {result.relays && result.relays.length > 0 ? (
          <span className="text-gray-500">
            · {result.relays.length} relay{result.relays.length === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>
    );
  }

  // Failure variants.
  const message =
    state.kind === 'not-found'
      ? 'name not registered on Namecoin (or has no nostr field)'
      : state.kind === 'no-nostr'
        ? 'name found but no nostr field on this Namecoin record'
        : 'Namecoin lookup failed (network / TLS error)';

  return (
    <div className="mt-1 flex items-center gap-2 px-1 text-xs text-yellow-400">
      {badge}
      <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
      <span>{message}</span>
    </div>
  );
}
