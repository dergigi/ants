import { loadArrayFromStorage } from './storageCache';

const SEARCH_RELAYS_KEY = 'ants_search_relays';

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

