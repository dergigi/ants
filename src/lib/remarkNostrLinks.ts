/**
 * Remark plugin that transforms nostr identifiers in markdown text nodes
 * into clickable links pointing to the app's /e/ and /p/ routes.
 *
 * Handles: npub1, nprofile1, nevent1, naddr1, note1 (with optional nostr: prefix)
 */
import { findAndReplace } from 'mdast-util-find-and-replace';
import type { Root, PhrasingContent } from 'mdast';
import { NOSTR_IDENTIFIER_TYPES } from '@/lib/utils/nostrIdentifiers';

const NOSTR_TOKEN_RE = new RegExp(
  `(nostr:${NOSTR_IDENTIFIER_TYPES}[0-9a-z]+|${NOSTR_IDENTIFIER_TYPES}[0-9a-z]+)`,
  'gi'
);

const PROFILE_PREFIXES = ['npub1', 'nprofile1'];

function tokenToHref(raw: string): string {
  const token = raw.replace(/^nostr:/i, '');
  const isProfile = PROFILE_PREFIXES.some((p) => token.startsWith(p));
  return isProfile ? `/p/${token}` : `/e/${token}`;
}

function tokenToDisplay(raw: string): string {
  const token = raw.replace(/^nostr:/i, '');
  if (token.length <= 20) return token;
  return `${token.slice(0, 10)}…${token.slice(-6)}`;
}

export default function remarkNostrLinks() {
  return (tree: Root) => {
    findAndReplace(tree, [
      [
        NOSTR_TOKEN_RE,
        (_: string, token: string): PhrasingContent => ({
          type: 'link',
          url: tokenToHref(token),
          title: token.replace(/^nostr:/i, ''),
          children: [{ type: 'text', value: tokenToDisplay(token) }],
        }),
      ],
    ]);
  };
}
