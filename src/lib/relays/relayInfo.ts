import { RELAY_INFO_CHECK_TIMEOUT, RELAY_HTTP_REQUEST_TIMEOUT } from '../constants';
import { ndk } from '../ndk';
import { cacheRelayInfo, relayInfoCache, relayInfoCacheDurationMs } from './cache';
import type { RelayInfo } from './types';

export function normalizeRelayUrlInternal(url: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  const withScheme = /^wss?:\/\//i.test(trimmed) ? trimmed : `wss://${trimmed}`;

  try {
    const parsed = new URL(withScheme);
    const pathname = parsed.pathname.replace(/\/+$/, '');
    const port = parsed.port ? `:${parsed.port}` : '';
    return `${parsed.protocol.toLowerCase()}//${parsed.hostname.toLowerCase()}${port}${pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return withScheme.replace(/\/+$/, '');
  }
}

export async function getRelayInfo(relayUrl: string): Promise<RelayInfo> {
  const normalizedRelayUrl = normalizeRelayUrlInternal(relayUrl);
  if (!normalizedRelayUrl) {
    return {};
  }

  try {
    const cached = relayInfoCache.get(normalizedRelayUrl);
    if (cached && Date.now() - cached.timestamp < relayInfoCacheDurationMs) {
      return cached;
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error('Relay info check timeout')), RELAY_INFO_CHECK_TIMEOUT);
    });

    const relayInfoPromise = (async () => {
      const relay = ndk.pool?.relays?.get(normalizedRelayUrl);
      if (relay) {
        const relayInfo = (relay as { info?: { supported_nips?: number[] } }).info;
        if (relayInfo?.supported_nips) {
          const result = { supportedNips: relayInfo.supported_nips };
          cacheRelayInfo(normalizedRelayUrl, result);
          return result;
        }
      }

      const httpResult = await checkRelayInfoViaHttp(normalizedRelayUrl);
      if (httpResult.supportedNips?.length || httpResult.name || httpResult.description) {
        cacheRelayInfo(normalizedRelayUrl, httpResult);
        return httpResult;
      }

      cacheRelayInfo(normalizedRelayUrl, {});
      return {};
    })();

    try {
      return await Promise.race([relayInfoPromise, timeoutPromise]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  } catch (error) {
    console.warn(`Failed to get relay info for ${normalizedRelayUrl}:`, error);
    cacheRelayInfo(normalizedRelayUrl, {});
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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), RELAY_HTTP_REQUEST_TIMEOUT);

      try {
        const response = await fetch(testUrl, {
          signal: controller.signal,
          headers: { Accept: 'application/nostr+json' }
        });

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
      } finally {
        clearTimeout(timeout);
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
