import { hasLocalStorage, loadArrayFromStorage } from './storageCache';

const SEARCH_RELAYS_KEY = 'ants_search_relays';
const LOCAL_RELAYS_KEY = 'ants_search_local_relays';

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

/** Whether the user wants to include their own local/LAN relays in searches. */
export function getSearchLocalRelays(): boolean {
  if (!hasLocalStorage()) return false;
  const val = localStorage.getItem(LOCAL_RELAYS_KEY);
  return val === 'true';
}

export function setSearchLocalRelays(enabled: boolean): void {
  if (!hasLocalStorage()) return;
  localStorage.setItem(LOCAL_RELAYS_KEY, String(enabled));
}

