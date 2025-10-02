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

const importers: Record<string, () => Promise<unknown>> = {
  bash: () => import('prismjs/components/prism-bash'),
  shell: () => import('prismjs/components/prism-bash'),
  sh: () => import('prismjs/components/prism-bash'),
  typescript: () => import('prismjs/components/prism-typescript'),
  ts: () => import('prismjs/components/prism-typescript'),
  javascript: () => import('prismjs/components/prism-javascript'),
  js: () => import('prismjs/components/prism-javascript'),
  json: () => import('prismjs/components/prism-json'),
  css: () => import('prismjs/components/prism-css'),
  markdown: () => import('prismjs/components/prism-markdown'),
  md: () => import('prismjs/components/prism-markdown'),
};

export async function ensureLanguage(language: string): Promise<void> {
  const lang = (language || '').toLowerCase();
  if (!lang || loadedLanguages.has(lang)) return;
  exposePrism();
  const importer = importers[lang];
  if (!importer) return;
  try {
    await importer();
    loadedLanguages.add(lang);
  } catch {
    // ignore
  }
}

export function ensureBashLanguage(): void {
  // Back-compat helper used by existing code
  void ensureLanguage('bash');
}


