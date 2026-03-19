#!/usr/bin/env npx tsx
/**
 * NIP-45 COUNT Benchmark
 *
 * Probes NIP-11 for NIP-45 support across all ants relays, then sends
 * COUNT + REQ in parallel and compares timing.
 *
 * Usage:
 *   npx tsx bench/nip45.ts
 *   npx tsx bench/nip45.ts --query "bitcoin"
 */

if (parseInt(process.versions.node) < 18) {
  console.error('Node 18+ required');
  process.exit(1);
}

import NDK, { NDKEvent, NDKRelaySet, NDKRelayStatus } from '@nostr-dev-kit/ndk';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

const SEARCH_QUERY = getArg('--query') ?? 'nostr';

// ---------------------------------------------------------------------------
// Constants (inlined — importing from src/lib/relays would pull in the full app module graph)
// ---------------------------------------------------------------------------

const HTTP_PROBE_TIMEOUT = 2_000;
const COUNT_TIMEOUT = 5_000;
const SEARCH_TIMEOUT = 15_000;
const NDK_CONNECT_TIMEOUT = 10_000;

const RELAYS = {
  DEFAULT: [
    'wss://relay.primal.net',
    'wss://relay.snort.social',
    'wss://relay.ditto.pub',
  ],
  SEARCH: [
    'wss://search.nos.today',
    'wss://relay.nostr.band',
    'wss://relay.ditto.pub',
    'wss://relay.davidebtc.me',
    'wss://relay.gathr.gives',
    'wss://nostr.polyserv.xyz',
    'wss://nostr.azzamo.net',
  ],
  PROFILE_SEARCH: [
    'wss://purplepag.es',
    'wss://search.nos.today',
    'wss://relay.nostr.band',
    'wss://relay.ditto.pub',
  ],
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pad(str: string, len: number): string {
  return str.padEnd(len);
}

function rpad(str: string, len: number): string {
  return str.padStart(len);
}

function ms(n: number): string {
  return `${n.toFixed(0)}ms`;
}

function printHeader(text: string): void {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${text}`);
  console.log('='.repeat(70));
}

// ---------------------------------------------------------------------------
// NIP-11 probe
// ---------------------------------------------------------------------------

interface Nip11Info {
  url: string;
  name?: string;
  supportedNips: number[];
  supportsNip45: boolean;
  supportsNip50: boolean;
  durationMs: number;
  error?: string;
}

async function probeNip11(relayUrl: string): Promise<Nip11Info> {
  const start = performance.now();
  const httpUrl = relayUrl.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');

  const endpoints = [httpUrl, `${httpUrl}/.well-known/nostr.json`, `${httpUrl}/nostr.json`];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HTTP_PROBE_TIMEOUT);
      const response = await fetch(endpoint, {
        signal: controller.signal,
        headers: { Accept: 'application/nostr+json' },
      });
      clearTimeout(timeout);
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data?.supported_nips)) {
          const nips: number[] = data.supported_nips;
          return {
            url: relayUrl,
            name: data?.name,
            supportedNips: nips,
            supportsNip45: nips.includes(45),
            supportsNip50: nips.includes(50),
            durationMs: performance.now() - start,
          };
        }
        // Response is valid JSON but not NIP-11 — try next endpoint
      }
    } catch (err) {
      // Log probe failure for diagnostics — continue to next endpoint
      console.warn(`[NIP-11] probe failed for ${relayUrl} at ${endpoint}: ${err instanceof Error ? err.message : err}`);
    }
  }

  return {
    url: relayUrl,
    supportedNips: [],
    supportsNip45: false,
    supportsNip50: false,
    durationMs: performance.now() - start,
    error: 'no NIP-11 data',
  };
}

// ---------------------------------------------------------------------------
// NIP-45 COUNT via raw WebSocket
// ---------------------------------------------------------------------------

interface CountResult {
  relayUrl: string;
  count: number;
  approximate: boolean;
  latencyMs: number;
  error?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let WSImpl: any;

async function getWS() {
  if (WSImpl) return WSImpl;
  if (typeof globalThis.WebSocket !== 'undefined') {
    WSImpl = globalThis.WebSocket;
    return WSImpl;
  }
  try {
    const mod = await import('ws');
    WSImpl = mod.default ?? mod;
    return WSImpl;
  } catch {
    console.error('No WebSocket available. Use Node 22+ or install ws: npm i -D ws');
    process.exit(1);
  }
}

async function sendCount(
  relayUrl: string,
  filter: Record<string, unknown>,
  timeoutMs: number,
): Promise<CountResult> {
  const WS = await getWS();
  const start = performance.now();

  return new Promise((resolve) => {
    let settled = false;

    const fail = (error: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      resolve({ relayUrl, count: 0, approximate: false, latencyMs: performance.now() - start, error });
    };

    const timer = setTimeout(() => fail('timeout'), timeoutMs);

    let ws: InstanceType<typeof WS>;
    try {
      ws = new WS(relayUrl);
    } catch {
      clearTimeout(timer);
      resolve({ relayUrl, count: 0, approximate: false, latencyMs: performance.now() - start, error: 'connection failed' });
      return;
    }

    const subId = `count-${Math.random().toString(36).slice(2, 8)}`;

    ws.onopen = () => {
      if (settled) return;
      ws.send(JSON.stringify(['COUNT', subId, filter]));
    };

    ws.onmessage = (event: MessageEvent) => {
      if (settled) return;
      try {
        const raw = typeof event.data === 'string' ? event.data : String(event.data);
        const data = JSON.parse(raw);
        if (Array.isArray(data) && data[0] === 'COUNT' && data[1] === subId && data[2]) {
          settled = true;
          clearTimeout(timer);
          try { ws.close(); } catch {}
          resolve({
            relayUrl,
            count: typeof data[2].count === 'number' ? data[2].count : 0,
            approximate: data[2].approximate === true,
            latencyMs: performance.now() - start,
          });
        }
        if (Array.isArray(data) && data[0] === 'NOTICE') {
          fail(`NOTICE: ${data[1]}`);
        }
      } catch {}
    };

    ws.onerror = () => fail('ws error');
    ws.onclose = () => fail('ws closed');
  });
}

// ---------------------------------------------------------------------------
// NIP-50 REQ via NDK (for timing comparison)
// ---------------------------------------------------------------------------


const ndkInstance = new NDK({
  explicitRelayUrls: [...new Set([...RELAYS.DEFAULT, ...RELAYS.SEARCH])],
  clientName: 'Ants-NIP45-Bench',
});

async function connectNdk(): Promise<number> {
  ndkInstance.connect().catch(() => {});

  const deadline = Date.now() + NDK_CONNECT_TIMEOUT;
  while (Date.now() < deadline) {
    let count = 0;
    if (ndkInstance.pool?.relays) {
      Array.from(ndkInstance.pool.relays.values()).forEach(r => {
        if (r.status === NDKRelayStatus.CONNECTED) count++;
      });
    }
    if (count > 0) {
      await new Promise(r => setTimeout(r, 2_000));
      let final = 0;
      if (ndkInstance.pool?.relays) {
        Array.from(ndkInstance.pool.relays.values()).forEach(r => {
          if (r.status === NDKRelayStatus.CONNECTED) final++;
        });
      }
      return final;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return 0;
}

interface SearchResult {
  wallClockMs: number;
  timeToFirstResultMs: number | null;
  timeToEoseMs: number | null;
  totalResults: number;
  timedOut: boolean;
}

async function runSearch(relayUrls: string[], query: string): Promise<SearchResult> {
  const start = performance.now();
  let timeToFirstResult: number | null = null;
  let timeToEose: number | null = null;
  let totalResults = 0;
  let timedOut = false;

  for (const url of relayUrls) {
    ndkInstance.pool?.getRelay(url, true);
  }
  await new Promise(r => setTimeout(r, 1_000));

  const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndkInstance);

  return new Promise((resolve) => {
    const sub = ndkInstance.subscribe(
      { kinds: [1], search: query, limit: 50 },
      { closeOnEose: true, relaySet },
    );

    const timer = setTimeout(() => {
      timedOut = true;
      try { sub.stop(); } catch {}
      resolve({
        wallClockMs: performance.now() - start,
        timeToFirstResultMs: timeToFirstResult,
        timeToEoseMs: timeToEose,
        totalResults,
        timedOut,
      });
    }, SEARCH_TIMEOUT);

    sub.on('event', () => {
      totalResults++;
      if (timeToFirstResult === null) {
        timeToFirstResult = performance.now() - start;
      }
    });

    sub.on('eose', () => {
      timeToEose = performance.now() - start;
      clearTimeout(timer);
      try { sub.stop(); } catch {}
      resolve({
        wallClockMs: performance.now() - start,
        timeToFirstResultMs: timeToFirstResult,
        timeToEoseMs: timeToEose,
        totalResults,
        timedOut,
      });
    });

    sub.start();
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('NIP-45 COUNT Benchmark');
  console.log(`  Query: "${SEARCH_QUERY}"`);

  // Phase 1: Probe all relays for NIP-45 + NIP-50 support
  printHeader('Phase 1 — NIP-11 Probe');

  const allRelays = [...new Set([
    ...RELAYS.DEFAULT,
    ...RELAYS.SEARCH,
    ...RELAYS.PROFILE_SEARCH,
  ])];

  console.log(`  Probing ${allRelays.length} relays...\n`);

  const probeResults = await Promise.allSettled(allRelays.map(probeNip11));

  const probes: Nip11Info[] = [];
  for (const r of probeResults) {
    if (r.status === 'fulfilled') probes.push(r.value);
  }

  // Display table
  console.log(`  ${pad('Relay', 35)} ${rpad('NIP-45', 7)} ${rpad('NIP-50', 7)} ${rpad('Time', 8)} Name`);
  console.log(`  ${'─'.repeat(70)}`);

  const nip45Relays: string[] = [];
  const nip50Relays: string[] = [];
  const bothRelays: string[] = [];

  for (const p of probes.sort((a, b) => a.url.localeCompare(b.url))) {
    const n45 = p.supportsNip45 ? 'yes' : '-';
    const n50 = p.supportsNip50 ? 'yes' : '-';
    const name = p.name ?? (p.error ?? '');
    console.log(`  ${pad(p.url, 35)} ${rpad(n45, 7)} ${rpad(n50, 7)} ${rpad(ms(p.durationMs), 8)} ${name}`);
    if (p.supportsNip45) nip45Relays.push(p.url);
    if (p.supportsNip50) nip50Relays.push(p.url);
    if (p.supportsNip45 && p.supportsNip50) bothRelays.push(p.url);
  }

  console.log(`\n  NIP-45 relays: ${nip45Relays.length}`);
  console.log(`  NIP-50 relays: ${nip50Relays.length}`);
  console.log(`  Both NIP-45 + NIP-50: ${bothRelays.length}`);

  if (bothRelays.length === 0) {
    console.log('\n  No relays support both NIP-45 and NIP-50. COUNT is not useful without NIP-50.');
    console.log('  (COUNT works on any filter, but search queries need NIP-50.)');
  }

  // Phase 2: COUNT vs REQ comparison
  printHeader('Phase 2 — COUNT vs REQ Timing');

  const filter = { kinds: [1], search: SEARCH_QUERY, limit: 50 };

  // Send COUNT to all NIP-45 relays
  const countTargets = nip45Relays.length > 0 ? nip45Relays : allRelays;
  console.log(`\n  Sending COUNT to ${countTargets.length} relay(s)...`);

  const countResults = await Promise.allSettled(
    countTargets.map(url => sendCount(url, filter, COUNT_TIMEOUT)),
  );

  console.log(`\n  ${pad('Relay', 35)} ${rpad('Count', 12)} ${rpad('Approx', 7)} ${rpad('Time', 8)} Error`);
  console.log(`  ${'─'.repeat(75)}`);

  for (const r of countResults) {
    if (r.status === 'fulfilled') {
      const c = r.value;
      const countStr = c.error ? '-' : c.count.toLocaleString();
      const approx = c.approximate ? 'yes' : '-';
      const err = c.error ?? '';
      console.log(`  ${pad(c.relayUrl, 35)} ${rpad(countStr, 12)} ${rpad(approx, 7)} ${rpad(ms(c.latencyMs), 8)} ${err}`);
    }
  }

  // Get successful COUNT results for comparison
  const successfulCounts = countResults
    .filter((r): r is PromiseFulfilledResult<CountResult> =>
      r.status === 'fulfilled' && !r.value.error)
    .map(r => r.value);

  const maxCount = successfulCounts.reduce((max, r) => Math.max(max, r.count), 0);
  const fastestCountMs = successfulCounts.reduce(
    (min, r) => Math.min(min, r.latencyMs),
    Infinity,
  );

  if (successfulCounts.length > 0) {
    console.log(`\n  Max count across relays: ${maxCount.toLocaleString()}`);
    console.log(`  Fastest COUNT response: ${ms(fastestCountMs)}`);
  }

  // Phase 3: REQ search (for timing comparison)
  printHeader('Phase 3 — REQ Search Timing');

  console.log(`\n  Connecting NDK...`);
  const connected = await connectNdk();
  console.log(`  Connected: ${connected} relays`);

  if (connected === 0) {
    console.log('  FATAL: No relays connected. Skipping search phase.');
    process.exit(1);
  }

  const searchTargets = nip50Relays.length > 0 ? nip50Relays : RELAYS.SEARCH.slice();
  console.log(`  Searching "${SEARCH_QUERY}" on ${searchTargets.length} relay(s)...`);

  const searchResult = await runSearch(searchTargets, SEARCH_QUERY);

  console.log(`\n  Wall clock:         ${ms(searchResult.wallClockMs)}`);
  console.log(`  Time to 1st result: ${searchResult.timeToFirstResultMs !== null ? ms(searchResult.timeToFirstResultMs) : 'N/A'}`);
  console.log(`  Time to EOSE:       ${searchResult.timeToEoseMs !== null ? ms(searchResult.timeToEoseMs) : 'N/A'}`);
  console.log(`  Total results:      ${searchResult.totalResults}`);
  console.log(`  Timed out:          ${searchResult.timedOut ? 'YES' : 'no'}`);

  // Phase 4: Summary comparison
  printHeader('Summary — COUNT vs REQ');

  if (successfulCounts.length > 0 && searchResult.timeToFirstResultMs !== null) {
    const countAdvantage = searchResult.timeToFirstResultMs - fastestCountMs;
    console.log(`\n  COUNT arrived ${ms(Math.abs(countAdvantage))} ${countAdvantage > 0 ? 'before' : 'after'} first REQ event`);
    console.log(`  COUNT total: ~${maxCount.toLocaleString()} events`);
    console.log(`  REQ returned: ${searchResult.totalResults} events`);
    console.log(`\n  Value: "Showing ${searchResult.totalResults} of ~${maxCount.toLocaleString()}"`);
  } else if (successfulCounts.length === 0) {
    console.log('\n  No successful COUNT responses. COUNT feature would be a no-op.');
  } else {
    console.log('\n  No search results to compare against.');
  }

  console.log('\nDone.\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
