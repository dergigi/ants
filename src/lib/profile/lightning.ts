import type { NDKFilter, NDKSubscription } from '@nostr-dev-kit/ndk';
import { NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import { safeSubscribe } from '@/lib/ndk';
import { relaySets } from '@/lib/relays';

const ZAP_RECEIPT_KIND = 9735;
const NUTZAP_KIND = 9321;

export const LIGHTNING_FLAGS = {
  ZAP: 'zap' as const,
  NUTZAP: 'nutzap' as const
};

export type LightningFlagType = typeof LIGHTNING_FLAGS[keyof typeof LIGHTNING_FLAGS];

type LightningRealness = {
  hasZap: boolean;
  hasNutzap: boolean;
};

type LightningCacheEntry = Partial<LightningRealness> & { updatedAt: number };

const lightningCache = new Map<string, LightningCacheEntry>();
const inFlight = new Map<string, Promise<boolean>>();

const TYPE_TO_FIELD: Record<LightningFlagType, keyof LightningRealness> = {
  zap: 'hasZap',
  nutzap: 'hasNutzap'
};

export function getCachedLightningFlag(pubkey: string | null | undefined, type: LightningFlagType): boolean | undefined {
  if (!pubkey) return undefined;
  const entry = lightningCache.get(pubkey);
  if (!entry) return undefined;
  const field = TYPE_TO_FIELD[type];
  return entry[field];
}

export function getCachedLightningRealness(pubkey: string | null | undefined): LightningRealness | undefined {
  if (!pubkey) return undefined;
  const entry = lightningCache.get(pubkey);
  if (!entry) return undefined;
  return {
    hasZap: entry.hasZap ?? false,
    hasNutzap: entry.hasNutzap ?? false
  };
}

function buildFilters(pubkey: string, type: LightningFlagType): NDKFilter[] {
  if (!pubkey) return [];
  if (type === LIGHTNING_FLAGS.NUTZAP) {
    return [
      {
        kinds: [NUTZAP_KIND],
        limit: 1,
        authors: [pubkey]
      }
    ];
  }
  return [
    {
      kinds: [ZAP_RECEIPT_KIND],
      limit: 1,
      ['#P']: [pubkey]
    }
  ];
}

function updateLightningCache(pubkey: string, type: LightningFlagType, value: boolean): void {
  const field = TYPE_TO_FIELD[type];
  const prev = lightningCache.get(pubkey) || { updatedAt: 0 };
  lightningCache.set(pubkey, {
    ...prev,
    [field]: value,
    updatedAt: Date.now()
  });
}

async function subscribeForLightningFlag(pubkey: string, type: LightningFlagType): Promise<boolean> {
  const cacheKey = `${type}:${pubkey}`;
  const cached = getCachedLightningFlag(pubkey, type);
  if (typeof cached === 'boolean') {
    return cached;
  }
  const existing = inFlight.get(cacheKey);
  if (existing) return existing;

  const promise = new Promise<boolean>((resolve) => {
    let settled = false;
    let subscription: NDKSubscription | null = null;

    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      try {
        subscription?.stop();
      } catch {}
      updateLightningCache(pubkey, type, value);
      resolve(value);
    };

    (async () => {
      try {
        const relaySet = await relaySets.default();
        const filters = buildFilters(pubkey, type);
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
  }).finally(() => {
    inFlight.delete(cacheKey);
  });

  inFlight.set(cacheKey, promise);
  return promise;
}

export function prefetchLightningFlag(pubkey: string | null | undefined, type: LightningFlagType): Promise<boolean> {
  if (!pubkey) return Promise.resolve(false);
  return subscribeForLightningFlag(pubkey, type);
}

export async function prefetchLightningRealness(pubkey: string | null | undefined, options?: { includeZap?: boolean; includeNutzap?: boolean }): Promise<void> {
  if (!pubkey) return;
  const includeZap = options?.includeZap ?? true;
  const includeNutzap = options?.includeNutzap ?? true;
  const tasks: Promise<boolean>[] = [];
  if (includeNutzap && getCachedLightningFlag(pubkey, LIGHTNING_FLAGS.NUTZAP) === undefined) {
    tasks.push(prefetchLightningFlag(pubkey, LIGHTNING_FLAGS.NUTZAP));
  }
  if (includeZap && getCachedLightningFlag(pubkey, LIGHTNING_FLAGS.ZAP) === undefined) {
    tasks.push(prefetchLightningFlag(pubkey, LIGHTNING_FLAGS.ZAP));
  }
  if (tasks.length === 0) return;
  await Promise.allSettled(tasks);
}

export function setLightningFlagForTesting(pubkey: string, type: LightningFlagType, value: boolean): void {
  updateLightningCache(pubkey, type, value);
}


