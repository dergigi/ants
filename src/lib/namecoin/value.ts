/**
 * JSON value extraction for Namecoin name records.
 *
 * Knows how to pull a Nostr pubkey + optional relay list out of the
 * three shipped wire shapes (simple, extended-domain, identity), and
 * how to walk ifa-0001 `import` directives. Split out of `nip05.ts`
 * to keep that module under the 420-line repository limit.
 */
import type { ParsedIdentifier } from './identifier';

const HEX_PUBKEY_RE = /^[0-9a-fA-F]{64}$/;

export type NamecoinResolveResult = {
  pubkey: string;
  relays?: string[];
};

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
        .map((v) =>
          typeof v === 'string'
            ? v
            : Array.isArray(v) && typeof v[0] === 'string'
              ? v[0]
              : null,
        )
        .filter((v): v is string => Boolean(v));
    }
  } catch {
    // ignore
  }
  return [];
}
