import { hasLocalStorage, loadArrayFromStorage } from './storageCache';

const SEARCH_RELAYS_KEY = 'ants_search_relays';
const LOCAL_RELAYS_PREFIX = 'ants_search_local_relays:';

export function getUserRelayAdditions(): string[] {
  const overrides = loadArrayFromStorage(SEARCH_RELAYS_KEY);
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const relay of overrides) {
    const trimmed = relay.trim();
    if (!trimmed) continue;
    const url = trimmed.startsWith('wss://') ? trimmed : `wss://${trimmed}`;
    if (!seen.has(url)) {
      seen.add(url);
      normalized.push(url);
    }
  }

  return normalized;
}

/** Whether the user wants to include their own local/LAN relays in searches.
 *  Scoped per pubkey. Defaults to true (checked) when no value is stored. */
export function getSearchLocalRelays(pubkey?: string | null): boolean {
  if (!pubkey || !hasLocalStorage()) return false;
  const val = localStorage.getItem(LOCAL_RELAYS_PREFIX + pubkey);
  if (val === null) return true; // default: enabled
  return val === 'true';
}

export function setSearchLocalRelays(pubkey: string | null | undefined, enabled: boolean): void {
  if (!pubkey || !hasLocalStorage()) return;
  localStorage.setItem(LOCAL_RELAYS_PREFIX + pubkey, String(enabled));
}

