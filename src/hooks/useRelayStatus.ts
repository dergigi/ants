'use client';

import { useState, useEffect, useMemo } from 'react';
import { ConnectionStatus, addConnectionStatusListener, removeConnectionStatusListener, getRecentlyActiveRelays } from '@/lib/ndk';
import { getRelayLists } from '@/lib/relayCounts';
import { UI_RECENTLY_ACTIVE_INTERVAL, UI_CONNECTION_DETAILS_INTERVAL } from '@/lib/constants';

/**
 * Tracks NDK connection status, recently active relays, and the
 * expanded/collapsed state of the relay status panel.
 */
export function useRelayStatus(resultsCount: number) {
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionDetails, setConnectionDetails] = useState<ConnectionStatus | null>(null);
  const [showConnectionDetails, setShowConnectionDetails] = useState(false);
  const [recentlyActive, setRecentlyActive] = useState<string[]>([]);

  const relayInfo = useMemo(() => {
    const base = getRelayLists(connectionDetails, recentlyActive);
    return {
      ...base,
      relayPings: connectionDetails?.relayPings ?? new Map<string, number>(),
    };
  }, [connectionDetails, recentlyActive]);

  // Listen for connection status changes
  useEffect(() => {
    const handleConnectionStatusChange = (status: ConnectionStatus) => {
      setConnectionDetails(status);
      // Auto-hide connection details when status changes
      setShowConnectionDetails(false);
      // Refresh recently active relays on changes
      setRecentlyActive(getRecentlyActiveRelays());
    };

    addConnectionStatusListener(handleConnectionStatusChange);

    return () => {
      removeConnectionStatusListener(handleConnectionStatusChange);
    };
  }, []);

  // Periodically refresh recently active relays while panel open (reduced frequency)
  useEffect(() => {
    if (!showConnectionDetails) return;
    setRecentlyActive(getRecentlyActiveRelays());
    const id = setInterval(() => setRecentlyActive(getRecentlyActiveRelays()), UI_CONNECTION_DETAILS_INTERVAL);
    return () => clearInterval(id);
  }, [showConnectionDetails]);

  // Update recently active relays immediately when connection status changes
  useEffect(() => {
    setRecentlyActive(getRecentlyActiveRelays());
  }, [connectionDetails]);

  // Periodically update recently active relays to catch relay activity changes (reduced frequency)
  useEffect(() => {
    const id = setInterval(() => {
      setRecentlyActive(getRecentlyActiveRelays());
    }, UI_RECENTLY_ACTIVE_INTERVAL);
    return () => clearInterval(id);
  }, []);

  // Update recently active relays when results change (events received)
  useEffect(() => {
    if (resultsCount > 0) {
      setRecentlyActive(getRecentlyActiveRelays());
    }
  }, [resultsCount]);

  return {
    isConnecting,
    setIsConnecting,
    connectionDetails,
    setConnectionDetails,
    showConnectionDetails,
    setShowConnectionDetails,
    relayInfo
  };
}
