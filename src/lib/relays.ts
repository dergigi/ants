// Barrel re-export for backward compatibility.
// The relay system is split across:
//   relayConfig.ts    — constants, normalization, isPrivateRelay
//   relayDiscovery.ts — NIP-51 user relay discovery
//   relayInfo.ts      — NIP-11 probing and info cache
//   relaySets.ts      — relay set construction and NIP-50 filtering

export { RELAYS, normalizeRelayUrl, isPrivateRelay, addRelayToSet } from './relayConfig';
export { discoverUserRelays } from './relayDiscovery';
export {
  relayInfoCache,
  getRelayInfo,
  checkNip50Support,
  clearRelayInfoCache,
  clearNip50SupportCache,
  clearNip50Cache,
} from './relayInfo';
export type { RelayInfo } from './relayInfo';
export {
  extendWithUserAndPremium,
  createRelaySet,
  relaySets,
  filterNip50Relays,
  getNip50RelaySet,
  getNip50SearchRelaySet,
  getQuickNip50SearchRelaySet,
} from './relaySets';

import { clearRelayInfoCache } from './relayInfo';
import { clearUserRelayCache } from './relayDiscovery';
import { clearNip66Cache } from './nip66';

export function clearRelayCaches(): void {
  clearRelayInfoCache();
  clearUserRelayCache();
  clearNip66Cache();
}
