import { NDKEvent } from '@nostr-dev-kit/ndk';

// Safely convert NDKEvent (which may contain circular refs) to a plain JSON-serializable object
export function toPlainEvent(evt: NDKEvent): Record<string, unknown> {
  try {
    const hasRaw = typeof (evt as unknown as { rawEvent?: () => unknown }).rawEvent === 'function';
    const base = hasRaw
      ? (evt as unknown as { rawEvent: () => Record<string, unknown> }).rawEvent()
      : {
          id: evt.id,
          kind: evt.kind,
          created_at: evt.created_at,
          pubkey: evt.pubkey,
          content: evt.content,
          tags: evt.tags,
          sig: evt.sig
        };
    // Note: We no longer inject relaySource/relaySources into events
    // Relay tracking is handled separately by the eventRelayTracking system
    return base;
  } catch {
    return {
      id: evt.id,
      kind: evt.kind,
      created_at: evt.created_at,
      pubkey: evt.pubkey,
      content: evt.content,
      tags: evt.tags,
      sig: evt.sig
    };
  }
}


