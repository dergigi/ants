import NDKCacheAdapterSqliteWasm from '@nostr-dev-kit/ndk-cache-sqlite-wasm';
import { isBrowser } from '../utils/ssr';
import { ndk } from './index';

// SQLite (WASM) cache adapter — initialized lazily and only on the client
export const cacheAdapter = new NDKCacheAdapterSqliteWasm({
  dbName: 'ants-ndk-cache',
  wasmUrl: '/ndk/sql-wasm.wasm'
});

// sql.js throws a bare string ("Wrong API use: tried to bind a value of an
// unknown type") when a filter array contains undefined. NDK calls query()
// synchronously inside a setTimeout, so that throw is uncaught and used to
// disable the whole cache. Sanitize filters and degrade to a cache miss.
const sanitizeFilterArrays = (filters: Array<Record<string, unknown>>): void => {
  for (const filter of filters) {
    for (const key of Object.keys(filter)) {
      const value = filter[key];
      if (Array.isArray(value) && value.some((v) => v === undefined || v === null)) {
        console.warn('Dropping undefined values from filter before cache query:', key, JSON.stringify(filter));
        filter[key] = value.filter((v) => v !== undefined && v !== null);
      }
    }
  }
};

const originalQuery = cacheAdapter.query.bind(cacheAdapter);
cacheAdapter.query = ((subscription: Parameters<typeof originalQuery>[0]) => {
  try {
    sanitizeFilterArrays(subscription.filters as unknown as Array<Record<string, unknown>>);
    return originalQuery(subscription);
  } catch (error) {
    console.warn('Cache query failed, continuing without cached results:', error);
    return [];
  }
}) as typeof cacheAdapter.query;
let cacheInitialized = false;
let cacheDisabledDueToError = false;
let cacheErrorHandlersInstalled = false;

export function isUndefinedBindWasmError(error: unknown): boolean {
  try {
    const message = (error instanceof Error ? error.message : String(error || '')) || '';
    const lower = message.toLowerCase();
    // Heuristic match for sqlite wasm binding undefined issue
    return (
      lower.includes('wrong api use') && lower.includes('unknown type') && lower.includes('undefined')
    ) || lower.includes('tried to bind a value of an unknown type') || lower.includes('wasm cache adapter')
    || lower.includes('sqlite') && lower.includes('undefined') || lower.includes('binding') && lower.includes('undefined');
  } catch {
    return false;
  }
}

export function disableCacheAdapter(reason?: unknown): void {
  if (cacheDisabledDueToError) return;
  try {
    console.warn('Disabling NDK sqlite-wasm cache adapter due to runtime error; falling back to live relays only.', reason);
    ndk.cacheAdapter = undefined;
  } catch {}
  cacheDisabledDueToError = true;
}

export function isNoFiltersToMergeError(error: unknown): boolean {
  try {
    const message = (error instanceof Error ? error.message : String(error || '')) || '';
    return message.toLowerCase().includes('no filters to merge');
  } catch {
    return false;
  }
}

export async function ensureCacheInitialized(): Promise<void> {
  if (cacheInitialized) return;
  // Avoid initializing in SSR environments
  if (!isBrowser()) { cacheInitialized = true; return; }

  // Install global error handlers first to catch any initialization errors
  if (!cacheErrorHandlersInstalled && typeof window !== 'undefined') {
    try {
      const suppressKnownCacheError = (event: { preventDefault?: () => void; stopImmediatePropagation?: () => void } | undefined) => {
        try { event?.preventDefault?.(); } catch {}
        try { event?.stopImmediatePropagation?.(); } catch {}
      };

      window.addEventListener('error', (ev) => {
        const payload = ev.error || ev.message;
        if (!isUndefinedBindWasmError(payload)) return;
        console.warn('Caught WASM cache binding error, disabling cache:', payload);
        disableCacheAdapter(payload);
        suppressKnownCacheError(ev);
      });

      window.addEventListener('unhandledrejection', (ev) => {
        const payload = (ev as PromiseRejectionEvent).reason;
        if (!isUndefinedBindWasmError(payload)) return;
        console.warn('Caught WASM cache binding rejection, disabling cache:', payload);
        disableCacheAdapter(payload);
        suppressKnownCacheError(ev);
      });

      cacheErrorHandlersInstalled = true;
    } catch {}
  }

  try {
    // ndk-cache-sqlite-wasm v0.5.x exposes initializeAsync()
    await cacheAdapter.initializeAsync();
  } catch (error) {
    console.warn('Failed to initialize sqlite-wasm cache adapter, disabling cache and continuing:', error);
    // If it's a WASM binding error, disable the cache immediately
    if (isUndefinedBindWasmError(error)) {
      disableCacheAdapter(error);
    } else {
      // For other errors, still disable cache to avoid issues
      try {
        ndk.cacheAdapter = undefined;
      } catch {}
    }
  } finally {
    cacheInitialized = true;
  }
}
