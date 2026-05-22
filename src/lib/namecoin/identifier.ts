/**
 * Identifier parsing for Namecoin `.bit` NIP-05 lookups.
 *
 * Accepts:
 *   - `alice@example.bit`
 *   - `example.bit`          (uses the `_` root entry)
 *   - `d/example`            (domain namespace)
 *   - `id/alice`             (identity namespace)
 *   - a `nostr:` NIP-21 URI prefix is tolerated
 *
 * Split out of `nip05.ts` to keep that module under the 420-line
 * repository limit.
 */

/**
 * Returns `true` when `identifier` should be routed to Namecoin
 * resolution instead of DNS-based NIP-05.
 */
export function isValidIdentifier(identifier?: string | null): boolean {
  if (!identifier) return false;
  let s = identifier.trim().toLowerCase();
  if (s.startsWith('nostr:')) s = s.slice(6);
  // Keep behaviour aligned with parseIdentifier: any non-empty
  // name after the namespace prefix is accepted.
  if (s.startsWith('d/')) return s.length > 2;
  if (s.startsWith('id/')) return s.length > 3;
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
