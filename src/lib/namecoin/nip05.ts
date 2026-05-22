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
 * long-running public Namecoin ElectrumX operators. Most currently
 * serve self-signed TLS certificates so direct browser use will fail
 * the TLS handshake; the server-side API route in
 * `src/app/api/nip05/verify/route.ts` is the recommended entry point.
 *
 * This module is the orchestration layer. The pieces live in:
 *
 *   - `identifier.ts` — shape validation + parsing
 *   - `transport.ts`  — WSS / ElectrumX / `name_show`
 *   - `script.ts`     — `OP_NAME_UPDATE` build + parse
 *   - `value.ts`      — JSON value extraction
 *   - `hex.ts`        — strict hex byte helpers
 */
import { parseIdentifier } from './identifier';
import {
  DEFAULT_ELECTRUMX_SERVERS,
  nameShowWithFallback,
  type ElectrumXServer,
} from './transport';
import { extractNostrFromValue, type NamecoinResolveResult } from './value';

export {
  isDotBit,
  isValidIdentifier,
  parseIdentifier,
  type ParsedIdentifier,
} from './identifier';
export {
  DEFAULT_ELECTRUMX_SERVERS,
  useWebSocketImplementation,
  type ElectrumXServer,
} from './transport';
export { extractImports, extractNostrFromValue, type NamecoinResolveResult } from './value';

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
 * Returns `false` on any lookup failure. Honours `servers` so callers
 * stay on the same server set across the resolve + verify path.
 */
export async function isValid(
  pubkey: string,
  identifier: string,
  servers: ElectrumXServer[] = DEFAULT_ELECTRUMX_SERVERS,
): Promise<boolean> {
  const res = await queryProfile(identifier, servers);
  return res ? res.pubkey.toLowerCase() === pubkey.toLowerCase() : false;
}
