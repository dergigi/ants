import { prewarmSearchRelaySet } from '../relays';
import { loadRules } from './replacements';

/**
 * Kick off the work the first search would otherwise block on (NIP-50 relay
 * set resolution, search relay websockets, replacement rules) so it happens
 * while the user is still typing. Fire-and-forget.
 */
export function prewarmSearchRuntime(): void {
  prewarmSearchRelaySet();
  void loadRules().catch(() => {});
}
