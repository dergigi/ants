import NDK, { NDKEvent, NDKFilter, NDKRelaySet, NDKSubscription, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import NDKCacheAdapterSqliteWasm from '@nostr-dev-kit/ndk-cache-sqlite-wasm';
import { getFilteredExamples } from './examples';
import { RELAYS } from './relays';
import { isLoggedIn } from './nip07';
import { isBrowser } from './utils/ssr';

// SQLite (WASM) cache adapter — initialized lazily and only on the client
const cacheAdapter = new NDKCacheAdapterSqliteWasm({ 
  dbName: 'ants-ndk-cache', 
  wasmUrl: '/ndk/sql-wasm.wasm'
});
let cacheInitialized = false;
let cacheDisabledDueToError = false;
let cacheErrorHandlersInstalled = false;

function isUndefinedBindWasmError(error: unknown): boolean {
  try {
    const message = (error instanceof Error ? error.message : String(error || '')) || '';
    const lower = message.toLowerCase();
    // Heuristic match for sqlite wasm binding undefined issue
    return (
      lower.includes('wrong api use') && lower.includes('unknown type') && lower.includes('undefined')
    ) || lower.includes('tried to bind a value of an unknown type') || lower.includes('wasm cache adapter')
    || lower.includes('sqlite') && lower.includes('undefined') || lower.includes('binding') && lower.includes('undefined');
  } catch {
    return false;
  }
}

function disableCacheAdapter(reason?: unknown): void {
  if (cacheDisabledDueToError) return;
  try {
    console.warn('Disabling NDK sqlite-wasm cache adapter due to runtime error; falling back to live relays only.', reason);
    ndk.cacheAdapter = undefined;
  } catch {}
  cacheDisabledDueToError = true;
}

/**
 * Wrapper function to safely execute NDK operations with WASM error handling
 * If a WASM cache error occurs, it will disable the cache and retry with live data
 * @param operation - Function that performs NDK operations
 * @param fallbackValue - Value to return if operation fails after cache is disabled
 * @returns Promise that resolves to the operation result or fallback value
 */
export async function safeExecuteWithCacheFallback<T>(
  operation: () => T | Promise<T>,
  fallbackValue: T
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isUndefinedBindWasmError(error)) {
      console.warn('WASM cache error detected, disabling cache and falling back to live data');
      disableCacheAdapter(error);
      try {
        // Retry the operation with cache disabled
        return await operation();
      } catch (retryError) {
        console.error('Operation failed even after disabling cache:', retryError);
        return fallbackValue;
      }
    }
    // For non-WASM errors, just return the fallback
    console.error('Operation failed with non-WASM error:', error);
    return fallbackValue;
  }
}

function isNoFiltersToMergeError(error: unknown): boolean {
  try {
    const message = (error instanceof Error ? error.message : String(error || '')) || '';
    return message.toLowerCase().includes('no filters to merge');
  } catch {
    return false;
  }
}

export async function ensureCacheInitialized(): Promise<void> {
  if (cacheInitialized) return;
  // Avoid initializing in SSR environments
  if (!isBrowser()) { cacheInitialized = true; return; }
  
  // Install global error handlers first to catch any initialization errors
  if (!cacheErrorHandlersInstalled && typeof window !== 'undefined') {
    try {
      const handleAnyError = (err: unknown) => {
        const reason = err && (err as { reason?: unknown; error?: unknown }).reason;
        const payload = (reason as unknown) || err;
        if (isUndefinedBindWasmError(payload)) {
          console.warn('Caught WASM cache binding error, disabling cache:', payload);
          disableCacheAdapter(payload);
        }
      };
      window.addEventListener('error', (ev) => handleAnyError(ev.error || ev.message));
      window.addEventListener('unhandledrejection', (ev) => handleAnyError((ev as PromiseRejectionEvent).reason));
      cacheErrorHandlersInstalled = true;
    } catch {}
  }
  
  try {
    // ndk-cache-sqlite-wasm v0.5.x exposes initializeAsync()
    await cacheAdapter.initializeAsync();
  } catch (error) {
    console.warn('Failed to initialize sqlite-wasm cache adapter, disabling cache and continuing:', error);
    // If it's a WASM binding error, disable the cache immediately
    if (isUndefinedBindWasmError(error)) {
      disableCacheAdapter(error);
    } else {
      // For other errors, still disable cache to avoid issues
      try {
        ndk.cacheAdapter = undefined;
      } catch {}
    }
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
  // Always prioritize '/examples' as the initial example
  if (!currentSearchExample) {
    currentSearchExample = '/examples';
    return currentSearchExample;
  }
  return currentSearchExample;
};

export const nextExample = (): string => {
  const filteredExamples = getFilteredExamples(isLoggedIn());
  // Avoid rotating to '/examples' if already set as the initial item
  const rotationPool = filteredExamples.filter((ex) => ex !== '/examples');
  currentSearchExample = rotationPool[Math.floor(Math.random() * rotationPool.length)] || '/examples';
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
const finalizeConnectionResult = (connectedRelays: string[], connectingRelays: string[], failedRelays: string[], timeout: boolean, relayPings?: Map<string, number>): ConnectionStatus => {
  const result = createConnectionStatus(connectedRelays, connectingRelays, failedRelays, timeout);
  if (relayPings) {
    result.relayPings = relayPings;
  }
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
  relayPings?: Map<string, number>; // Relay URL -> ping time in ms
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
      }, 5000); // 5 second timeout

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
    const status = await checkRelayStatus();
    // Do not change the example on connect; keep current selection
    console.log('Connected to relays:', { connected: status.connectedRelays, connecting: status.connectingRelays, failed: status.failedRelays, example: currentSearchExample });
    
    return finalizeConnectionResult(status.connectedRelays, status.connectingRelays, status.failedRelays, false, status.relayPings);
  } catch (error) {
    console.warn('NDK connection failed or timed out:', error);
    timeout = true;
    
    // Check which relays we can still access
    const status = await checkRelayStatus();
    // Do not change the example on failed connect either
    console.log('Using fallback example:', currentSearchExample);
    
    return finalizeConnectionResult(status.connectedRelays, status.connectingRelays, status.failedRelays, timeout, status.relayPings);
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
 * Safely subscribe with NDK with proper filter validation and WASM error handling
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
    // If the sqlite-wasm cache throws the binding error, disable cache and retry once live-only
    if (isUndefinedBindWasmError(error)) {
      console.warn('WASM cache binding error detected, disabling cache and retrying with live data only');
      disableCacheAdapter(error);
      try {
        // Force cache usage to ONLY_RELAY to bypass cache completely
        const liveOptions = { ...options, cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY };
        return ndk.subscribe(validFilters, liveOptions);
      } catch (e2) {
        console.error('Failed to create NDK subscription after disabling cache:', e2);
        return null;
      }
    } else if (isNoFiltersToMergeError(error)) {
      // Gracefully ignore and return null subscription
      console.warn('Ignoring subscription with no effective filters');
      return null;
    }
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