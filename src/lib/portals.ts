export type ExplorerLink = {
  name: string;
  base: string;
};

export const PROFILE_EXPLORERS: readonly ExplorerLink[] = [
  { name: 'njump.me', base: 'https://njump.me/' },
  { name: 'nostr.at', base: 'https://nostr.at/' },
  { name: 'nostr.band', base: 'https://nostr.band/' },
  { name: 'npub.world', base: 'https://npub.world/' },
  { name: 'nosta.me', base: 'https://nosta.me/' },
  { name: 'castr.me', base: 'https://castr.me/' },
  { name: 'zaplife.lol', base: 'https://zaplife.lol/p/' },
] as const;

export const EVENT_EXPLORERS: readonly ExplorerLink[] = [
  { name: 'njump.me', base: 'https://njump.me/' },
  { name: 'nostr.at', base: 'https://nostr.at/' },
  { name: 'nostr.band', base: 'https://nostr.band/' },
  { name: 'habla.news', base: 'https://habla.news/' },
];

export type ExplorerItem = { name: string; href: string };

export function createProfileExplorerItems(npub: string): readonly ExplorerItem[] {
  const items: ExplorerItem[] = PROFILE_EXPLORERS.map((p) => ({ name: p.name, href: `${p.base}${npub}` }));
  items.push({ name: 'Native App', href: `nostr:${npub}` });
  return items;
}

export function createEventExplorerItems(nevent: string): readonly ExplorerItem[] {
  const items: ExplorerItem[] = EVENT_EXPLORERS.map((p) => ({ name: p.name, href: `${p.base}${nevent}` }));
  items.push({ name: 'Native App', href: `nostr:${nevent}` });
  return items;
}


