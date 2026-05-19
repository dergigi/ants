/**
 * NIP-05 resolution for Namecoin `.bit` identifiers.
 *
 * Resolves identifiers rooted in the Namecoin blockchain by querying a
 * public ElectrumX server over WSS, parsing the most recent
 * `name_update` transaction for `d/<domain>` or `id/<name>`, and
 * extracting the `nostr` field.
 *
 * Accepted identifier shapes:
 *
 *   - `alice@example.bit`
 *   - `example.bit`          (uses the `_` root entry)
 *   - `d/example`            (domain namespace)
 *   - `id/alice`             (identity namespace)
 *   - a `nostr:` NIP-21 URI prefix is tolerated
 *
 * The resolver mirrors the parallel ports in Amethyst (Kotlin), Nostur
 * (Swift), nostr-tools PR #533 (JS), Jumble PR #774 (JS) and
 * dart-nostr PR #44 (Dart). Wire format follows ifa-0001 Domain Name
 * Object semantics: `nostr.names[<localpart>]` for `d/` names,
 * `nostr.pubkey` for `id/` names, with relays optionally surfaced via
 * `nostr.relays`.
 *
 * The shipped {@link DEFAULT_ELECTRUMX_SERVERS} list points at the
 * long-running public Namecoin ElectrumX operators. Both currently
 * serve self-signed TLS certificates so direct browser use will fail
 * the TLS handshake; the server-side API route in
 * `src/app/api/nip05/verify/route.ts` is the recommended entry point.
 */
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';

/** A pluggable WebSocket implementation. Must match the browser API. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WebSocketCtor = any;

let _WebSocket: WebSocketCtor;
try {
  _WebSocket = (globalThis as { WebSocket?: WebSocketCtor }).WebSocket;
} catch {
  _WebSocket = undefined;
}

/**
 * Inject a WebSocket implementation. Useful in Node (where the global
 * WebSocket may be missing on older versions) or when you need to pin
 * a self-signed cert via a wrapped `ws` constructor.
 */
export function useWebSocketImplementation(impl: WebSocketCtor): void {
  _WebSocket = impl;
}

/** A single Namecoin ElectrumX endpoint. */
export type ElectrumXServer = {
  /** Hostname, e.g. `electrum.nmc.ethicnology.com`. */
  host: string;
  /** Port, e.g. `50004` for the WSS endpoint. */
  port: number;
  /** WSS path. Defaults to `/`. */
  path?: string;
};

/**
 * Default list of Namecoin ElectrumX WSS endpoints, tried in order.
 * Mirrors amethyst's `quartz/.../namecoin/ElectrumXServer.kt`
 * `DEFAULT_ELECTRUMX_SERVERS` (4-of-6 subset): amethyst additionally
 * carries two bare-IP entries (`23.158.233.10`, `46.229.238.187`)
 * for the JVM TLS path, but browsers refuse WSS to bare IPs without
 * an IP-SAN cert so we intentionally omit them here.
 *
 * Most operators serve self-signed TLS certs today; in the browser
 * those will fail until either operator switches to a CA-issued cert
 * or the caller injects a WebSocket implementation that trusts the
 * pinned cert. Server-side (Node), the API route can dial these
 * directly because Node's TLS stack accepts the self-signed CA via
 * the `ws` peer dependency plus a pinned-cert wrapper. The last
 * entry (`electrum.nmc.ethicnology.com`) ships a Let's Encrypt cert,
 * so it is the easiest one to reach from a browser today.
 */
export const DEFAULT_ELECTRUMX_SERVERS: ElectrumXServer[] = [
  { host: 'electrumx.testls.space', port: 50004 },
  { host: 'nmc2.bitcoins.sk', port: 57004 },
  { host: 'relay.testls.bit', port: 50004 },
  { host: 'electrum.nmc.ethicnology.com', port: 50004 },
];

/** Blocks until a Namecoin name expires (~250 days). */
const NAME_EXPIRE_DEPTH = 36000;

const HEX_PUBKEY_RE = /^[0-9a-fA-F]{64}$/;

/**
 * Returns `true` when `identifier` should be routed to Namecoin
 * resolution instead of DNS-based NIP-05.
 */
export function isValidIdentifier(identifier?: string | null): boolean {
  if (!identifier) return false;
  let s = identifier.trim().toLowerCase();
  if (s.startsWith('nostr:')) s = s.slice(6);
  if (s.startsWith('d/') || s.startsWith('id/')) return s.length > 2 + 1;
  return s.endsWith('.bit') && s.length > 4;
}

/** Alias for {@link isValidIdentifier}. */
export const isDotBit = isValidIdentifier;

export type ParsedIdentifier = {
  /** The underlying Namecoin name, e.g. `d/example` or `id/alice`. */
  namecoinName: string;
  /** The local-part within the name value, e.g. `alice` or `_`. */
  localPart: string;
  /** True for `d/` names (domain + `names` map), false for `id/` names. */
  isDomain: boolean;
};

export function parseIdentifier(raw: string): ParsedIdentifier | null {
  let input = raw.trim();
  if (input.length >= 6 && input.slice(0, 6).toLowerCase() === 'nostr:') {
    input = input.slice(6);
  }
  const lower = input.toLowerCase();

  if (lower.startsWith('d/')) {
    const name = lower.slice(2);
    if (!name) return null;
    return { namecoinName: lower, localPart: '_', isDomain: true };
  }
  if (lower.startsWith('id/')) {
    const name = lower.slice(3);
    if (!name) return null;
    return { namecoinName: lower, localPart: '_', isDomain: false };
  }

  // user@domain.bit
  if (input.includes('@') && lower.endsWith('.bit')) {
    const atIdx = input.indexOf('@');
    const local = input.slice(0, atIdx).toLowerCase() || '_';
    const domain = input
      .slice(atIdx + 1)
      .toLowerCase()
      .replace(/\.bit$/, '');
    if (!domain) return null;
    return { namecoinName: 'd/' + domain, localPart: local, isDomain: true };
  }

  // bare.bit
  if (lower.endsWith('.bit')) {
    const domain = lower.replace(/\.bit$/, '');
    if (!domain) return null;
    return { namecoinName: 'd/' + domain, localPart: '_', isDomain: true };
  }

  return null;
}

export type NamecoinResolveResult = {
  pubkey: string;
  relays?: string[];
};

/**
 * Resolve a `.bit` / `d/` / `id/` identifier to a Nostr profile pointer.
 *
 * Returns `null` if the identifier shape is invalid, the name is not
 * registered (or expired), the value lacks a valid `nostr` field, or
 * every configured server failed.
 */
export async function queryProfile(
  identifier: string,
  servers: ElectrumXServer[] = DEFAULT_ELECTRUMX_SERVERS,
): Promise<NamecoinResolveResult | null> {
  const parsed = parseIdentifier(identifier);
  if (!parsed) return null;

  const valueJSON = await nameShowWithFallback(parsed.namecoinName, servers);
  if (!valueJSON) return null;

  return extractNostrFromValue(valueJSON, parsed);
}

/**
 * Verify that `pubkey` is bound to `identifier` on the Namecoin chain.
 * Returns `false` on any lookup failure.
 */
export async function isValid(pubkey: string, identifier: string): Promise<boolean> {
  const res = await queryProfile(identifier);
  return res ? res.pubkey.toLowerCase() === pubkey.toLowerCase() : false;
}

// ---------------------------------------------------------------------------
// ElectrumX transport (WSS)
// ---------------------------------------------------------------------------

/** Namecoin script opcodes used by the name-index script. */
const OP_NAME_UPDATE = 0x53;
const OP_2DROP = 0x6d;
const OP_DROP = 0x75;
const OP_RETURN = 0x6a;
const OP_PUSHDATA1 = 0x4c;
const OP_PUSHDATA2 = 0x4d;
const OP_PUSHDATA4 = 0x4e;

const textEncoder = new TextEncoder();

async function nameShowWithFallback(name: string, servers: ElectrumXServer[]): Promise<string | null> {
  let foundDefinitiveMiss = false;
  for (const srv of servers) {
    try {
      return await nameShow(name, srv);
    } catch (err) {
      if (err instanceof NameMissError) {
        foundDefinitiveMiss = true;
        continue;
      }
      // Transport error — try next server.
    }
  }
  if (foundDefinitiveMiss) return null;
  return null;
}

class NameMissError extends Error {}

async function nameShow(name: string, srv: ElectrumXServer): Promise<string | null> {
  if (!_WebSocket) {
    throw new Error(
      'namecoin/nip05: no WebSocket implementation available; call useWebSocketImplementation(impl).',
    );
  }

  const url = buildWSSUrl(srv);
  const rpc = new RPC(new _WebSocket(url));
  try {
    await rpc.opened;

    await rpc.call('server.version', ['ants/namecoin-nip05', '1.4']);

    const script = buildNameIndexScript(textEncoder.encode(name));
    const scriptHash = electrumScriptHash(script);
    const history = await rpc.call<Array<{ tx_hash: string; height: number }>>(
      'blockchain.scripthash.get_history',
      [scriptHash],
    );
    if (!history || history.length === 0) throw new NameMissError();
    const latest = history[history.length - 1];

    const tx = await rpc.call<{ vout: Array<{ scriptPubKey?: { hex?: string } }> }>(
      'blockchain.transaction.get',
      [latest.tx_hash, true],
    );

    let currentHeight = 0;
    try {
      const header = await rpc.call<{ height?: number }>('blockchain.headers.subscribe', []);
      if (header && typeof header.height === 'number') currentHeight = header.height;
    } catch {
      // Non-fatal: skip expiry check.
    }

    if (currentHeight > 0 && latest.height > 0 && currentHeight - latest.height >= NAME_EXPIRE_DEPTH) {
      return null; // expired
    }

    return extractNameValue(tx.vout, name);
  } finally {
    rpc.close();
  }
}

function buildWSSUrl(srv: ElectrumXServer): string {
  const path = srv.path ?? '/';
  return `wss://${srv.host}:${srv.port}${path.startsWith('/') ? path : '/' + path}`;
}

/** Minimal JSON-RPC-2.0 over WebSocket. */
class RPC {
  opened: Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ws: any;
  private id = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(ws: any) {
    this.ws = ws;
    this.opened = new Promise((resolve, reject) => {
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', () => reject(new Error('websocket error')));
      ws.addEventListener('close', () => {
        for (const p of this.pending.values()) p.reject(new Error('websocket closed'));
        this.pending.clear();
      });
    });
    ws.addEventListener('message', (ev: { data: unknown }) => this.onMessage(ev));
  }

  async call<T = unknown>(method: string, params: unknown[]): Promise<T> {
    const id = ++this.id;
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (v) => resolve(v as T), reject });
      try {
        this.ws.send(msg);
      } catch (e) {
        this.pending.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  private onMessage(ev: { data: unknown }): void {
    let parsed: { id?: number; result?: unknown; error?: unknown };
    try {
      const data =
        typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer);
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    if (typeof parsed.id !== 'number') return;
    const p = this.pending.get(parsed.id);
    if (!p) return;
    this.pending.delete(parsed.id);
    if (parsed.error) {
      p.reject(new Error(typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error)));
    } else {
      p.resolve(parsed.result);
    }
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Namecoin script: build index script, parse NAME_UPDATE vout
// ---------------------------------------------------------------------------

function buildNameIndexScript(nameBytes: Uint8Array): Uint8Array {
  const parts: number[] = [];
  parts.push(OP_NAME_UPDATE);
  pushData(parts, nameBytes);
  pushData(parts, new Uint8Array(0));
  parts.push(OP_2DROP, OP_DROP, OP_RETURN);
  return new Uint8Array(parts);
}

function pushData(out: number[], data: Uint8Array): void {
  const n = data.length;
  if (n < OP_PUSHDATA1) {
    out.push(n);
  } else if (n <= 0xff) {
    out.push(OP_PUSHDATA1, n);
  } else {
    out.push(OP_PUSHDATA2, n & 0xff, (n >> 8) & 0xff);
  }
  for (let i = 0; i < n; i++) out.push(data[i]);
}

/** SHA-256 of `script`, byte-reversed, hex-encoded. */
function electrumScriptHash(script: Uint8Array): string {
  const digest = sha256(script);
  const reversed = new Uint8Array(digest.length);
  for (let i = 0; i < digest.length; i++) reversed[i] = digest[digest.length - 1 - i];
  return bytesToHex(reversed);
}

function extractNameValue(vouts: Array<{ scriptPubKey?: { hex?: string } }>, name: string): string | null {
  for (const vout of vouts || []) {
    const hex = vout?.scriptPubKey?.hex;
    if (!hex || !hex.startsWith('53')) continue;
    let bytes: Uint8Array;
    try {
      bytes = hexToBytes(hex);
    } catch {
      continue;
    }
    const parsed = parseNameScript(bytes);
    if (!parsed) continue;
    if (parsed.name === name) return parsed.value;
  }
  return null;
}

function parseNameScript(script: Uint8Array): { name: string; value: string } | null {
  if (script.length === 0 || script[0] !== OP_NAME_UPDATE) return null;
  let pos = 1;
  const nameRead = readPushData(script, pos);
  if (!nameRead) return null;
  pos = nameRead.next;
  const valueRead = readPushData(script, pos);
  if (!valueRead) return null;
  const decoder = new TextDecoder('utf-8', { fatal: false });
  return {
    name: decoder.decode(nameRead.data),
    value: decoder.decode(valueRead.data),
  };
}

function readPushData(script: Uint8Array, pos: number): { data: Uint8Array; next: number } | null {
  if (pos >= script.length) return null;
  const op = script[pos];

  if (op === 0x00) return { data: new Uint8Array(0), next: pos + 1 };
  if (op < OP_PUSHDATA1) {
    const length = op;
    const end = pos + 1 + length;
    if (end > script.length) return null;
    return { data: script.slice(pos + 1, end), next: end };
  }
  if (op === OP_PUSHDATA1) {
    if (pos + 2 > script.length) return null;
    const length = script[pos + 1];
    const end = pos + 2 + length;
    if (end > script.length) return null;
    return { data: script.slice(pos + 2, end), next: end };
  }
  if (op === OP_PUSHDATA2) {
    if (pos + 3 > script.length) return null;
    const length = script[pos + 1] | (script[pos + 2] << 8);
    const end = pos + 3 + length;
    if (end > script.length) return null;
    return { data: script.slice(pos + 3, end), next: end };
  }
  if (op === OP_PUSHDATA4) {
    if (pos + 5 > script.length) return null;
    const length =
      script[pos + 1] |
      (script[pos + 2] << 8) |
      (script[pos + 3] << 16) |
      (script[pos + 4] << 24);
    const end = pos + 5 + length;
    if (end < 0 || end > script.length) return null;
    return { data: script.slice(pos + 5, end), next: end };
  }
  return null;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('hex: odd length');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const b = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(b)) throw new Error('hex: invalid byte');
    out[i] = b;
  }
  return out;
}

// ---------------------------------------------------------------------------
// JSON value extraction
// ---------------------------------------------------------------------------

/**
 * Pull the `nostr` pubkey and optional relay list out of a Namecoin
 * name value. Supports the simple `"nostr": "hex"` form and the
 * extended `"nostr": { "names": {...}, "relays": {...} }` form, as
 * well as the `id/` identity object shape (`{ "nostr": { "pubkey":
 * "...", "relays": [...] } }`).
 *
 * Also walks `import` items (ifa-0001 import semantics): if the
 * record's `nostr` field is missing or empty but it carries an
 * `import` directive, callers may chase those out-of-band. We expose
 * the import list via {@link extractImports} for that path.
 */
export function extractNostrFromValue(
  valueJSON: string,
  parsed: ParsedIdentifier,
): NamecoinResolveResult | null {
  let root: Record<string, unknown>;
  try {
    root = JSON.parse(valueJSON) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (typeof root !== 'object' || root === null) return null;

  const nostrField = root['nostr'];
  if (nostrField === undefined || nostrField === null) return null;

  // Simple form: "nostr": "hex-pubkey"
  if (typeof nostrField === 'string') {
    if (parsed.isDomain && parsed.localPart !== '_') return null;
    if (!HEX_PUBKEY_RE.test(nostrField)) return null;
    return { pubkey: nostrField.toLowerCase() };
  }

  if (typeof nostrField !== 'object') return null;
  const obj = nostrField as Record<string, unknown>;

  if (parsed.isDomain) {
    return extractFromDomainNamesObject(obj, parsed);
  }
  return extractFromIdentityObject(obj);
}

function extractFromDomainNamesObject(
  obj: Record<string, unknown>,
  parsed: ParsedIdentifier,
): NamecoinResolveResult | null {
  const names = obj['names'];
  if (typeof names !== 'object' || names === null) return null;
  const namesMap = names as Record<string, unknown>;

  let pickedPubkey: string | null = null;

  const exact = namesMap[parsed.localPart];
  if (typeof exact === 'string' && HEX_PUBKEY_RE.test(exact)) {
    pickedPubkey = exact;
  } else {
    const underscore = namesMap['_'];
    if (typeof underscore === 'string' && HEX_PUBKEY_RE.test(underscore)) {
      pickedPubkey = underscore;
    } else if (parsed.localPart === '_') {
      for (const v of Object.values(namesMap)) {
        if (typeof v === 'string' && HEX_PUBKEY_RE.test(v)) {
          pickedPubkey = v;
          break;
        }
      }
    }
  }

  if (!pickedPubkey) return null;
  const relays = extractRelays(obj, pickedPubkey);
  return relays
    ? { pubkey: pickedPubkey.toLowerCase(), relays }
    : { pubkey: pickedPubkey.toLowerCase() };
}

function extractFromIdentityObject(obj: Record<string, unknown>): NamecoinResolveResult | null {
  const pk = obj['pubkey'];
  if (typeof pk === 'string' && HEX_PUBKEY_RE.test(pk)) {
    const relaysRaw = obj['relays'];
    if (Array.isArray(relaysRaw)) {
      const relays = relaysRaw.filter((r): r is string => typeof r === 'string');
      return relays.length > 0
        ? { pubkey: pk.toLowerCase(), relays }
        : { pubkey: pk.toLowerCase() };
    }
    return { pubkey: pk.toLowerCase() };
  }

  // Fall back to NIP-05-like "names" with "_" root.
  const names = obj['names'];
  if (typeof names === 'object' && names !== null) {
    const underscore = (names as Record<string, unknown>)['_'];
    if (typeof underscore === 'string' && HEX_PUBKEY_RE.test(underscore)) {
      const relays = extractRelays(obj, underscore);
      return relays
        ? { pubkey: underscore.toLowerCase(), relays }
        : { pubkey: underscore.toLowerCase() };
    }
  }

  return null;
}

function extractRelays(obj: Record<string, unknown>, pubkey: string): string[] | null {
  const raw = obj['relays'];
  if (!raw) return null;
  // Domain shape: `relays` is a map keyed by pubkey -> array.
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const map = raw as Record<string, unknown>;
    const candidate = map[pubkey.toLowerCase()] ?? map[pubkey];
    if (!Array.isArray(candidate)) return null;
    const relays = candidate.filter((r): r is string => typeof r === 'string');
    return relays.length > 0 ? relays : null;
  }
  // Identity shape: `relays` is a flat array.
  if (Array.isArray(raw)) {
    const relays = raw.filter((r): r is string => typeof r === 'string');
    return relays.length > 0 ? relays : null;
  }
  return null;
}

/**
 * Pull the `import` list out of a Namecoin name value, for callers
 * that want to walk ifa-0001 import directives.
 */
export function extractImports(valueJSON: string): string[] {
  try {
    const root = JSON.parse(valueJSON) as Record<string, unknown>;
    const imp = root?.['import'];
    if (typeof imp === 'string') return [imp];
    if (Array.isArray(imp)) {
      return imp
        .map((v) => (typeof v === 'string' ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : null))
        .filter((v): v is string => Boolean(v));
    }
  } catch {
    // ignore
  }
  return [];
}
