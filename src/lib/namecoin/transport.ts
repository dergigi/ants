/**
 * ElectrumX WSS transport for Namecoin name lookups.
 *
 * Holds the pluggable WebSocket constructor, the default server list,
 * the minimal JSON-RPC-2.0 client, and the `name_show` lookup that
 * walks ElectrumX `blockchain.scripthash.get_history` →
 * `blockchain.transaction.get`. Split out of `nip05.ts` to keep that
 * module under the 420-line repository limit.
 */
import { buildNameIndexScript, electrumScriptHash, extractNameValue } from './script';

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

const textEncoder = new TextEncoder();

/**
 * Look up a Namecoin name across `servers` in order, returning the
 * latest `name_update` value JSON string. Returns `null` if every
 * server says the name does not exist or every transport fails.
 */
export async function nameShowWithFallback(
  name: string,
  servers: ElectrumXServer[],
): Promise<string | null> {
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

    if (
      currentHeight > 0 &&
      latest.height > 0 &&
      currentHeight - latest.height >= NAME_EXPIRE_DEPTH
    ) {
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
      p.reject(
        new Error(typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error)),
      );
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
