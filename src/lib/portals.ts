export type ExplorerLink = {
  name: string;
  base: string;
};

export const PROFILE_EXPLORERS: readonly ExplorerLink[] = [
  { name: 'njump.me', base: 'https://njump.me/' },
  { name: 'nostr.at', base: 'https://nostr.at/' },
  { name: 'npub.world', base: 'https://npub.world/' },
  { name: 'nosta.me', base: 'https://nosta.me/' },
  { name: 'castr.me', base: 'https://castr.me/' },
] as const;

export const EVENT_EXPLORERS: readonly ExplorerLink[] = [
  { name: 'njump.me', base: 'https://njump.me/' },
  { name: 'nostr.at', base: 'https://nostr.at/' },
  { name: 'habla.news', base: 'https://habla.news/' },
];


