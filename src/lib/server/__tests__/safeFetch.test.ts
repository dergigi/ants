import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { BlockedUrlError, isPublicAddress, safeFetch, validateUrl } from '../safeFetch';

jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));
jest.mock('node:http', () => ({ request: jest.fn() }));
jest.mock('node:https', () => ({ request: jest.fn() }));
const dns = jest.mocked(lookup);
const http = jest.mocked(httpRequest);
const https = jest.mocked(httpsRequest);

function respond(status = 200, body = 'preview', location?: string) {
  // Only the network boundary is mocked: safeFetch still chooses the address,
  // preserves Host/TLS identity, checks redirects, and consumes response bodies.
  return (_options: unknown, callback: (response: unknown) => void) => {
    const req = Object.assign(new EventEmitter(), {
      end() {
        const res = Object.assign(new PassThrough(), { statusCode: status, headers: { location } });
        callback(res);
        res.end(body);
      },
    });
    return req;
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  dns.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
  http.mockImplementation(respond() as never);
  https.mockImplementation(respond() as never);
});

test.each([
  '0.0.0.0', '127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1',
  '169.254.169.254', '100.64.0.1', '224.0.0.1', '255.255.255.255',
  '::', '::1', '::ffff:127.0.0.1', '::ffff:7f00:1', 'fe90::1', 'fd00::1',
  '64:ff9b::7f00:1', '2002:7f00:1::', '2001:db8::1',
])('rejects nonpublic address %s', (ip) => {
  expect(isPublicAddress(ip)).toBe(false);
});

test.each(['8.8.8.8', '93.184.216.34', '2606:4700:4700::1111'])('allows public address %s', (ip) => {
  expect(isPublicAddress(ip)).toBe(true);
});

test.each([
  'http://localhost./', 'http://a.localhost/', 'http://a.local/',
  'http://127.1/', 'http://2130706433/', 'http://0x7f000001/',
  'http://[::ffff:127.0.0.1]/', 'file:///etc/passwd', 'http://user:pass@example.com/',
])('blocks URL %s before connecting', (url) => {
  expect(() => validateUrl(new URL(url))).toThrow(BlockedUrlError);
  expect(http).not.toHaveBeenCalled();
});

test('blocks a public-looking domain resolving to a private IP', async () => {
  dns.mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as never);
  await expect(safeFetch('http://7f000001.nip.io/')).rejects.toThrow(BlockedUrlError);
  expect(http).not.toHaveBeenCalled();
});

test('rejects mixed public/private DNS answers', async () => {
  dns.mockResolvedValue([
    { address: '93.184.216.34', family: 4 }, { address: '::1', family: 6 },
  ] as never);
  await expect(safeFetch('https://example.com/')).rejects.toThrow(BlockedUrlError);
  expect(https).not.toHaveBeenCalled();
});

test('pins the connection to the checked IP and preserves Host and TLS identity', async () => {
  await expect(safeFetch('https://example.com:8443/path?q=test')).resolves.toMatchObject({ status: 200, body: 'preview' });
  expect(dns).toHaveBeenCalledTimes(1);
  expect(https).toHaveBeenCalledWith(expect.objectContaining({
    hostname: '93.184.216.34', servername: 'example.com', port: '8443',
    path: '/path?q=test', agent: false, headers: expect.objectContaining({ Host: 'example.com:8443' }),
  }), expect.any(Function));
});

test.each(['GET', 'HEAD'] as const)('blocks %s redirects into private networks', async (method) => {
  https.mockImplementation(respond(302, '', 'http://169.254.169.254/latest/meta-data/') as never);
  await expect(safeFetch('https://example.com/', method)).rejects.toThrow(BlockedUrlError);
  expect(http).not.toHaveBeenCalled();
});

test('resolves and validates redirect hostnames again', async () => {
  https.mockImplementation(respond(302, '', 'http://internal.example/') as never);
  dns.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }] as never)
    .mockResolvedValueOnce([{ address: '10.0.0.1', family: 4 }] as never);
  await expect(safeFetch('https://example.com/')).rejects.toThrow(BlockedUrlError);
  expect(http).not.toHaveBeenCalled();
});

test('supports relative redirects to public pages', async () => {
  https.mockImplementationOnce(respond(302, '', '/article') as never);
  await expect(safeFetch('https://example.com/')).resolves.toMatchObject({ url: 'https://example.com/article', body: 'preview' });
  expect(https).toHaveBeenCalledTimes(2);
});

test('bounds redirect loops', async () => {
  https.mockImplementation(respond(302, '', '/') as never);
  await expect(safeFetch('https://example.com/')).rejects.toThrow('Too many redirects');
  expect(https).toHaveBeenCalledTimes(6);
});

test('rejects oversized response bodies', async () => {
  https.mockImplementation(respond(200, 'x'.repeat(2 * 1024 * 1024 + 1)) as never);
  await expect(safeFetch('https://example.com/')).rejects.toThrow('Preview response too large');
});
