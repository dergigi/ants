import { nip19 } from 'nostr-tools';
import { getContactPubkeys } from '../contacts';
import { getStoredPubkey } from '../nip07';
import { resolveAuthor } from '../vertex';

function tokenCore(token: string): string {
  const match = token.trim().match(/^([^),.;]+)[),.;]*$/);
  return (match && match[1]) || token.trim();
}

async function resolveAuthorToken(authorToken: string): Promise<string[]> {
  const core = tokenCore(authorToken);

  if (/^@contacts$/i.test(core)) {
    return getContactPubkeys();
  }

  if (/^@me$/i.test(core)) {
    const pubkey = getStoredPubkey();
    return pubkey ? [pubkey] : [];
  }

  if (/^[0-9a-f]{64}$/i.test(core)) {
    return [core.toLowerCase()];
  }

  if (/^npub1[0-9a-z]+$/i.test(core)) {
    return [nip19.decode(core).data as string];
  }

  const resolved = await resolveAuthor(core);
  return resolved.pubkeyHex ? [resolved.pubkeyHex] : [];
}

/**
 * Resolve by:/mentions: token values to hex pubkeys.
 * `@contacts` expands to the logged-in user's kind:3 follow list.
 */
export async function resolveAuthorTokens(tokens: string[]): Promise<string[]> {
  const results = await Promise.all(tokens.map(async (token) => {
    try {
      return resolveAuthorToken(token);
    } catch (error) {
      console.warn(`Failed to resolve author ${token}:`, error);
      return [];
    }
  }));

  return Array.from(new Set(results.flat()));
}
