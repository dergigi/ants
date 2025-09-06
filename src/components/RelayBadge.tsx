import React from 'react';

interface RelayBadgeProps {
  relayUrl?: string;
  className?: string;
}

export default function RelayBadge({ relayUrl, className = '' }: RelayBadgeProps) {
  if (!relayUrl || relayUrl === 'unknown') {
    return null;
  }

  // Extract a short name from the relay URL
  const getRelayShortName = (url: string): string => {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      
      // Remove common prefixes and suffixes
      const clean = hostname
        .replace(/^relay\./, '')
        .replace(/^nostr\./, '')
        .replace(/^wss?\./, '')
        .replace(/\.com$/, '')
        .replace(/\.net$/, '')
        .replace(/\.org$/, '')
        .replace(/\.io$/, '')
        .replace(/\.space$/, '');
      
      // Take first part if it has multiple parts
      const parts = clean.split('.');
      return parts[0] || hostname;
    } catch {
      // Fallback to original URL if parsing fails
      return url.replace(/^wss?:\/\//, '').split('.')[0] || 'relay';
    }
  };

  const shortName = getRelayShortName(relayUrl);

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors ${className}`}
      title={`From relay: ${relayUrl}`}
    >
      {shortName}
    </span>
  );
}
