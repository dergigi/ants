export type PortalLink = {
  name: string;
  base: string;
};

export const PORTAL_LINKS: readonly PortalLink[] = [
  { name: 'njump.me', base: 'https://njump.me/' },
  { name: 'nostr.at', base: 'https://nostr.at/' },
  { name: 'npub.world', base: 'https://npub.world/' },
  { name: 'nosta.me', base: 'https://nosta.me/' },
  { name: 'castr.me', base: 'https://castr.me/' },
] as const;


