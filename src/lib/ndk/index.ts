import NDK from '@nostr-dev-kit/ndk';
import { getFilteredExamples } from '../examples';
import { isLoggedIn } from '../nip07';
import { RELAYS } from '../relays/config';
import { cacheAdapter } from './cache';

export const ndk = new NDK({
  explicitRelayUrls: [...RELAYS.DEFAULT],
  cacheAdapter,
  clientName: 'Ants'
});

// Store the selected example
let currentSearchExample: string;

export const nextExample = (): string => {
  const filteredExamples = getFilteredExamples(isLoggedIn());
  // Avoid rotating to '/examples' if already set as the initial item
  const rotationPool = filteredExamples.filter((ex) => ex !== '/examples');
  currentSearchExample = rotationPool[Math.floor(Math.random() * rotationPool.length)] || '/examples';
  return currentSearchExample;
};

export { ensureCacheInitialized } from './cache';
export {
  type ConnectionStatus,
  connect,
  connectWithTimeout,
  addConnectionStatusListener,
  removeConnectionStatusListener,
  markRelayActivity,
  getRecentlyActiveRelays,
  startRelayMonitoring
} from './connection';
export {
  getLastReducedFilters,
  resetLastReducedFilters,
  isValidFilter,
  safeSubscribe,
  safePublish
} from './subscribe';
