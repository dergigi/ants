/**
 * Namecoin `OP_NAME_UPDATE` script construction + parsing.
 *
 * Builds the index script used to derive the ElectrumX scripthash for
 * a name, and parses `name_update` vouts back into `{ name, value }`
 * pairs. Split out of `nip05.ts` to keep that module under the
 * 420-line repository limit.
 */
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';

import { hexToBytes } from './hex';

/** Namecoin script opcodes used by the name-index script. */
const OP_NAME_UPDATE = 0x53;
const OP_2DROP = 0x6d;
const OP_DROP = 0x75;
const OP_RETURN = 0x6a;
const OP_PUSHDATA1 = 0x4c;
const OP_PUSHDATA2 = 0x4d;
const OP_PUSHDATA4 = 0x4e;

export function buildNameIndexScript(nameBytes: Uint8Array): Uint8Array {
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
export function electrumScriptHash(script: Uint8Array): string {
  const digest = sha256(script);
  const reversed = new Uint8Array(digest.length);
  for (let i = 0; i < digest.length; i++) reversed[i] = digest[digest.length - 1 - i];
  return bytesToHex(reversed);
}

export function extractNameValue(
  vouts: Array<{ scriptPubKey?: { hex?: string } }>,
  name: string,
): string | null {
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

export function parseNameScript(script: Uint8Array): { name: string; value: string } | null {
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
