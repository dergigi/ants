import NDK, { NDKEvent, NDKFilter, NDKRelaySet, NDKSubscription } from '@nostr-dev-kit/ndk';
import NDKCacheAdapterSqliteWasm from '@nostr-dev-kit/ndk-cache-sqlite-wasm';
import { getFilteredExamples } from './examples';
import { RELAYS } from './relays';
import { isLoggedIn } from './nip07';

// SQLite (WASM) cache adapter — initialized lazily and only on the client
const cacheAdapter = new NDKCacheAdapterSqliteWasm({ dbName: 'ants-ndk-cache' });
let cacheInitialized = false;

export async function ensureCacheInitialized(): Promise<void> {
  if (cacheInitialized) return;
  // Avoid initializing in SSR environments
  if (typeof window === 'undefined') { cacheInitialized = true; return; }
  try {
    // ndk-cache-sqlite-wasm v0.5.x exposes initializeAsync()
    await cacheAdapter.initializeAsync();
  } catch (error) {
    console.warn('Failed to initialize sqlite-wasm cache adapter, disabling cache and continuing:', error);
    try {
      // Disable cache usage to avoid "Database not initialized" paths
      ndk.cacheAdapter = undefined;
    } catch {}
  } finally {
    cacheInitialized = true;
  }
}

export const ndk = new NDK({
  explicitRelayUrls: [...RELAYS.DEFAULT],
  cacheAdapter,
  clientName: 'Ants'
});

// Store the selected example
let currentSearchExample: string;

export const getCurrentExample = () => {
  // If no example is set yet, get one now
  if (!currentSearchExample) {
    return nextExample();
  }
  return currentSearchExample;
};

export const nextExample = (): string => {
  const filteredExamples = getFilteredExamples(isLoggedIn());
  currentSearchExample = filteredExamples[Math.floor(Math.random() * filteredExamples.length)];
  return currentSearchExample;
};

// Helper function to create timeout promise
const createTimeoutPromise = (timeoutMs: number): Promise<never> => {
  return new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Connection timeout')), timeoutMs);
  });
};

// Helper function to create connection status
const createConnectionStatus = (connectedRelays: string[], connectingRelays: string[], failedRelays: string[], timeout: boolean = false): ConnectionStatus => {
  return {
    success: connectedRelays.length > 0,
    connectedRelays,
    connectingRelays,
    failedRelays,
    timeout
  };
};

// Helper function to finalize connection result
const finalizeConnectionResult = (connectedRelays: string[], connectingRelays: string[], failedRelays: string[], timeout: boolean): ConnectionStatus => {
  const result = createConnectionStatus(connectedRelays, connectingRelays, failedRelays, timeout);
  updateConnectionStatus(result);
  startRelayMonitoring();
  return result;
};

// Reusable connection function with timeout
export const connectWithTimeout = async (timeoutMs: number = 3000): Promise<void> => {
  // Always initialize cache before attempting to connect or racing with timeout
  await ensureCacheInitialized();
  await Promise.race([
    ndk.connect(),
    createTimeoutPromise(timeoutMs)
  ]);
};

export interface ConnectionStatus {
  success: boolean;
  connectedRelays: string[];
  connectingRelays: string[];
  failedRelays: string[];
  timeout: boolean;
}

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

// Track recent relay activity (last event timestamp per relay)
const recentRelayActivity: Map<string, number> = new Map();

// Public helper to record relay activity when an event is received
export function markRelayActivity(relayUrl: string): void {
  if (!relayUrl) return;
  recentRelayActivity.set(relayUrl, Date.now());
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

const checkRelayStatus = (): ConnectionStatus => {
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

// Start background relay monitoring
let relayMonitorInterval: NodeJS.Timeout | null = null;

export const startRelayMonitoring = () => {
  if (relayMonitorInterval) return; // Already monitoring
  
  relayMonitorInterval = setInterval(() => {
    const currentStatus = checkRelayStatus();
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
        console.log('Relay status changed:', { 
          connected: currentStatus.connectedRelays, 
          connecting: currentStatus.connectingRelays,
          failed: currentStatus.failedRelays 
        });
        updateConnectionStatus(currentStatus);
      }
    }
  }, 10000); // Check every 10 seconds
};

export const stopRelayMonitoring = () => {
  if (relayMonitorInterval) {
    clearInterval(relayMonitorInterval);
    relayMonitorInterval = null;
  }
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
    const status = checkRelayStatus();
    nextExample(); // Select a random example when we connect
    console.log('Connected to relays:', { connected: status.connectedRelays, connecting: status.connectingRelays, failed: status.failedRelays, example: currentSearchExample });
    
    return finalizeConnectionResult(status.connectedRelays, status.connectingRelays, status.failedRelays, false);
  } catch (error) {
    console.warn('NDK connection failed or timed out:', error);
    timeout = true;
    
    // Check which relays we can still access
    const status = checkRelayStatus();
    nextExample(); // Still select an example even if connection failed
    console.log('Using fallback example:', currentSearchExample);
    
    return finalizeConnectionResult(status.connectedRelays, status.connectingRelays, status.failedRelays, timeout);
  }
};

/**
 * Validate NDK filter to prevent empty filter errors
 * @param filter - The filter to validate
 * @returns true if filter is valid, false otherwise
 */
export const isValidFilter = (filter: NDKFilter): boolean => {
  if (!filter || typeof filter !== 'object') {
    return false;
  }
  
  // Check if filter has at least one meaningful property
  const meaningfulKeys = ['kinds', 'authors', 'ids', 'search', '#t', '#e', '#p', 'since', 'until', 'limit'];
  return meaningfulKeys.some(key => {
    const value = (filter as Record<string, unknown>)[key];
    if (value === undefined || value === null) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'number') return value > 0;
    return true;
  });
};

/**
 * Safely subscribe with NDK with proper filter validation
 * @param filters - Array of filters to validate and subscribe with
 * @param options - Subscription options
 * @returns NDK subscription or null if filters are invalid
 */
export const safeSubscribe = (filters: NDKFilter[], options: Record<string, unknown> = {}): NDKSubscription | null => {
  // Validate all filters
  const validFilters = filters.filter(isValidFilter);
  
  if (validFilters.length === 0) {
    console.warn('No valid filters provided to safeSubscribe, skipping subscription');
    return null;
  }
  
  if (validFilters.length !== filters.length) {
    console.warn(`Filtered out ${filters.length - validFilters.length} invalid filters`);
  }
  
  try {
    return ndk.subscribe(validFilters, options);
  } catch (error) {
    console.error('Failed to create NDK subscription:', error);
    return null;
  }
};

/**
 * Safely publish an NDK event with proper error handling
 * 
 * This utility function catches common NDK publishing errors like:
 * - "Not enough relays received the event (0 published, 1 required)"
 * - Relay connection issues
 * - Other publish failures
 * 
 * @param event - The NDK event to publish
 * @param relaySet - Optional relay set to use for publishing
 * @returns Promise that resolves to true if published successfully, false otherwise
 * 
 * @example
 * ```typescript
 * const success = await safePublish(myEvent);
 * if (success) {
 *   console.log('Event published successfully');
 * } else {
 *   console.log('Event publish failed, but app continues');
 * }
 * ```
 */
export const safePublish = async (event: NDKEvent, relaySet?: NDKRelaySet): Promise<boolean> => {
  try {
    if (relaySet) {
      await event.publish(relaySet);
    } else {
      await event.publish();
    }
    return true;
  } catch (error) {
    console.warn('Failed to publish event:', error);
    
    // Log specific error types for debugging
    if (error instanceof Error) {
      if (error.message.includes('Not enough relays received the event')) {
        console.warn('Publish failed: No relays available or responding');
      } else if (error.message.includes('relay')) {
        console.warn('Publish failed: Relay connection issue');
      }
    }
    
    return false;
  }
}; 