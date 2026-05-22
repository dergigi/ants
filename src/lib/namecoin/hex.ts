/**
 * Hex byte helpers used by the Namecoin script parser.
 *
 * Split out of `nip05.ts` to keep that module under the 420-line
 * repository limit. Strict: every nibble must be a valid hex digit
 * — `parseInt`'s prefix-parsing behaviour (where `'0g'` silently
 * decodes to `0`) is rejected.
 */

const HEX_PAIR_RE = /^[0-9a-fA-F]{2}$/;

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('hex: odd length');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const pair = hex.slice(i * 2, i * 2 + 2);
    if (!HEX_PAIR_RE.test(pair)) throw new Error('hex: invalid byte');
    out[i] = parseInt(pair, 16);
  }
  return out;
}
