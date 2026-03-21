import { NDKEvent, NDKKind, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk';
import { Event, finalizeEvent, generateSecretKey, getEventHash, getPublicKey } from 'nostr-tools';
import { ndk, safePublish, safeSubscribe } from '../ndk';
import { createRelaySet } from '../relays';

export interface RelatrSearchProfilesOutput {
  results: {
    pubkey: string;
    trustScore: number;
    rank: number;
    exactMatch?: boolean;
  }[];
  totalFound: number;
  searchTimeMs: number;
}

const RELATR_SERVER_PUBKEY = '750682303c9f0ddad75941b49edc9d46e3ed306b9ee3335338a21a3e404c5fa3';
const RELATR_RELAYS = ['wss://relay.contextvm.org', 'wss://relay2.contextvm.org'];
const CVM_KIND = 25910;
const RELATR_TIMEOUT_MS = 10000;

function buildRelatrRequest(query: string, limit: number, extendToNostr: boolean): Event {
  const payload = {
    jsonrpc: '2.0',
    id: Math.random().toString(36).slice(2),
    method: 'tools/call',
    params: {
      name: 'search_profiles',
      arguments: { query, limit, extendToNostr }
    }
  };

  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);
  const request: Event = {
    kind: CVM_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['p', RELATR_SERVER_PUBKEY]],
    content: JSON.stringify(payload),
    pubkey,
    id: '',
    sig: ''
  };

  const finalized = finalizeEvent(request, sk);
  request.id = finalized.id;
  request.sig = finalized.sig;
  return request;
}

function unwrapRelatrResponse(content: string): RelatrSearchProfilesOutput {
  const parsed = JSON.parse(content) as {
    result?: {
      structuredContent?: RelatrSearchProfilesOutput;
      content?: Array<{ type?: string; text?: string }>;
      isError?: boolean;
    } | RelatrSearchProfilesOutput;
    error?: { message?: string };
  };

  if (parsed.error) {
    throw new Error(parsed.error.message || 'relatr returned an error');
  }

  const result = parsed.result;
  if (!result) {
    throw new Error('relatr returned no result');
  }

  if ('structuredContent' in result && result.structuredContent) {
    return result.structuredContent;
  }

  if ('results' in result && Array.isArray(result.results)) {
    return result;
  }

  if ('content' in result && Array.isArray(result.content)) {
    const textBlock = result.content.find((item) => item.type === 'text' && item.text);
    if (textBlock?.text) {
      return JSON.parse(textBlock.text) as RelatrSearchProfilesOutput;
    }
  }

  throw new Error('relatr response format not recognized');
}

export async function searchRelatrProfiles(
  query: string,
  limit: number = 20,
  extendToNostr: boolean = true
): Promise<RelatrSearchProfilesOutput> {
  const requestEvent = new NDKEvent(ndk, buildRelatrRequest(query, Math.max(1, limit), extendToNostr));
  const relaySet = await createRelaySet(RELATR_RELAYS);

  return new Promise<RelatrSearchProfilesOutput>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      console.warn('[relatr] query timed out after', RELATR_TIMEOUT_MS, 'ms');
      reject(new Error('relatr query timeout'));
    }, RELATR_TIMEOUT_MS);

    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      fn();
    };

    const sub = safeSubscribe(
      [{ kinds: [CVM_KIND as NDKKind], '#e': [requestEvent.id!] }],
      {
        closeOnEose: false,
        cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
        relaySet
      }
    );

    if (!sub) {
      clearTimeout(timeoutId);
      reject(new Error('failed to create relatr subscription'));
      return;
    }

    let publishAttempted = false;
    const tryPublish = async () => {
      if (publishAttempted || settled) return;
      publishAttempted = true;
      const publishSuccess = await safePublish(requestEvent, relaySet);
      if (!publishSuccess) {
        try { sub.stop(); } catch (e) { console.debug('[relatr] sub.stop error:', e); }
        finish(() => reject(new Error('failed to publish relatr request')));
      }
    };

    sub.on('event', (event: NDKEvent) => {
      if (event.pubkey !== RELATR_SERVER_PUBKEY) return;

      try { sub.stop(); } catch (e) { console.debug('[relatr] sub.stop error:', e); }
      try {
        const response = unwrapRelatrResponse(event.content);
        finish(() => resolve(response));
      } catch (error) {
        finish(() => reject(error));
      }
    });

    sub.on('eose', tryPublish);
    // Fallback: publish after 2s if EOSE never fires
    setTimeout(tryPublish, 2000);

    sub.start();
  });
}

export function buildProfileStubEvent(pubkey: string, content: string = '{}'): NDKEvent {
  const plain: Event = {
    kind: 0,
    created_at: Math.floor(Date.now() / 1000),
    content,
    pubkey,
    tags: [],
    id: '',
    sig: ''
  };
  plain.id = getEventHash(plain);
  return new NDKEvent(ndk, plain);
}
