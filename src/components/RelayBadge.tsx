import React from 'react';

interface RelayBadgeProps {
  relayUrl?: string;
  relayUrls?: string[];
  className?: string;
}

export default function RelayBadge({ relayUrl, relayUrls, className = '' }: RelayBadgeProps) {
  // Use relayUrls if available, otherwise fall back to relayUrl
  const urls = relayUrls || (relayUrl ? [relayUrl] : []);
  const validUrls = urls.filter(url => url && url !== 'unknown');
  
  if (validUrls.length === 0) {
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

  const primaryUrl = validUrls[0];
  const shortName = getRelayShortName(primaryUrl);
  const relayCount = validUrls.length;
  
  // Create tooltip showing all relays
  const tooltip = relayCount === 1 
    ? `From relay: ${primaryUrl}`
    : `From ${relayCount} relays:\n${validUrls.map(url => `• ${url}`).join('\n')}`;

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors ${className}`}
      title={tooltip}
    >
      {shortName}{relayCount > 1 && ` (+${relayCount - 1})`}
    </span>
  );
}
