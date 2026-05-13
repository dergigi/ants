export { relayInfoCache, clearRelayInfoCache } from './cache';
export { RELAYS } from './config';
export { createRelaySet } from './factory';
export { filterNip50Relays, getNip50RelaySet, getNip50SearchRelaySet } from './nip50';
export { checkNip50Support, getRelayInfo, normalizeRelayUrlInternal } from './relayInfo';
export { relaySets } from './relaySets';
export { clearUserRelayCache, discoverUserRelays, extendWithUserAndPremium } from './userRelays';

import { clearRelayInfoCache } from './cache';
import { clearUserRelayCache } from './userRelays';

export function clearRelayCaches(): void {
  clearRelayInfoCache();
  clearUserRelayCache();
}

export const clearNip50SupportCache = clearRelayInfoCache;
export const clearNip50Cache = clearRelayInfoCache;
