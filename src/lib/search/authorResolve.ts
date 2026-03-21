import { nip19 } from 'nostr-tools';
import { resolveAuthor } from '../vertex';
import { getContactPubkeys } from '../contacts';

/**
 * Resolve an array of author tokens (npubs, usernames, or @contacts) to hex pubkeys.
 * @contacts expands to the logged-in user's kind:3 follow list.
 * Invalid or unresolvable tokens are silently dropped with a warning.
 */
export async function resolveAuthorTokens(tokens: string[]): Promise<string[]> {
  const results = await Promise.all(
    tokens.map(async (authorToken) => {
      try {
        if (authorToken === '@contacts') {
          return await getContactPubkeys();
        }
        if (/^npub1[0-9a-z]+$/i.test(authorToken)) {
          return [nip19.decode(authorToken).data as string];
        }
        const resolved = await resolveAuthor(authorToken);
        return resolved.pubkeyHex ? [resolved.pubkeyHex] : [];
      } catch (error) {
        console.warn(`Failed to resolve author ${authorToken}:`, error);
        return [];
      }
    })
  );
  return [...new Set(results.flat())];
}
