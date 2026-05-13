export interface RelayInfo {
  supportedNips?: number[];
  name?: string;
  description?: string;
  contact?: string;
  software?: string;
  version?: string;
}

export interface CachedRelayInfo extends RelayInfo {
  timestamp: number;
}

export interface UserRelayDiscovery {
  userRelays: string[];
  blockedRelays: string[];
  searchRelays: string[];
}
