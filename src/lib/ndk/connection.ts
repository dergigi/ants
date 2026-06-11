import { RELAYS } from '../relays/config';
import { RELAY_MONITORING_INTERVAL, RELAY_PING_TIMEOUT } from '../constants';
import { ndk } from './index';
import { ensureCacheInitialized } from './cache';
import { safeSubscribe } from './subscribe';

export interface ConnectionStatus {
  success: boolean;
  connectedRelays: string[];
  connectingRelays: string[];
  failedRelays: string[];
  timeout: boolean;
  relayPings?: Map<string, number>; // Relay URL -> ping time in ms
}

// ndk.connect() only resolves once ALL relays respond, so a single dead relay
// stalls it until the timeout. We start it once (fire-and-forget) and instead
// wait for the first relay to come up before letting searches proceed.
let ndkConnectStarted = false;
const startNdkConnect = (): void => {
  if (ndkConnectStarted) return;
  ndkConnectStarted = true;
  ndk.connect().catch((error) => {
    console.warn('NDK connect error (continuing with available relays):', error);
  });
};

const hasConnectedRelay = (): boolean => {
  const relays = ndk.pool?.relays;
  if (!relays) return false;
  return Array.from(relays.values()).some((relay) => relay.status === 1);
};

// Resolves true as soon as at least one relay is connected, false on timeout.
// Detection is poll-based on purpose: adding/removing pool listeners can
// corrupt tseep's baked listener collection when done mid-emit.
const waitForFirstRelayConnection = (timeoutMs: number): Promise<boolean> => {
  if (hasConnectedRelay()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const started = Date.now();
    const poll = setInterval(() => {
      const connected = hasConnectedRelay();
      if (connected || Date.now() - started >= timeoutMs) {
        clearInterval(poll);
        resolve(connected);
      }
    }, 50);
  });
};

// Global connection status for dynamic updates
let globalConnectionStatus: ConnectionStatus | null = null;
let connectionStatusListeners: ((status: ConnectionStatus) => void)[] = [];

export const addConnectionStatusListener = (listener: (status: ConnectionStatus) => void) => {
  connectionStatusListeners.push(listener);
  // Immediately call with current status if available
  if (globalConnectionStatus) {
    listener(globalConnectionStatus);
  }
};

export const removeConnectionStatusListener = (listener: (status: ConnectionStatus) => void) => {
  connectionStatusListeners = connectionStatusListeners.filter(l => l !== listener);
};

const updateConnectionStatus = (status: ConnectionStatus) => {
  globalConnectionStatus = status;
  connectionStatusListeners.forEach(listener => listener(status));
};

// Helper function to finalize connection result
const finalizeConnectionResult = (connectedRelays: string[], connectingRelays: string[], failedRelays: string[], timeout: boolean, relayPings?: Map<string, number>): ConnectionStatus => {
  const result: ConnectionStatus = {
    success: connectedRelays.length > 0,
    connectedRelays,
    connectingRelays,
    failedRelays,
    timeout
  };
  if (relayPings) {
    result.relayPings = relayPings;
  }
  updateConnectionStatus(result);
  startRelayMonitoring();
  return result;
};

// Reusable connection function with timeout: returns as soon as one relay is up
export const connectWithTimeout = async (timeoutMs: number = 5000): Promise<void> => {
  // Always initialize cache before attempting to connect or racing with timeout
  await ensureCacheInitialized();
  startNdkConnect();
  await waitForFirstRelayConnection(timeoutMs);
};

// Track recent relay activity (last event timestamp per relay)
const recentRelayActivity: Map<string, number> = new Map();

// Track relay ping times
const relayPings: Map<string, number> = new Map();

// Public helper to record relay activity when an event is received
export function markRelayActivity(relayUrl: string): void {
  if (!relayUrl) return;
  recentRelayActivity.set(relayUrl, Date.now());
}

// Measure ping time for a specific relay
async function measureRelayPing(relayUrl: string): Promise<number> {
  try {
    const relay = ndk.pool?.relays?.get(relayUrl);
    if (!relay || relay.status !== 1) {
      return -1; // Not connected
    }

    const startTime = performance.now();

    // Send a simple REQ message and wait for EOSE
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(-1); // Timeout
      }, RELAY_PING_TIMEOUT);

      // Scope to the measured relay only; a pool-wide sub would EOSE on the
      // fastest relay and leave late relays executing an emptied subscription
      // (NDK's "BUG: No filters to merge!").
      const sub = safeSubscribe([{ kinds: [1], limit: 1 }], {
        closeOnEose: true,
        cacheUsage: 'ONLY_RELAY' as const,
        relayUrls: [relayUrl]
      });

      if (sub) {
        sub.on('eose', () => {
          clearTimeout(timeout);
          const pingTime = Math.round(performance.now() - startTime);
          relayPings.set(relayUrl, pingTime);
          resolve(pingTime);
        });

        sub.on('closed', () => {
          clearTimeout(timeout);
          resolve(-1);
        });

        // Start the subscription
        sub.start();
      } else {
        clearTimeout(timeout);
        resolve(-1);
      }
    });
  } catch {
    return -1;
  }
}

// Measure ping times for all connected relays
async function measureAllRelayPings(): Promise<Map<string, number>> {
  const connectedRelays = Array.from(ndk.pool?.relays?.keys() || [])
    .filter(url => ndk.pool?.relays?.get(url)?.status === 1);

  const pingPromises = connectedRelays.map(async (url) => {
    const ping = await measureRelayPing(url);
    return { url, ping };
  });

  const results = await Promise.all(pingPromises);
  const pingMap = new Map<string, number>();

  results.forEach(({ url, ping }) => {
    if (ping > 0) {
      pingMap.set(url, ping);
    }
  });

  return pingMap;
}

const ACTIVITY_WINDOW_MS = 15 * 60 * 1000; // consider relays active if they delivered events in the last 15min

// Public helper to get recently active relay urls
export function getRecentlyActiveRelays(windowMs: number = ACTIVITY_WINDOW_MS): string[] {
  const now = Date.now();
  const urls: string[] = [];
  for (const [url, ts] of recentRelayActivity.entries()) {
    if (now - ts <= windowMs) urls.push(url);
  }
  // Sort for stable UI (by hostname)
  return urls.sort((a, b) => a.localeCompare(b));
}

// Synchronous pool inspection, no network round-trips
const getRelayStatusSnapshot = (): ConnectionStatus => {
  const connectedRelays: string[] = [];
  const connectingRelays: string[] = [];
  const failedRelays: string[] = [];

  // Build a comprehensive set of relay URLs: pool-known + configured sets
  const allRelayUrls = new Set<string>([
    ...(ndk.pool?.relays ? Array.from(ndk.pool.relays.keys()) : []),
    ...RELAYS.DEFAULT,
    ...RELAYS.SEARCH,
    ...RELAYS.PROFILE_SEARCH,
    ...RELAYS.VERTEX_DVM
  ]);

  for (const url of allRelayUrls) {
    try {
      const relay = ndk.pool?.relays?.get(url);
      // If no relay object exists in pool, it's not connected
      if (!relay) {
        failedRelays.push(url);
        continue;
      }
      // Use only NDK's status values
      if (relay.status === 1) {
        connectedRelays.push(url);
      } else if (relay.status === 2) {
        failedRelays.push(url);
      } else if (relay.status === 0 || relay.status === 3) {
        // 0 = connecting, 3 = reconnecting
        connectingRelays.push(url);
      }
    } catch {
      failedRelays.push(url);
    }
  }

  return {
    success: connectedRelays.length > 0,
    connectedRelays,
    connectingRelays,
    failedRelays,
    timeout: false
  };
};

const checkRelayStatus = async (): Promise<ConnectionStatus> => {
  const status = getRelayStatusSnapshot();
  const relayPings = status.connectedRelays.length > 0 ? await measureAllRelayPings() : new Map<string, number>();
  return { ...status, relayPings };
};

// Start background relay monitoring
let relayMonitorInterval: NodeJS.Timeout | null = null;

export const startRelayMonitoring = () => {
  if (relayMonitorInterval) return; // Already monitoring

  relayMonitorInterval = setInterval(async () => {
    try {
      const currentStatus = await checkRelayStatus();
      if (globalConnectionStatus) {
        // Only update if status changed
        const statusChanged =
          currentStatus.connectedRelays.length !== globalConnectionStatus.connectedRelays.length ||
          currentStatus.connectingRelays.length !== globalConnectionStatus.connectingRelays.length ||
          currentStatus.failedRelays.length !== globalConnectionStatus.failedRelays.length ||
          currentStatus.connectedRelays.some(url => !globalConnectionStatus!.connectedRelays.includes(url)) ||
          currentStatus.connectingRelays.some(url => !globalConnectionStatus!.connectingRelays.includes(url)) ||
          currentStatus.failedRelays.some(url => !globalConnectionStatus!.failedRelays.includes(url));

        if (statusChanged) {
          updateConnectionStatus(currentStatus);
        }
      }
    } catch (error) {
      console.warn('Relay monitoring error:', error);
    }
  }, RELAY_MONITORING_INTERVAL);
};

export const connect = async (timeoutMs: number = 8000): Promise<ConnectionStatus> => {
  // Ensure cache is initialized even if the connection times out
  await ensureCacheInitialized();
  startNdkConnect();

  // Return as soon as the first relay is up; remaining relays keep connecting
  // in the background and surface via the monitoring interval.
  const connected = await waitForFirstRelayConnection(timeoutMs);
  const status = getRelayStatusSnapshot();

  // Measure pings in the background so they don't delay the first search
  if (status.connectedRelays.length > 0) {
    void measureAllRelayPings().then((pings) => {
      if (globalConnectionStatus) {
        updateConnectionStatus({ ...globalConnectionStatus, relayPings: pings });
      }
    }).catch(() => {});
  }

  return finalizeConnectionResult(status.connectedRelays, status.connectingRelays, status.failedRelays, !connected);
};

// Kick off the relay connection as early as possible (at module load in the
// browser) so relays are usually up by the time the first search runs.
// Opening websockets doesn't touch the cache adapter, so run both in
// parallel instead of serializing the WASM SQLite init before connecting.
// Deferred by a microtask: this module is part of an import cycle with
// ndk/index, so `ndk` isn't initialized until the module graph finishes.
if (typeof window !== 'undefined') {
  queueMicrotask(() => {
    void ensureCacheInitialized().catch(() => {});
    startNdkConnect();
  });
}
