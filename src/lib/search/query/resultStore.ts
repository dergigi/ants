import type { NDKEvent } from '@nostr-dev-kit/ndk';

export const RESULT_LIMITS = { events: 500, bytes: 8 * 1024 * 1024, contacts: 5000 } as const;

// Conservative payload accounting for JS UTF-16 strings plus fixed/tag overhead.
// This bounds retained event payloads, not NDK caches or total browser heap usage.
export function retainedBytes(event: NDKEvent): number {
  let bytes = 512;
  for (const value of [event.id, event.pubkey, event.sig, event.content]) bytes += (value?.length || 0) * 2;
  for (const tag of event.tags || []) {
    bytes += 32;
    for (const value of tag) bytes += 16 + value.length * 2;
  }
  return bytes;
}

export class ResultStore {
  private readonly events = new Map<string, NDKEvent>();
  private readonly visible = new Set<string>();
  private bytes = 0;
  constructor(private readonly onLimit: () => void, private readonly maxEvents: number = RESULT_LIMITS.events, private readonly maxBytes: number = RESULT_LIMITS.bytes) {}
  has(id: string) { return this.events.has(id); }
  keep(event: NDKEvent, visible = true): NDKEvent | undefined {
    if (!event.id) return undefined;
    const existing = this.events.get(event.id);
    if (existing) {
      if (visible) this.visible.add(event.id);
      return existing;
    }
    const size = retainedBytes(event);
    if (this.events.size >= this.maxEvents || this.bytes + size > this.maxBytes) {
      this.onLimit();
      return undefined;
    }
    this.events.set(event.id, event);
    this.bytes += size;
    if (visible) this.visible.add(event.id);
    return event;
  }
  values() { return [...this.visible].map(id => this.events.get(id)!); }
}
