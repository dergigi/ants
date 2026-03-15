#!/usr/bin/env npx tsx
/**
 * NIP-66 Before/After Benchmark
 *
 * Measures the performance improvement from NIP-66 relay liveness filtering:
 *   Phase A — HTTP-only probing (no NIP-66)
 *   Phase B — NIP-66 pre-filtering + fast path
 *   Phase C — (opt-in) actual NIP-50 search comparison
 *
 * Usage:
 *   npx tsx bench/nip66.ts
 *   npx tsx bench/nip66.ts --iterations 5
 *   npx tsx bench/nip66.ts --search
 *   npx tsx bench/nip66.ts --search --query "nostr"
 */

// Node version check
if (parseInt(process.versions.node) < 18) {
  console.error('Node 18+ required');
  process.exit(1);
}

import NDK, { NDKEvent, NDKRelaySet, NDKSubscription } from '@nostr-dev-kit/ndk';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

const ITERATIONS = Math.max(1, parseInt(getArg('--iterations') ?? '3', 10));
const SEARCH_ITERATIONS = Math.max(1, parseInt(getArg('--search-iterations') ?? '4', 10));
const RUN_SEARCH = args.includes('--search');
const SEARCH_QUERY = getArg('--query'); // if set, only run this one query

const DEFAULT_SEARCH_QUERIES = [
  'bitcoin',
  'nostr',
  'zap',
  'npub1sn0wdenkukak0d9dfczzeacvhkrgz92ak56egt7vdgzn8pv2wfqqhrjdv9',  // snowden
  'nevent1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cgukyawd24mayt8gpp4mhxue69uhkummn9ekx7mqpz4mhxue69uhk2er9dchxummnw3ezumrpdejqygpm7rrrljungc6q0tuh5hj7ue863q73qlheu4luamhkhgnwfkq95psqqqqqqs5svfmj',
  'lightning',
];

const searchQueries = SEARCH_QUERY ? [SEARCH_QUERY] : DEFAULT_SEARCH_QUERIES;

// ---------------------------------------------------------------------------
// Constants (inlined from src/lib/constants.ts & src/lib/relays.ts)
// ---------------------------------------------------------------------------

const NIP66_SAFETY_THRESHOLD = 0.8;
const NIP66_DEAD_ENTRY_MAX_AGE = 86_400_000; // 24 hours
const NIP66_FETCH_TIMEOUT = 15_000;
const HTTP_PROBE_TIMEOUT = 2_000;
const SEARCH_TIMEOUT = 15_000;
const NDK_CONNECT_TIMEOUT = 10_000;

const KNOWN_MONITOR_RELAYS = [
  'wss://relaypag.es',
  'wss://relay.nostr.watch',
  'wss://monitorlizard.nostr1.com',
];

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

const GENERAL_RELAYS = [
  'wss://nos.lol',
  'wss://relay.damus.io',
  'wss://nostr.wine',
];

// Realistic dirty candidate set config
const TARGET_CANDIDATE_COUNT = 50;
const DIRTY_DEAD_RATIO = 0.4;      // 40% dead relays (simulates stale user relay list)
const DIRTY_ALIVE_RATIO = 0.4;     // 40% alive non-NIP-50 (general relays)
const DIRTY_NIP50_RATIO = 0.2;     // 20% alive NIP-50 (discovered via monitor)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Nip66Entry {
  relayUrl: string;
  isAlive: boolean;
  rttOpen?: number;
  rttRead?: number;
  rttWrite?: number;
  supportedNips: number[];
  network?: string;
  monitorPubkey: string;
  lastSeen: number;   // event created_at (seconds)
  cachedAt: number;    // Date.now() (milliseconds)
}

interface ProbeResult {
  url: string;
  success: boolean;
  supportsNip50: boolean;
  supportedNips: number[];
  durationMs: number;
  error?: string;
  name?: string;
}

interface PhaseResult {
  wallClockMs: number;
  probeCount: number;
  successCount: number;
  failCount: number;
  timeoutCount: number;
  nip50Relays: string[];
  probes: ProbeResult[];
}

interface PhaseBResult extends PhaseResult {
  deadFiltered: string[];
  fastPathHits: string[];
  safetyValveTriggered: boolean;
}

interface SearchPhaseResult {
  wallClockMs: number;
  timeToFirstResultMs: number | null;
  timeToEoseMs: number | null;
  totalResults: number;
  relayContributions: Map<string, number>;
  timedOut: boolean;
}

// ---------------------------------------------------------------------------
// Pure utilities (inlined from src/lib — no app module imports)
// ---------------------------------------------------------------------------

function normalizeRelayUrl(url: string | undefined | null): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  const withScheme = /^wss?:\/\//i.test(trimmed) ? trimmed : `wss://${trimmed}`;
  return withScheme.replace(/\/+$/, '');
}

function parseMonitorEvent(event: NDKEvent): Nip66Entry | null {
  const dTag = event.tags.find(t => t[0] === 'd');
  if (!dTag || !dTag[1]) return null;

  const relayUrl = normalizeRelayUrl(dTag[1]);
  if (!relayUrl) return null;

  let rttOpen: number | undefined;
  let rttRead: number | undefined;
  let rttWrite: number | undefined;
  const supportedNips: number[] = [];
  let network: string | undefined;

  for (const tag of event.tags) {
    if (tag[0] === 'rtt-open' && tag[1]) {
      const val = parseInt(tag[1], 10);
      if (!isNaN(val)) rttOpen = val;
    } else if (tag[0] === 'rtt-read' && tag[1]) {
      const val = parseInt(tag[1], 10);
      if (!isNaN(val)) rttRead = val;
    } else if (tag[0] === 'rtt-write' && tag[1]) {
      const val = parseInt(tag[1], 10);
      if (!isNaN(val)) rttWrite = val;
    } else if (tag[0] === 'N' && tag[1]) {
      const val = parseInt(tag[1], 10);
      if (!isNaN(val)) supportedNips.push(val);
    } else if (tag[0] === 'n' && tag[1]) {
      network = tag[1];
    }
  }

  return {
    relayUrl,
    isAlive: rttOpen !== undefined,
    rttOpen,
    rttRead,
    rttWrite,
    supportedNips,
    network,
    monitorPubkey: event.pubkey,
    lastSeen: event.created_at ?? Math.floor(Date.now() / 1000),
    cachedAt: Date.now(),
  };
}

function classifyRelay(
  relayUrl: string,
  cache: Map<string, Nip66Entry>,
): 'alive' | 'dead' | 'unknown' {
  const normalized = normalizeRelayUrl(relayUrl);
  if (normalized.includes('.onion')) return 'alive';

  const entry = cache.get(normalized);
  if (!entry) return 'unknown';

  if (entry.isAlive) return 'alive';

  const age = Date.now() - entry.cachedAt;
  if (age < NIP66_DEAD_ENTRY_MAX_AGE) return 'dead';

  return 'unknown';
}

function filterDeadRelays(
  relayUrls: string[],
  cache: Map<string, Nip66Entry>,
): { live: string[]; dead: string[]; safetyValveTriggered: boolean } {
  if (cache.size === 0) {
    return { live: [...relayUrls], dead: [], safetyValveTriggered: false };
  }

  const live: string[] = [];
  const dead: string[] = [];
  for (const url of relayUrls) {
    if (classifyRelay(url, cache) === 'dead') {
      dead.push(url);
    } else {
      live.push(url);
    }
  }

  // Safety valve: if >80% would be removed, skip filtering entirely
  if (live.length < relayUrls.length * (1 - NIP66_SAFETY_THRESHOLD)) {
    return { live: [...relayUrls], dead: [], safetyValveTriggered: true };
  }

  return { live, dead, safetyValveTriggered: false };
}

// ---------------------------------------------------------------------------
// NDK setup (no cache adapter — avoids WASM / localStorage deps)
// ---------------------------------------------------------------------------

const ndkInstance = new NDK({
  explicitRelayUrls: [...RELAYS.DEFAULT, ...KNOWN_MONITOR_RELAYS],
  clientName: 'Ants-Bench',
});

// NDKRelayStatus enum: CONNECTED = 5
const NDK_RELAY_STATUS_CONNECTED = 5;

function countConnectedRelays(): number {
  let connected = 0;
  if (ndkInstance.pool?.relays) {
    Array.from(ndkInstance.pool.relays.values()).forEach(relay => {
      if (relay.status === NDK_RELAY_STATUS_CONNECTED) connected++;
    });
  }
  return connected;
}

async function connectNdk(): Promise<number> {
  // NDK.connect() initiates connections but doesn't wait for them
  ndkInstance.connect().catch(() => {});

  // Poll for connections with timeout
  const deadline = Date.now() + NDK_CONNECT_TIMEOUT;
  while (Date.now() < deadline) {
    const count = countConnectedRelays();
    if (count > 0) {
      // Wait a bit more for additional relays to connect
      await new Promise(r => setTimeout(r, 2_000));
      return countConnectedRelays();
    }
    await new Promise(r => setTimeout(r, 500));
  }

  return countConnectedRelays();
}

// ---------------------------------------------------------------------------
// Fetch NIP-66 monitor data
// ---------------------------------------------------------------------------

async function fetchMonitorData(): Promise<Map<string, Nip66Entry>> {
  const cache = new Map<string, Nip66Entry>();

  const events = await new Promise<NDKEvent[]>((resolve) => {
    const collected: NDKEvent[] = [];

    const sub = ndkInstance.subscribe(
      { kinds: [30166 as number], limit: 500 },
      { closeOnEose: true },
    );

    const timer = setTimeout(() => {
      try { sub.stop(); } catch {}
      resolve(collected);
    }, NIP66_FETCH_TIMEOUT);

    sub.on('event', (event: NDKEvent) => {
      collected.push(event);
    });

    sub.on('eose', () => {
      clearTimeout(timer);
      try { sub.stop(); } catch {}
      resolve(collected);
    });

    sub.start();
  });

  for (const event of events) {
    const entry = parseMonitorEvent(event);
    if (!entry) continue;

    const existing = cache.get(entry.relayUrl);
    if (!existing || entry.lastSeen > existing.lastSeen) {
      cache.set(entry.relayUrl, entry);
    }
  }

  return cache;
}

// ---------------------------------------------------------------------------
// HTTP NIP-11 probe
// ---------------------------------------------------------------------------

/**
 * Probe a single endpoint with timeout. Returns parsed NIP-11 data or null.
 */
async function probeSingleEndpoint(
  testUrl: string,
  timeoutMs: number,
): Promise<{ supported_nips?: number[]; name?: string } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(testUrl, {
      signal: controller.signal,
      headers: { Accept: 'application/nostr+json' },
    });
    clearTimeout(timeout);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Probe a relay via HTTP NIP-11 using 3 endpoints (matching the real app's
 * checkRelayInfoViaHttp in relays.ts). Each endpoint gets its own 2s timeout,
 * so a dead relay costs up to 6s total.
 */
async function probeRelayNip11(url: string): Promise<ProbeResult> {
  const start = performance.now();
  const httpUrl = url.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');

  const endpoints = [
    httpUrl,                              // Root path (NIP-11 spec)
    `${httpUrl}/.well-known/nostr.json`,  // Common convention
    `${httpUrl}/nostr.json`,              // Alternative convention
  ];

  for (const endpoint of endpoints) {
    const data = await probeSingleEndpoint(endpoint, HTTP_PROBE_TIMEOUT);
    if (data && (data.supported_nips?.length || data.name)) {
      const nips: number[] = data.supported_nips ?? [];
      return {
        url,
        success: true,
        supportsNip50: nips.includes(50),
        supportedNips: nips,
        durationMs: performance.now() - start,
        name: data.name,
      };
    }
  }

  const elapsed = performance.now() - start;
  // With 3 endpoints x 2s timeout each, anything over ~4s is timeout-dominated
  const isTimeout = elapsed >= HTTP_PROBE_TIMEOUT * 2;
  return {
    url,
    success: false,
    supportsNip50: false,
    supportedNips: [],
    durationMs: elapsed,
    error: isTimeout ? 'timeout' : 'no NIP-11 data',
  };
}

// ---------------------------------------------------------------------------
// Phase A — HTTP-only probing (no NIP-66)
// ---------------------------------------------------------------------------

async function runPhaseA(candidates: string[]): Promise<PhaseResult> {
  const start = performance.now();

  const results = await Promise.allSettled(candidates.map(url => probeRelayNip11(url)));

  const wallClockMs = performance.now() - start;
  const probes: ProbeResult[] = [];
  let successCount = 0;
  let failCount = 0;
  let timeoutCount = 0;
  const nip50Relays: string[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const probe = result.value;
      probes.push(probe);
      if (probe.success) {
        successCount++;
        if (probe.supportsNip50) nip50Relays.push(probe.url);
      } else if (probe.error === 'timeout') {
        timeoutCount++;
      } else {
        failCount++;
      }
    } else {
      failCount++;
    }
  }

  return {
    wallClockMs,
    probeCount: candidates.length,
    successCount,
    failCount,
    timeoutCount,
    nip50Relays,
    probes,
  };
}

// ---------------------------------------------------------------------------
// Phase B — NIP-66 pre-filtering + fast path
// ---------------------------------------------------------------------------

async function runPhaseB(
  candidates: string[],
  cache: Map<string, Nip66Entry>,
): Promise<PhaseBResult> {
  const start = performance.now();

  // Step 1: Filter dead relays
  const { live, dead, safetyValveTriggered } = filterDeadRelays(candidates, cache);

  // Step 2: Separate fast path (NIP-66 confirms NIP-50) from unknowns
  const fastPathHits: string[] = [];
  const needsProbe: string[] = [];

  for (const url of live) {
    const normalized = normalizeRelayUrl(url);
    const entry = cache.get(normalized);
    if (entry?.isAlive && entry.supportedNips.includes(50)) {
      fastPathHits.push(url);
    } else {
      needsProbe.push(url);
    }
  }

  // Step 3: HTTP-probe only the unknowns
  const probeResults = await Promise.allSettled(needsProbe.map(url => probeRelayNip11(url)));

  const wallClockMs = performance.now() - start;

  // Build fast-path "probes" (0ms, success)
  const fastProbes: ProbeResult[] = fastPathHits.map(url => ({
    url,
    success: true,
    supportsNip50: true,
    supportedNips: [50],
    durationMs: 0,
    name: cache.get(normalizeRelayUrl(url))?.relayUrl,
  }));

  const allProbes: ProbeResult[] = [...fastProbes];
  let successCount = fastPathHits.length;
  let failCount = 0;
  let timeoutCount = 0;
  const nip50Relays: string[] = [...fastPathHits];

  for (const result of probeResults) {
    if (result.status === 'fulfilled') {
      const probe = result.value;
      allProbes.push(probe);
      if (probe.success) {
        successCount++;
        if (probe.supportsNip50) nip50Relays.push(probe.url);
      } else if (probe.error === 'timeout') {
        timeoutCount++;
      } else {
        failCount++;
      }
    } else {
      failCount++;
    }
  }

  return {
    wallClockMs,
    probeCount: needsProbe.length,
    successCount,
    failCount,
    timeoutCount,
    nip50Relays,
    probes: allProbes,
    deadFiltered: dead,
    fastPathHits,
    safetyValveTriggered,
  };
}

// ---------------------------------------------------------------------------
// Phase C — Actual NIP-50 search comparison (opt-in)
// ---------------------------------------------------------------------------

async function runSearchPhase(
  relayUrls: string[],
  query: string,
): Promise<SearchPhaseResult> {
  if (relayUrls.length === 0) {
    return {
      wallClockMs: 0,
      timeToFirstResultMs: null,
      timeToEoseMs: null,
      totalResults: 0,
      relayContributions: new Map(),
      timedOut: false,
    };
  }

  const start = performance.now();
  let timeToFirstResult: number | null = null;
  let timeToEose: number | null = null;
  let totalResults = 0;
  const relayContributions = new Map<string, number>();
  let timedOut = false;

  // Ensure relay connections for the target set
  for (const url of relayUrls) {
    ndkInstance.pool?.getRelay(url, true);
  }
  await new Promise(r => setTimeout(r, 2_000));

  const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndkInstance);

  await new Promise<void>((resolve) => {
    const sub = ndkInstance.subscribe(
      { kinds: [1], search: query, limit: 50 },
      { closeOnEose: true, relaySet },
    );

    const timer = setTimeout(() => {
      timedOut = true;
      try { sub.stop(); } catch {}
      resolve();
    }, SEARCH_TIMEOUT);

    sub.on('event', (event: NDKEvent) => {
      totalResults++;
      if (timeToFirstResult === null) {
        timeToFirstResult = performance.now() - start;
      }
      // Track relay contributions
      const relay = event.relay?.url;
      if (relay) {
        relayContributions.set(relay, (relayContributions.get(relay) ?? 0) + 1);
      }
    });

    sub.on('eose', () => {
      timeToEose = performance.now() - start;
      clearTimeout(timer);
      try { sub.stop(); } catch {}
      resolve();
    });

    sub.start();
  });

  return {
    wallClockMs: performance.now() - start,
    timeToFirstResultMs: timeToFirstResult,
    timeToEoseMs: timeToEose,
    totalResults,
    relayContributions,
    timedOut,
  };
}

// ---------------------------------------------------------------------------
// Output formatting
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

function printMonitorStats(
  cache: Map<string, Nip66Entry>,
  candidates: string[],
): void {
  printHeader('NIP-66 Monitor Data');

  console.log(`  Total entries:      ${cache.size}`);

  if (cache.size === 0) {
    console.log('\n  WARNING: No NIP-66 data received. Monitor relays may be unreachable.');
    console.log('  Phase B will match Phase A.\n');
    return;
  }

  // Data freshness
  let newestAge = Infinity;
  let oldestAge = 0;
  const ages: number[] = [];
  Array.from(cache.values()).forEach(entry => {
    const age = Date.now() - entry.cachedAt;
    ages.push(age);
    if (age < newestAge) newestAge = age;
    if (age > oldestAge) oldestAge = age;
  });
  ages.sort((a, b) => a - b);
  const medianAge = ages[Math.floor(ages.length / 2)] ?? 0;

  const formatAge = (ms: number) => {
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    return `${hr}h ${min % 60}m`;
  };

  console.log(`  Newest entry age:   ${formatAge(newestAge)}`);
  console.log(`  Oldest entry age:   ${formatAge(oldestAge)}`);
  console.log(`  Median entry age:   ${formatAge(medianAge)}`);

  if (newestAge > NIP66_DEAD_ENTRY_MAX_AGE) {
    console.log('\n  WARNING: All monitor data is >24h old. Dead entries degrade to \'unknown\'.');
  }

  // Candidate coverage
  let covered = 0;
  let aliveCount = 0;
  let deadCount = 0;
  let nip50Count = 0;
  for (const url of candidates) {
    const normalized = normalizeRelayUrl(url);
    const entry = cache.get(normalized);
    if (entry) {
      covered++;
      if (entry.isAlive) {
        aliveCount++;
        if (entry.supportedNips.includes(50)) nip50Count++;
      } else {
        deadCount++;
      }
    }
  }

  console.log(`\n  Candidate coverage: ${covered}/${candidates.length}`);
  console.log(`    alive:  ${aliveCount}  (NIP-50: ${nip50Count})`);
  console.log(`    dead:   ${deadCount}`);
  console.log(`    no data: ${candidates.length - covered}`);

  if (covered === 0) {
    console.log('\n  Monitor data covers 0/' + candidates.length + ' candidates — no filtering will occur.');
  }
}

function printPhaseAResult(label: string, result: PhaseResult): void {
  console.log(`\n  ${label}`);
  console.log(`  ${'─'.repeat(50)}`);
  console.log(`  Wall clock:     ${ms(result.wallClockMs)}`);
  console.log(`  Probes:         ${result.probeCount}`);
  console.log(`  Success:        ${result.successCount}`);
  console.log(`  Failed:         ${result.failCount}`);
  console.log(`  Timeout:        ${result.timeoutCount}`);
  console.log(`  NIP-50 relays:  ${result.nip50Relays.length}`);
  if (result.nip50Relays.length > 0) {
    for (const url of result.nip50Relays) {
      console.log(`    ${url}`);
    }
  }
}

function printPhaseBResult(label: string, result: PhaseBResult): void {
  console.log(`\n  ${label}`);
  console.log(`  ${'─'.repeat(50)}`);
  console.log(`  Wall clock:     ${ms(result.wallClockMs)}`);
  console.log(`  Dead filtered:  ${result.deadFiltered.length}`);
  if (result.deadFiltered.length > 0) {
    for (const url of result.deadFiltered) {
      console.log(`    ${url}`);
    }
  }
  console.log(`  Fast path hits: ${result.fastPathHits.length}`);
  if (result.fastPathHits.length > 0) {
    for (const url of result.fastPathHits) {
      console.log(`    ${url}`);
    }
  }
  console.log(`  HTTP probes:    ${result.probeCount}`);
  console.log(`  Success:        ${result.successCount}`);
  console.log(`  Failed:         ${result.failCount}`);
  console.log(`  Timeout:        ${result.timeoutCount}`);
  console.log(`  NIP-50 relays:  ${result.nip50Relays.length}`);
  if (result.nip50Relays.length > 0) {
    for (const url of result.nip50Relays) {
      console.log(`    ${url}`);
    }
  }
  if (result.safetyValveTriggered) {
    const total = result.deadFiltered.length + result.probeCount + result.fastPathHits.length;
    console.log(`\n  SAFETY VALVE: ${result.deadFiltered.length}/${total} relays classified dead (>${NIP66_SAFETY_THRESHOLD * 100}%). Filtering skipped.`);
  }
}

function printRecallComparison(phaseA: PhaseResult, phaseB: PhaseBResult): void {
  console.log('\n  Recall Comparison');
  console.log(`  ${'─'.repeat(50)}`);

  const aNip50 = new Set(phaseA.nip50Relays.map(normalizeRelayUrl));
  const bNip50 = new Set(phaseB.nip50Relays.map(normalizeRelayUrl));

  // Check for recall loss: in A but not in B
  const lost = Array.from(aNip50).filter(url => !bNip50.has(url));

  // Check for gains: in B but not in A (fast path discovered NIP-50 that HTTP missed)
  const gained = Array.from(bNip50).filter(url => !aNip50.has(url));

  if (lost.length === 0 && gained.length === 0) {
    console.log('  PASS: Both phases found the same NIP-50 relays.');
  } else {
    if (lost.length > 0) {
      console.log(`  RECALL LOSS: Phase A found NIP-50 on ${lost.length} relay(s) that Phase B excluded:`);
      for (const url of lost) {
        console.log(`    ${url} (classified as dead)`);
      }
    }
    if (gained.length > 0) {
      console.log(`  RECALL GAIN: Phase B found NIP-50 on ${gained.length} relay(s) via fast path that Phase A missed:`);
      for (const url of gained) {
        console.log(`    ${url}`);
      }
    }
  }
}

function printSearchComparison(
  labelA: string,
  resultA: SearchPhaseResult,
  labelB: string,
  resultB: SearchPhaseResult,
): void {
  printHeader('Phase C — Search Comparison');

  const printOne = (label: string, r: SearchPhaseResult) => {
    console.log(`\n  ${label}`);
    console.log(`  ${'─'.repeat(50)}`);
    console.log(`  Wall clock:         ${ms(r.wallClockMs)}`);
    console.log(`  Time to 1st result: ${r.timeToFirstResultMs !== null ? ms(r.timeToFirstResultMs) : 'N/A'}`);
    console.log(`  Time to EOSE:       ${r.timeToEoseMs !== null ? ms(r.timeToEoseMs) : 'N/A'}`);
    console.log(`  Total results:      ${r.totalResults}`);
    console.log(`  Timed out:          ${r.timedOut ? 'YES' : 'no'}`);
    if (r.timedOut) {
      console.log(`  Search timed out after ${SEARCH_TIMEOUT / 1000}s (EOSE not received from all relays).`);
    }
    if (r.relayContributions.size > 0) {
      console.log('  Relay contributions:');
      for (const [relay, count] of Array.from(r.relayContributions.entries()).sort((a, b) => b[1] - a[1])) {
        console.log(`    ${pad(relay, 40)} ${rpad(String(count), 4)} results`);
      }
    }
  };

  printOne(labelA, resultA);
  printOne(labelB, resultB);
}

function printSummaryTable(
  phaseAResults: PhaseResult[],
  phaseBResults: PhaseBResult[],
): void {
  printHeader('Summary');

  const median = (arr: number[]) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)] ?? 0;
  };
  const p95 = (arr: number[]) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.min(Math.floor(s.length * 0.95), s.length - 1)] ?? 0;
  };

  const aTimes = phaseAResults.map(r => r.wallClockMs);
  const bTimes = phaseBResults.map(r => r.wallClockMs);

  const aMedian = median(aTimes);
  const bMedian = median(bTimes);
  const savings = aMedian - bMedian;
  const savingsPercent = aMedian > 0 ? ((savings / aMedian) * 100) : 0;

  const aProbes = median(phaseAResults.map(r => r.probeCount));
  const bProbes = median(phaseBResults.map(r => r.probeCount));

  const aDeadFiltered = 0;
  const bDeadFiltered = median(phaseBResults.map(r => r.deadFiltered.length));
  const bFastPath = median(phaseBResults.map(r => r.fastPathHits.length));

  console.log(`\n  ${pad('Metric', 28)} ${rpad('Phase A', 12)} ${rpad('Phase B', 12)} ${rpad('Diff', 12)}`);
  console.log(`  ${'─'.repeat(64)}`);
  console.log(`  ${pad('Wall clock (median)', 28)} ${rpad(ms(aMedian), 12)} ${rpad(ms(bMedian), 12)} ${rpad(savings > 0 ? `-${ms(savings)}` : `+${ms(-savings)}`, 12)}`);
  console.log(`  ${pad('Wall clock (p95)', 28)} ${rpad(ms(p95(aTimes)), 12)} ${rpad(ms(p95(bTimes)), 12)}`);
  console.log(`  ${pad('HTTP probes', 28)} ${rpad(String(aProbes), 12)} ${rpad(String(bProbes), 12)} ${rpad(String(bProbes - aProbes), 12)}`);
  console.log(`  ${pad('Dead relays filtered', 28)} ${rpad(String(aDeadFiltered), 12)} ${rpad(String(bDeadFiltered), 12)}`);
  console.log(`  ${pad('Fast path (NIP-66 NIP-50)', 28)} ${rpad('0', 12)} ${rpad(String(bFastPath), 12)}`);
  console.log(`  ${pad('NIP-50 relays found', 28)} ${rpad(String(median(phaseAResults.map(r => r.nip50Relays.length))), 12)} ${rpad(String(median(phaseBResults.map(r => r.nip50Relays.length))), 12)}`);

  if (savingsPercent > 0) {
    console.log(`\n  Phase B is ${savingsPercent.toFixed(1)}% faster (median wall clock).`);
  } else {
    console.log(`\n  Phase B is ${(-savingsPercent).toFixed(1)}% slower (median wall clock).`);
  }

  // Per-iteration detail
  console.log(`\n  Per-iteration wall clock:`);
  for (let i = 0; i < aTimes.length; i++) {
    console.log(`    Iteration ${i + 1}:  A=${ms(aTimes[i])}  B=${ms(bTimes[i])}`);
  }
}

function printProbeDetails(label: string, probes: ProbeResult[]): void {
  console.log(`\n  ${label} — Per-relay detail`);
  console.log(`  ${pad('Relay', 40)} ${rpad('Status', 10)} ${rpad('Time', 8)} ${rpad('NIP-50', 7)} Name`);
  console.log(`  ${'─'.repeat(80)}`);

  for (const p of probes.sort((a, b) => a.url.localeCompare(b.url))) {
    const status = p.success ? 'OK' : (p.error === 'timeout' ? 'TIMEOUT' : 'FAIL');
    const nip50 = p.supportsNip50 ? 'yes' : '-';
    const name = p.name ?? '';
    console.log(`  ${pad(p.url, 40)} ${rpad(status, 10)} ${rpad(ms(p.durationMs), 8)} ${rpad(nip50, 7)} ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Build candidate list
// ---------------------------------------------------------------------------

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildCandidateList(monitorCache?: Map<string, Nip66Entry>): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];

  const add = (urls: readonly string[]) => {
    for (const url of urls) {
      const normalized = normalizeRelayUrl(url);
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        candidates.push(normalized);
      }
    }
  };

  // Always include the app's hardcoded relays (the "base" set)
  add(RELAYS.SEARCH);
  add(RELAYS.DEFAULT);
  add(RELAYS.PROFILE_SEARCH);
  add(GENERAL_RELAYS);

  const baseCount = candidates.length;

  // Fill remaining slots from monitor data to simulate a dirty user relay list
  if (monitorCache && monitorCache.size > 0) {
    const remaining = TARGET_CANDIDATE_COUNT - baseCount;
    if (remaining <= 0) return candidates;

    const deadTarget = Math.ceil(remaining * DIRTY_DEAD_RATIO);
    const aliveTarget = Math.ceil(remaining * DIRTY_ALIVE_RATIO);
    const nip50Target = remaining - deadTarget - aliveTarget;

    // Partition monitor entries (excluding already-added relays)
    const deadPool: string[] = [];
    const alivePool: string[] = [];     // alive, no NIP-50
    const nip50Pool: string[] = [];     // alive + NIP-50

    // Only include wss:// relays (skip ws://localhost test fixtures)
    Array.from(monitorCache.values()).forEach(entry => {
      if (seen.has(entry.relayUrl)) return;
      if (!entry.relayUrl.startsWith('wss://')) return;
      if (entry.relayUrl.includes('.onion')) return;

      if (!entry.isAlive) {
        deadPool.push(entry.relayUrl);
      } else if (entry.supportedNips.includes(50)) {
        nip50Pool.push(entry.relayUrl);
      } else {
        alivePool.push(entry.relayUrl);
      }
    });

    shuffle(deadPool);
    shuffle(alivePool);
    shuffle(nip50Pool);

    add(deadPool.slice(0, deadTarget));
    add(nip50Pool.slice(0, nip50Target));
    add(alivePool.slice(0, aliveTarget));
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('NIP-66 Before/After Benchmark');
  console.log(`  Iterations: ${ITERATIONS}`);
  console.log(`  Search:     ${RUN_SEARCH ? `${searchQueries.length} queries x ${SEARCH_ITERATIONS} iterations` : 'off (use --search to enable)'}`);

  // Connect NDK
  console.log('\nConnecting to NDK...');
  const connectedCount = await connectNdk();
  console.log(`  Connected relays: ${connectedCount}`);

  if (connectedCount === 0) {
    console.error('\n  FATAL: Could not connect to any relays. Check network.');
    process.exit(1);
  }

  // Fetch NIP-66 monitor data
  console.log('\nFetching NIP-66 monitor data...');
  const monitorCache = await fetchMonitorData();
  console.log(`  Received ${monitorCache.size} entries.`);

  // Count dead relays in monitor data
  let totalDead = 0;
  Array.from(monitorCache.values()).forEach(e => { if (!e.isAlive) totalDead++; });
  console.log(`  Dead relays in monitor data: ${totalDead}`);

  // Build candidate list (uses monitor data to inject dead relays)
  const candidates = buildCandidateList(monitorCache);
  console.log(`\n  Candidates: ${candidates.length} relays\n`);

  for (const url of candidates) {
    const entry = monitorCache.get(url);
    const tag = entry ? (entry.isAlive ? ' [alive]' : ' [dead]') : ' [no data]';
    console.log(`    ${url}${tag}`);
  }

  // Print monitor stats
  printMonitorStats(monitorCache, candidates);

  // NIP-66 relay discovery stats
  printHeader('NIP-66 Relay Discovery');
  const hardcodedSearch = new Set(RELAYS.SEARCH.map(normalizeRelayUrl));
  const discoveredNip50: string[] = [];
  Array.from(monitorCache.values()).forEach(entry => {
    if (entry.isAlive && entry.supportedNips.includes(50) && !hardcodedSearch.has(entry.relayUrl)) {
      discoveredNip50.push(entry.relayUrl);
    }
  });
  console.log(`  Hardcoded SEARCH relays:          ${RELAYS.SEARCH.length}`);
  console.log(`  NIP-50 relays discovered via NIP-66: ${discoveredNip50.length} (beyond hardcoded list)`);
  if (discoveredNip50.length > 0) {
    console.log('  Newly discovered NIP-50 relays:');
    for (const url of discoveredNip50.slice(0, 20)) {
      console.log(`    ${url}`);
    }
    if (discoveredNip50.length > 20) {
      console.log(`    ... and ${discoveredNip50.length - 20} more`);
    }
  }

  // Warmup iteration (not measured)
  console.log('\nRunning warmup iteration (Phase A)...');
  await runPhaseA(candidates);
  console.log('  Warmup complete.');

  // Measured iterations
  const phaseAResults: PhaseResult[] = [];
  const phaseBResults: PhaseBResult[] = [];

  for (let i = 0; i < ITERATIONS; i++) {
    console.log(`\nIteration ${i + 1}/${ITERATIONS}...`);

    const a = await runPhaseA(candidates);
    phaseAResults.push(a);
    console.log(`  Phase A: ${ms(a.wallClockMs)} (${a.nip50Relays.length} NIP-50)`);

    const b = await runPhaseB(candidates, monitorCache);
    phaseBResults.push(b);
    console.log(`  Phase B: ${ms(b.wallClockMs)} (${b.nip50Relays.length} NIP-50, ${b.deadFiltered.length} dead, ${b.fastPathHits.length} fast)`);
  }

  // Print detailed results from last iteration
  const lastA = phaseAResults[phaseAResults.length - 1];
  const lastB = phaseBResults[phaseBResults.length - 1];

  printHeader('Phase A — HTTP-only (no NIP-66)');
  printPhaseAResult('Last iteration', lastA);
  printProbeDetails('Phase A', lastA.probes);

  printHeader('Phase B — NIP-66 pre-filtering + fast path');
  printPhaseBResult('Last iteration', lastB);
  printProbeDetails('Phase B', lastB.probes);

  // Recall comparison (last iteration)
  printRecallComparison(lastA, lastB);

  // Check probe failure rate
  const failRate = lastA.probeCount > 0
    ? (lastA.failCount + lastA.timeoutCount) / lastA.probeCount
    : 0;
  if (failRate > 0.5) {
    console.log(`\n  NOTE: >${Math.round(failRate * 100)}% of Phase A probes failed. This may indicate a local firewall or network issue.`);
  }

  // Phase D — WebSocket connection timing
  printHeader('Phase D — WebSocket Connection Timing');
  console.log('  Measuring WebSocket connection establishment with and without NIP-66 filtering...\n');

  // Pick relays to test: all wss:// candidates (skip localhost/onion)
  const wssCandidates = candidates.filter(url => url.startsWith('wss://'));

  // D-A: Connect to ALL candidates (no filtering)
  {
    console.log(`  D-A: Connecting to ALL ${wssCandidates.length} candidates...`);
    const ndkAll = new NDK({
      explicitRelayUrls: wssCandidates,
      clientName: 'Ants-Bench-DA',
    });

    const startA = performance.now();
    ndkAll.connect().catch(() => {});

    // Wait for connections with 15s deadline
    const deadlineA = Date.now() + 15_000;
    let connectedA = 0;
    while (Date.now() < deadlineA) {
      connectedA = 0;
      if (ndkAll.pool?.relays) {
        Array.from(ndkAll.pool.relays.values()).forEach(r => {
          if (r.status === NDK_RELAY_STATUS_CONNECTED) connectedA++;
        });
      }
      // Stop early once all possible connections are established or stabilized
      if (connectedA >= wssCandidates.length) break;
      await new Promise(r => setTimeout(r, 500));
    }
    const timeA = performance.now() - startA;

    // Count final status
    let failedA = 0;
    let connectingA = 0;
    if (ndkAll.pool?.relays) {
      Array.from(ndkAll.pool.relays.values()).forEach(r => {
        if (r.status === NDK_RELAY_STATUS_CONNECTED) { /* already counted */ }
        else if (r.status === 4) connectingA++;  // CONNECTING
        else failedA++;
      });
    }

    console.log(`    Time:       ${ms(timeA)}`);
    console.log(`    Connected:  ${connectedA}/${wssCandidates.length}`);
    console.log(`    Failed:     ${failedA}`);
    console.log(`    Still connecting: ${connectingA}`);

    // Clean up
    try {
      if (ndkAll.pool?.relays) {
        Array.from(ndkAll.pool.relays.values()).forEach(r => {
          try { r.disconnect(); } catch {}
        });
      }
    } catch {}

    // D-B: Connect to only NIP-66-filtered candidates
    const { live: filteredCandidates, dead: wsDeadFiltered } = filterDeadRelays(wssCandidates, monitorCache);

    console.log(`\n  D-B: Connecting to ${filteredCandidates.length} filtered candidates (${wsDeadFiltered.length} dead removed)...`);

    const ndkFiltered = new NDK({
      explicitRelayUrls: filteredCandidates,
      clientName: 'Ants-Bench-DB',
    });

    const startB = performance.now();
    ndkFiltered.connect().catch(() => {});

    const deadlineB = Date.now() + 15_000;
    let connectedB = 0;
    while (Date.now() < deadlineB) {
      connectedB = 0;
      if (ndkFiltered.pool?.relays) {
        Array.from(ndkFiltered.pool.relays.values()).forEach(r => {
          if (r.status === NDK_RELAY_STATUS_CONNECTED) connectedB++;
        });
      }
      if (connectedB >= filteredCandidates.length) break;
      await new Promise(r => setTimeout(r, 500));
    }
    const timeB = performance.now() - startB;

    let failedB = 0;
    let connectingB = 0;
    if (ndkFiltered.pool?.relays) {
      Array.from(ndkFiltered.pool.relays.values()).forEach(r => {
        if (r.status === NDK_RELAY_STATUS_CONNECTED) { /* already counted */ }
        else if (r.status === 4) connectingB++;
        else failedB++;
      });
    }

    console.log(`    Time:       ${ms(timeB)}`);
    console.log(`    Connected:  ${connectedB}/${filteredCandidates.length}`);
    console.log(`    Failed:     ${failedB}`);
    console.log(`    Still connecting: ${connectingB}`);

    // Clean up
    try {
      if (ndkFiltered.pool?.relays) {
        Array.from(ndkFiltered.pool.relays.values()).forEach(r => {
          try { r.disconnect(); } catch {}
        });
      }
    } catch {}

    // Summary
    const savings = timeA - timeB;
    const pct = timeA > 0 ? (savings / timeA) * 100 : 0;
    console.log(`\n  WebSocket Connection Summary`);
    console.log(`  ${'─'.repeat(50)}`);
    console.log(`  ${pad('Metric', 28)} ${rpad('Unfiltered', 14)} ${rpad('NIP-66', 14)}`);
    console.log(`  ${pad('Relays attempted', 28)} ${rpad(String(wssCandidates.length), 14)} ${rpad(String(filteredCandidates.length), 14)}`);
    console.log(`  ${pad('Dead filtered', 28)} ${rpad('0', 14)} ${rpad(String(wsDeadFiltered.length), 14)}`);
    console.log(`  ${pad('Connected', 28)} ${rpad(String(connectedA), 14)} ${rpad(String(connectedB), 14)}`);
    console.log(`  ${pad('Connection time', 28)} ${rpad(ms(timeA), 14)} ${rpad(ms(timeB), 14)}`);
    if (savings > 0) {
      console.log(`\n  NIP-66 pre-connection filtering saves ${ms(savings)} (${pct.toFixed(1)}%).`);
      console.log('  Dead relays cause WebSocket timeouts (10-30s). Filtering them before connecting avoids this cost entirely.');
    } else {
      console.log(`\n  No time savings observed. Dead relays may have fast-failed or all candidates are alive.`);
    }
  }

  // Phase C — Search (opt-in)
  if (RUN_SEARCH) {
    printHeader(`Phase C — Search Comparison (${SEARCH_ITERATIONS} iterations x ${searchQueries.length} queries)`);

    interface QueryStats {
      query: string;
      aEoseTimes: number[];
      bEoseTimes: number[];
      aFirstTimes: number[];
      bFirstTimes: number[];
      aResults: number[];
      bResults: number[];
      aTimedOut: number;
      bTimedOut: number;
    }

    const allQueryStats: QueryStats[] = [];

    for (const query of searchQueries) {
      const qs: QueryStats = {
        query,
        aEoseTimes: [], bEoseTimes: [],
        aFirstTimes: [], bFirstTimes: [],
        aResults: [], bResults: [],
        aTimedOut: 0, bTimedOut: 0,
      };

      const truncated = query.length > 30 ? query.slice(0, 30) + '...' : query;
      console.log(`\n  Query: "${truncated}" (${SEARCH_ITERATIONS} iterations)`);

      for (let i = 0; i < SEARCH_ITERATIONS; i++) {
        const searchA = await runSearchPhase(lastA.nip50Relays, query);
        const searchB = await runSearchPhase(lastB.nip50Relays, query);

        if (searchA.timeToEoseMs !== null) qs.aEoseTimes.push(searchA.timeToEoseMs);
        if (searchB.timeToEoseMs !== null) qs.bEoseTimes.push(searchB.timeToEoseMs);
        if (searchA.timeToFirstResultMs !== null) qs.aFirstTimes.push(searchA.timeToFirstResultMs);
        if (searchB.timeToFirstResultMs !== null) qs.bFirstTimes.push(searchB.timeToFirstResultMs);
        qs.aResults.push(searchA.totalResults);
        qs.bResults.push(searchB.totalResults);
        if (searchA.timedOut) qs.aTimedOut++;
        if (searchB.timedOut) qs.bTimedOut++;

        const aEose = searchA.timeToEoseMs !== null ? ms(searchA.timeToEoseMs) : 'timeout';
        const bEose = searchB.timeToEoseMs !== null ? ms(searchB.timeToEoseMs) : 'timeout';
        console.log(`    ${i + 1}/${SEARCH_ITERATIONS}  A: ${aEose} (${searchA.totalResults} events)  B: ${bEose} (${searchB.totalResults} events)`);
      }

      allQueryStats.push(qs);
    }

    // Aggregate search summary
    const median = (arr: number[]) => {
      if (arr.length === 0) return NaN;
      const s = [...arr].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };

    printHeader('Phase C — Search Summary');
    console.log(`\n  ${pad('Query', 35)} ${rpad('A EOSE', 10)} ${rpad('B EOSE', 10)} ${rpad('A evts', 8)} ${rpad('B evts', 8)} ${rpad('A t/o', 5)} ${rpad('B t/o', 5)}`);
    console.log(`  ${'─'.repeat(81)}`);

    let totalAEose: number[] = [];
    let totalBEose: number[] = [];
    let totalAResults: number[] = [];
    let totalBResults: number[] = [];

    for (const qs of allQueryStats) {
      const truncated = qs.query.length > 33 ? qs.query.slice(0, 33) + '..' : qs.query;
      const aEoseMedian = median(qs.aEoseTimes);
      const bEoseMedian = median(qs.bEoseTimes);
      const aResultMedian = median(qs.aResults);
      const bResultMedian = median(qs.bResults);

      console.log(`  ${pad(truncated, 35)} ${rpad(isNaN(aEoseMedian) ? 'N/A' : ms(aEoseMedian), 10)} ${rpad(isNaN(bEoseMedian) ? 'N/A' : ms(bEoseMedian), 10)} ${rpad(isNaN(aResultMedian) ? 'N/A' : String(aResultMedian), 8)} ${rpad(isNaN(bResultMedian) ? 'N/A' : String(bResultMedian), 8)} ${rpad(String(qs.aTimedOut), 5)} ${rpad(String(qs.bTimedOut), 5)}`);

      totalAEose.push(...qs.aEoseTimes);
      totalBEose.push(...qs.bEoseTimes);
      totalAResults.push(...qs.aResults);
      totalBResults.push(...qs.bResults);
    }

    console.log(`  ${'─'.repeat(81)}`);
    const aggAEose = median(totalAEose);
    const aggBEose = median(totalBEose);
    const aggAResults = median(totalAResults);
    const aggBResults = median(totalBResults);
    console.log(`  ${pad('AGGREGATE (median)', 35)} ${rpad(isNaN(aggAEose) ? 'N/A' : ms(aggAEose), 10)} ${rpad(isNaN(aggBEose) ? 'N/A' : ms(aggBEose), 10)} ${rpad(isNaN(aggAResults) ? 'N/A' : String(aggAResults), 8)} ${rpad(isNaN(aggBResults) ? 'N/A' : String(aggBResults), 8)}`);

    if (!isNaN(aggAEose) && !isNaN(aggBEose)) {
      const diff = aggAEose - aggBEose;
      const pct = aggAEose > 0 ? (diff / aggAEose) * 100 : 0;
      if (Math.abs(pct) < 5) {
        console.log(`\n  Search EOSE times are within noise (${Math.abs(pct).toFixed(1)}% difference).`);
        console.log('  NIP-66 benefit is in relay discovery, not search speed — both phases query the same NIP-50 relays.');
      } else if (pct > 0) {
        console.log(`\n  Phase B EOSE is ${pct.toFixed(1)}% faster (median).`);
      } else {
        console.log(`\n  Phase B EOSE is ${(-pct).toFixed(1)}% slower (median).`);
      }
    }

    if (!isNaN(aggAResults) && !isNaN(aggBResults)) {
      const diff = aggBResults - aggAResults;
      if (diff > 0) {
        console.log(`  Phase B returns ${diff} more events (median) — the extra NIP-50 relay contributes results.`);
      } else if (diff < 0) {
        console.log(`  Phase B returns ${-diff} fewer events (median) — investigate recall loss.`);
      } else {
        console.log('  Event counts are identical between phases.');
      }
    }
  }

  // Summary table
  printSummaryTable(phaseAResults, phaseBResults);

  console.log('\nDone.\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
