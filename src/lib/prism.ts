'use client';

// Ensure Prism has specific languages available at runtime
import Prism from 'prism-react-renderer/prism';

let bashInitialized = false;

export function ensureBashLanguage(): void {
  if (bashInitialized) return;
  try {
    // Attach Prism to global for component registration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).Prism = Prism as unknown as object;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prismAny = Prism as unknown as { languages: Record<string, any> };
    if (!prismAny.languages?.bash) {
      // Lazy load bash syntax component (non-blocking)
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      import('prismjs/components/prism-bash').catch(() => {});
    }
  } catch {
    // ignore
  }
  bashInitialized = true;
}


