'use client';

import { useEffect, useState } from 'react';
import type { NDKFilter, NDKSubscription } from '@nostr-dev-kit/ndk';
import { NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import { safeSubscribe } from '@/lib/ndk';
import { relaySets } from '@/lib/relays';

const ZAP_RECEIPT_KIND = 9735;
const NUTZAP_KIND = 9321;

const zapSenderCache = new Map<string, boolean>();
const nutzapSenderCache = new Map<string, boolean>();

type LightningFilterFactory = (pubkey: string) => NDKFilter[];

function useLightningHistoryFlag(
  pubkey: string | null | undefined,
  cache: Map<string, boolean>,
  buildFilters: LightningFilterFactory
): boolean {
  const [hasHistory, setHasHistory] = useState(() => (pubkey ? cache.get(pubkey) ?? false : false));

  useEffect(() => {
    if (!pubkey) {
      setHasHistory(false);
      return;
    }

    const cachedValue = cache.get(pubkey);
    if (cachedValue !== undefined) {
      setHasHistory(cachedValue);
      return;
    }

    let cancelled = false;
    let settled = false;
    let subscription: NDKSubscription | null = null;

    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      cache.set(pubkey, value);
      if (!cancelled) {
        setHasHistory(value);
      }
      try {
        subscription?.stop();
      } catch {}
    };

    setHasHistory(false);

    (async () => {
      try {
        const relaySet = await relaySets.default();
        const filters = buildFilters(pubkey);

        if (!filters.length) {
          finish(false);
          return;
        }

        subscription = safeSubscribe(filters, {
          closeOnEose: true,
          relaySet,
          cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY
        });

        if (!subscription) {
          finish(false);
          return;
        }

        subscription.on('event', () => finish(true));
        subscription.on('eose', () => finish(false));
        subscription.start();
      } catch {
        finish(false);
      }
    })();

    return () => {
      cancelled = true;
      try {
        subscription?.stop();
      } catch {}
    };
  }, [pubkey, cache, buildFilters]);

  return hasHistory;
}

const buildZapFilters: LightningFilterFactory = (pubkey) => [
  {
    kinds: [ZAP_RECEIPT_KIND],
    limit: 1,
    ['#P']: [pubkey]
  }
];

const buildNutzapFilters: LightningFilterFactory = (pubkey) => [
  {
    kinds: [NUTZAP_KIND],
    limit: 1,
    authors: [pubkey]
  }
];

export function useHasSentZap(pubkey?: string | null): boolean {
  return useLightningHistoryFlag(pubkey, zapSenderCache, buildZapFilters);
}

export function useHasSentNutzap(pubkey?: string | null): boolean {
  return useLightningHistoryFlag(pubkey, nutzapSenderCache, buildNutzapFilters);
}


