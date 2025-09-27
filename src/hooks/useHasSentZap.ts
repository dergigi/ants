'use client';

import { useEffect, useState } from 'react';
import type { NDKFilter, NDKSubscription } from '@nostr-dev-kit/ndk';
import { NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import { safeSubscribe } from '@/lib/ndk';
import { relaySets } from '@/lib/relays';

const ZAP_RECEIPT_KIND = 9735;
const zapSenderCache = new Map<string, boolean>();

export function useHasSentZap(pubkey?: string | null): boolean {
  const [hasSentZap, setHasSentZap] = useState(() => (pubkey ? zapSenderCache.get(pubkey) ?? false : false));

  useEffect(() => {
    if (!pubkey) {
      setHasSentZap(false);
      return;
    }

    const cachedValue = zapSenderCache.get(pubkey);
    if (cachedValue !== undefined) {
      setHasSentZap(cachedValue);
      return;
    }

    let cancelled = false;
    let settled = false;
    let subscription: NDKSubscription | null = null;

    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      zapSenderCache.set(pubkey, value);
      if (!cancelled) {
        setHasSentZap(value);
      }
      try {
        subscription?.stop();
      } catch {}
    };

    setHasSentZap(false);

    (async () => {
      try {
        const relaySet = await relaySets.default();
        const filter: NDKFilter = {
          kinds: [ZAP_RECEIPT_KIND],
          limit: 1,
          ['#P']: [pubkey]
        };

        subscription = safeSubscribe([filter], {
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
  }, [pubkey]);

  return hasSentZap;
}


