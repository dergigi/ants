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

// Helper function to create timeout promise
const createTimeoutPromise = (timeoutMs: number): Promise<never> => {
  return new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Connection timeout')), timeoutMs);
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

// Reusable connection function with timeout
export const connectWithTimeout = async (timeoutMs: number = 5000): Promise<void> => {
  // Always initialize cache before attempting to connect or racing with timeout
  await ensureCacheInitialized();
  try {
    await Promise.race([
      ndk.connect(),
      createTimeoutPromise(timeoutMs)
    ]);
  } catch (error) {
    console.warn('NDK connection failed, but continuing with available relays:', error);
    // Don't throw - let the search continue with whatever relays are available
  }
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

      const sub = safeSubscribe([{ kinds: [1], limit: 1 }], {
        closeOnEose: true,
        cacheUsage: 'ONLY_RELAY' as const
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

const checkRelayStatus = async (): Promise<ConnectionStatus> => {
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

  // Measure ping times for connected relays
  const relayPings = connectedRelays.length > 0 ? await measureAllRelayPings() : new Map();

  return {
    success: connectedRelays.length > 0,
    connectedRelays,
    connectingRelays,
    failedRelays,
    timeout: false,
    relayPings
  };
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
  let timeout = false;

  try {
    // Ensure cache is initialized even if the connection times out
    await ensureCacheInitialized();
    // Race between connection and timeout
    await Promise.race([
      ndk.connect(),
      createTimeoutPromise(timeoutMs)
    ]);

    // Give relays a moment to establish connections after ndk.connect() returns
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check which relays actually connected
    const status = await checkRelayStatus();
    // Do not change the example on connect; keep current selection

    return finalizeConnectionResult(status.connectedRelays, status.connectingRelays, status.failedRelays, false, status.relayPings);
  } catch (error) {
    console.warn('NDK connection failed or timed out:', error);
    timeout = true;

    // Check which relays we can still access
    const status = await checkRelayStatus();
    // Do not change the example on failed connect either

    return finalizeConnectionResult(status.connectedRelays, status.connectingRelays, status.failedRelays, timeout, status.relayPings);
  }
};
