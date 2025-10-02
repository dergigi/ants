'use client';

// Minimal bridge to expose Prism instance if needed by extensions.
// Avoid importing non-existent subpaths; rely on prism-react-renderer's bundled Prism.
import { Prism as PrismLib } from 'prism-react-renderer';

let initialized = false;

export function ensureBashLanguage(): void {
  if (initialized) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).Prism = PrismLib as unknown as object;
  } catch {
    // ignore
  }
  initialized = true;
}


