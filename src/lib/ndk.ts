import NDK from '@nostr-dev-kit/ndk';
import NDKCacheAdapterDexie from '@nostr-dev-kit/ndk-cache-dexie';
import { searchExamples } from './examples';
import { RELAYS } from './relays';

const cacheAdapter = new NDKCacheAdapterDexie({ dbName: 'ants' });

export const ndk = new NDK({
  explicitRelayUrls: [...RELAYS.DEFAULT],
  cacheAdapter,
  clientName: 'Ants'
});

// Store the selected example
let currentSearchExample: string;

export const getCurrentExample = () => currentSearchExample;

export const nextExample = (): string => {
  currentSearchExample = searchExamples[Math.floor(Math.random() * searchExamples.length)];
  return currentSearchExample;
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

const checkRelayStatus = (): ConnectionStatus => {
  const connectedRelays: string[] = [];
  const failedRelays: string[] = [];
  
  const relayUrls = [...RELAYS.DEFAULT];
  for (const url of relayUrls) {
    try {
      const relay = ndk.pool?.relays?.get(url);
      if (relay && relay.status === 1) { // 1 = connected
        connectedRelays.push(url);
      } else {
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
  const connectedRelays: string[] = [];
  const failedRelays: string[] = [];
  let timeout = false;

  try {
    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout')), timeoutMs);
    });

    // Race between connection and timeout
    await Promise.race([
      ndk.connect(),
      timeoutPromise
    ]);

    // Check which relays actually connected
    const status = checkRelayStatus();
    connectedRelays.push(...status.connectedRelays);
    failedRelays.push(...status.failedRelays);

    // Select a random example when we connect
    currentSearchExample = searchExamples[Math.floor(Math.random() * searchExamples.length)];
    console.log('Connected to relays:', { connected: connectedRelays, failed: failedRelays, example: currentSearchExample });
    
    const result = {
      success: connectedRelays.length > 0,
      connectedRelays,
      failedRelays,
      timeout: false
    };
    
    updateConnectionStatus(result);
    startRelayMonitoring(); // Start monitoring for status changes
    
    return result;
  } catch (error) {
    console.warn('NDK connection failed or timed out:', error);
    timeout = true;
    
    // Check which relays we can still access
    const status = checkRelayStatus();
    connectedRelays.push(...status.connectedRelays);
    failedRelays.push(...status.failedRelays);

    // Still select an example even if connection failed
    currentSearchExample = searchExamples[Math.floor(Math.random() * searchExamples.length)];
    console.log('Using fallback example:', currentSearchExample);
    
    const result = {
      success: connectedRelays.length > 0,
      connectedRelays,
      failedRelays,
      timeout
    };
    
    updateConnectionStatus(result);
    startRelayMonitoring(); // Start monitoring for status changes
    
    return result;
  }
}; 