import NDK from '@nostr-dev-kit/ndk';
import NDKCacheAdapterDexie from '@nostr-dev-kit/ndk-cache-dexie';
import { searchExamples, getFilteredExamples } from './examples';
import { RELAYS } from './relays';
import { isLoggedIn } from './nip07';

const cacheAdapter = new NDKCacheAdapterDexie({ dbName: 'ants' });

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
const createConnectionStatus = (connectedRelays: string[], failedRelays: string[], timeout: boolean = false): ConnectionStatus => {
  return {
    success: connectedRelays.length > 0,
    connectedRelays,
    failedRelays,
    timeout
  };
};

// Helper function to finalize connection result
const finalizeConnectionResult = (connectedRelays: string[], failedRelays: string[], timeout: boolean): ConnectionStatus => {
  const result = createConnectionStatus(connectedRelays, failedRelays, timeout);
  updateConnectionStatus(result);
  startRelayMonitoring();
  return result;
};

// Reusable connection function with timeout
export const connectWithTimeout = async (timeoutMs: number = 3000): Promise<void> => {
  await Promise.race([
    ndk.connect(),
    createTimeoutPromise(timeoutMs)
  ]);
};

export interface ConnectionStatus {
  success: boolean;
  connectedRelays: string[];
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

const ACTIVITY_WINDOW_MS = 60_000; // consider relays active if they delivered events in the last 60s

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
  const failedRelays: string[] = [];
  
  // Check all relays that NDK currently knows about (pool relays)
  const allRelayUrls = ndk.pool?.relays ? Array.from(ndk.pool.relays.keys()) : [];

  for (const url of allRelayUrls) {
    try {
      const relay = ndk.pool?.relays?.get(url);
      if (relay) {
        // 0 = connecting, 1 = connected, 2 = disconnected, 3 = reconnecting
        if (relay.status === 1) {
          connectedRelays.push(url);
        } else if (relay.status === 2) {
          failedRelays.push(url);
        }
        // For 0/3 we neither add to failed nor connected
      } else {
        // Relay not found in pool: mark as failed
        failedRelays.push(url);
      }
    } catch {
      failedRelays.push(url);
    }
  }
  
  return {
    success: connectedRelays.length > 0,
    connectedRelays,
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
        currentStatus.failedRelays.length !== globalConnectionStatus.failedRelays.length ||
        currentStatus.connectedRelays.some(url => !globalConnectionStatus!.connectedRelays.includes(url)) ||
        currentStatus.failedRelays.some(url => !globalConnectionStatus!.failedRelays.includes(url));
      
      if (statusChanged) {
        console.log('Relay status changed:', { 
          connected: currentStatus.connectedRelays, 
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

export const connect = async (timeoutMs: number = 5000): Promise<ConnectionStatus> => {
  let timeout = false;

  try {
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
    console.log('Connected to relays:', { connected: status.connectedRelays, failed: status.failedRelays, example: currentSearchExample });
    
    return finalizeConnectionResult(status.connectedRelays, status.failedRelays, false);
  } catch (error) {
    console.warn('NDK connection failed or timed out:', error);
    timeout = true;
    
    // Check which relays we can still access
    const status = checkRelayStatus();
    nextExample(); // Still select an example even if connection failed
    console.log('Using fallback example:', currentSearchExample);
    
    return finalizeConnectionResult(status.connectedRelays, status.failedRelays, timeout);
  }
}; 