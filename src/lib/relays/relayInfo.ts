import { RELAY_INFO_CHECK_TIMEOUT, RELAY_HTTP_REQUEST_TIMEOUT } from '../constants';
import { ndk } from '../ndk';
import { cacheRelayInfo, relayInfoCache, relayInfoCacheDurationMs } from './cache';
import { RELAYS } from './config';
import type { RelayInfo } from './types';

export function normalizeRelayUrlInternal(url: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  const withScheme = /^wss?:\/\//i.test(trimmed) ? trimmed : `wss://${trimmed}`;
  return withScheme.replace(/\/+$/, '');
}

export async function getRelayInfo(relayUrl: string): Promise<RelayInfo> {
  try {
    const cached = relayInfoCache.get(relayUrl);
    if (cached && Date.now() - cached.timestamp < relayInfoCacheDurationMs) {
      return cached;
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Relay info check timeout')), RELAY_INFO_CHECK_TIMEOUT);
    });

    const relayInfoPromise = (async () => {
      const relay = ndk.pool?.relays?.get(relayUrl);
      if (relay) {
        const relayInfo = (relay as { info?: { supported_nips?: number[] } }).info;
        if (relayInfo?.supported_nips) {
          const result = { supportedNips: relayInfo.supported_nips };
          cacheRelayInfo(relayUrl, result);
          return result;
        }
      }

      const knownSearchRelays = new Set<string>([
        ...RELAYS.SEARCH,
        ...RELAYS.PROFILE_SEARCH
      ]);

      if (knownSearchRelays.has(relayUrl)) {
        // Keep curated relays on the HTTP/NIP-11 path instead of hard-coding supported NIPs.
      }

      const httpResult = await checkRelayInfoViaHttp(relayUrl);
      if (httpResult.supportedNips?.length || httpResult.name || httpResult.description) {
        cacheRelayInfo(relayUrl, httpResult);
        return httpResult;
      }

      return {};
    })();

    return await Promise.race([relayInfoPromise, timeoutPromise]);
  } catch (error) {
    console.warn(`Failed to get relay info for ${relayUrl}:`, error);
    return {};
  }
}

async function checkRelayInfoViaHttp(relayUrl: string): Promise<RelayInfo> {
  try {
    const httpUrl = relayUrl.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
    const possibleUrls = [
      httpUrl,
      `${httpUrl}/.well-known/nostr.json`,
      `${httpUrl}/nostr.json`
    ];

    for (const testUrl of possibleUrls) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), RELAY_HTTP_REQUEST_TIMEOUT);

        const response = await fetch(testUrl, {
          signal: controller.signal,
          headers: { Accept: 'application/nostr+json' }
        });

        clearTimeout(timeout);

        if (response.ok) {
          const data = await response.json();
          return {
            supportedNips: data?.supported_nips || [],
            name: data?.name,
            description: data?.description,
            contact: data?.contact,
            software: data?.software,
            version: data?.version
          };
        }
      } catch {
        // ignore
      }
    }

    return {};
  } catch {
    return {};
  }
}

export async function checkNip50Support(relayUrl: string): Promise<{ supportsNip50: boolean; supportedNips: number[] }> {
  const relayInfo = await getRelayInfo(relayUrl);

  if (relayInfo.supportedNips) {
    return {
      supportsNip50: relayInfo.supportedNips.includes(50),
      supportedNips: relayInfo.supportedNips
    };
  }

  return { supportsNip50: false, supportedNips: [] };
}
