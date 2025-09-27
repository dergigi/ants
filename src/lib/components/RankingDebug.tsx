import { useEffect, useState } from 'react';
import type { NDKEvent } from '@nostr-dev-kit/ndk';
import { prefetchLightningRealness, getCachedLightningRealness } from '@/lib/profile';

type Props = {
  event: NDKEvent;
};

type DebugState = {
  hasZap: boolean;
  hasNutzap: boolean;
};

const defaultState: DebugState = { hasZap: false, hasNutzap: false };

export default function RankingDebug({ event }: Props): JSX.Element | null {
  const [state, setState] = useState<DebugState>(() => {
    const pk = event.pubkey || event.author?.pubkey;
    const realness = getCachedLightningRealness(pk);
    return realness ? { hasZap: realness.hasZap, hasNutzap: realness.hasNutzap } : defaultState;
  });

  useEffect(() => {
    const pk = event.pubkey || event.author?.pubkey;
    if (!pk) return;
    let mounted = true;
    (async () => {
      await prefetchLightningRealness(pk);
      if (!mounted) return;
      const realness = getCachedLightningRealness(pk);
      if (realness) {
        setState({ hasZap: realness.hasZap, hasNutzap: realness.hasNutzap });
      } else {
        setState(defaultState);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [event]);

  const { hasZap, hasNutzap } = state;

  return (
    <div className="text-xs text-gray-400">
      <div>Zap sender: {hasZap ? 'yes' : 'no'}</div>
      <div>Nutzap sender: {hasNutzap ? 'yes' : 'no'}</div>
    </div>
  );
}

