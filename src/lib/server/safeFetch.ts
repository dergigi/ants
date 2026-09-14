import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';

export class BlockedUrlError extends Error {
  constructor() { super('Blocked URL'); }
}

const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
  ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3],
] as const) blocked.addSubnet(address, prefix, 'ipv4');
blocked.addSubnet('2001::', 23, 'ipv6');
blocked.addSubnet('2001:db8::', 32, 'ipv6');
blocked.addSubnet('2002::', 16, 'ipv6');
blocked.addSubnet('3fff::', 20, 'ipv6');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  // This also excludes mapped IPv4, local, multicast and translation addresses.
  return family === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}

export function validateUrl(url: URL): string {
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      hostname === 'localhost' || hostname.endsWith('.localhost') ||
      hostname === 'local' || hostname.endsWith('.local') ||
      (isIP(hostname) && !isPublicAddress(hostname))) {
    throw new BlockedUrlError();
  }
  return hostname;
}

type SafeResponse = { url: string; status: number; body: string; location?: string };

// Connect to the validated IP directly. Keep the original Host header and TLS
// servername, but never perform another DNS lookup between validation and connect.
async function requestOnce(url: URL, method: 'GET' | 'HEAD', signal: AbortSignal): Promise<SafeResponse> {
  const hostname = validateUrl(url);
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true });
  signal.throwIfAborted();
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new BlockedUrlError();
  }
  return new Promise((resolve, reject) => {
    const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = request({
      protocol: url.protocol,
      hostname: (addresses.find(({ address }) => isIP(address) === 4) || addresses[0]).address,
      servername: isIP(hostname) ? undefined : hostname,
      port: url.port || undefined,
      path: url.pathname + url.search,
      method,
      agent: false,
      signal,
      headers: { Host: url.host, 'User-Agent': 'ants/OpenGraph', Accept: '*/*', 'Accept-Encoding': 'identity' },
    }, (res) => {
      const status = res.statusCode || 502;
      const result = { url: url.toString(), status, location: res.headers.location, body: '' };
      res.on('error', reject);
      // Redirect bodies and HEAD responses are unnecessary; close the socket.
      if (method === 'HEAD' || (status >= 300 && status < 400)) {
        resolve(result);
        res.destroy();
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) {
          res.destroy(new Error('Preview response too large'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve({ ...result, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

export async function safeFetch(input: string, method: 'GET' | 'HEAD' = 'GET', signal = AbortSignal.timeout(8000)): Promise<SafeResponse> {
  signal.throwIfAborted();
  const run = async () => {
    let url = new URL(input);
    for (let redirects = 0; redirects <= 5; redirects++) {
      const response = await requestOnce(url, method, signal);
      if (![301, 302, 303, 307, 308].includes(response.status) || !response.location) return response;
      url = new URL(response.location, url);
    }
    throw new Error('Too many redirects');
  };
  // Bound DNS resolution as well as the HTTP request.
  let onAbort: () => void = () => {};
  const timeout = new Promise<never>((_, reject) => {
    onAbort = () => reject(new Error('Preview request timed out'));
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try { return await Promise.race([run(), timeout]); }
  finally { signal.removeEventListener('abort', onAbort); }
}
