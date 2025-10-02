'use client';

// Make Prism instance available and lazily load language components on demand
import { Prism as PrismLib } from 'prism-react-renderer';

const loadedLanguages = new Set<string>();
let prismExposed = false;

function exposePrism(): void {
  if (prismExposed) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).Prism = PrismLib as unknown as object;
  } catch {}
  prismExposed = true;
}

export async function ensureLanguage(language: string): Promise<void> {
  const lang = (language || '').toLowerCase();
  if (!lang) return;
  if (loadedLanguages.has(lang)) return;
  exposePrism();
  try {
    await import(/* webpackIgnore: true */ `prismjs/components/prism-${lang}`);
    loadedLanguages.add(lang);
  } catch {
    // Best-effort; ignore if not available
  }
}

export function ensureBashLanguage(): void {
  // Back-compat helper used by existing code
  void ensureLanguage('bash');
}


