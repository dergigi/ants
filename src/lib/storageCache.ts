// Lightweight unified helpers for localStorage-backed Map caches
// Safe to import in SSR; each function guards for browser presence.

export function hasLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function loadMapFromStorage<T>(storageKey: string): Map<string, T> {
  const map = new Map<string, T>();
  if (!hasLocalStorage()) return map;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return map;
    const obj = JSON.parse(raw) as Record<string, T>;
    for (const [k, v] of Object.entries(obj)) map.set(k, v);
    return map;
  } catch {
    return map;
  }
}

export function saveMapToStorage<T>(storageKey: string, map: Map<string, T>): void {
  if (!hasLocalStorage()) return;
  try {
    const obj = Object.fromEntries(map);
    window.localStorage.setItem(storageKey, JSON.stringify(obj));
  } catch {
    // ignore
  }
}

export function clearStorageKey(storageKey: string): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // ignore
  }
}

