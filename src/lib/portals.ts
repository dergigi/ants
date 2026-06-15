import { nip19 } from 'nostr-tools';
export type ExplorerLink = {
  name: string;
  base: string;
};

export const PROFILE_EXPLORERS: readonly ExplorerLink[] = [
  { name: 'njump.to', base: 'https://njump.to/' },
  { name: 'njump.me', base: 'https://njump.me/' },
  { name: 'nostr.at', base: 'https://nostr.at/' },
  { name: 'nostr.eu', base: 'https://nostr.eu/' },
  { name: 'nostr.ae', base: 'https://nostr.ae/' },
  { name: 'npub.world', base: 'https://npub.world/' },
  { name: 'nosta.me', base: 'https://nosta.me/' },
  { name: 'castr.me', base: 'https://castr.me/' },
  { name: 'zaplife.lol', base: 'https://zaplife.lol/p/' },
  { name: 'nostx.io', base: 'https://nostx.io/' },
  { name: 'slidestr.net', base: 'https://slidestr.net/p/' },
  { name: 'zapper.nostrapps.org', base: 'https://zapper.nostrapps.org/zap?id=' },
] as const;

export const EVENT_EXPLORERS: readonly ExplorerLink[] = [
  { name: 'njump.to', base: 'https://njump.to/' },
  { name: 'njump.me', base: 'https://njump.me/' },
  { name: 'nostr.at', base: 'https://nostr.at/' },
  { name: 'nostr.eu', base: 'https://nostr.eu/' },
  { name: 'nostr.ae', base: 'https://nostr.ae/' },
  { name: 'nostx.io', base: 'https://nostx.io/' },
];

export const ARTICLE_EXPLORERS: readonly ExplorerLink[] = [
  { name: 'Boris', base: 'https://read.withboris.com/a/' },
  { name: 'Habla', base: 'https://habla.news/a/' },
  { name: 'Primal', base: 'https://primal.net/e/' },
] as const;

export type ExplorerItem = { name: string; href: string; dividerAfter?: boolean };

/**
 * Build profile portal links from an `npub`, preferring `nprofile` for client deep links when possible.
 */
export function createProfileExplorerItems(npub: string, pubkey?: string): readonly ExplorerItem[] {
  const items: ExplorerItem[] = PROFILE_EXPLORERS.map((p) => ({ name: p.name, href: `${p.base}${npub}` }));
  let nprofile: string | null = null;
  if (pubkey) {
    try {
      nprofile = nip19.nprofileEncode({ pubkey });
    } catch {
      nprofile = null;
    }
  }
  if (nprofile) {
    items.push({ name: 'Web Client', href: `web+nostr:${nprofile}` });
  } else {
    items.push({ name: 'Web Client', href: `web+nostr:${npub}` });
  }
  items.push({ name: 'Native App', href: `nostr:${nprofile || npub}` });
  return items;
}

/**
 * Build generic event portal links from a shareable event identifier.
 */
export function createEventExplorerItems(nevent: string): readonly ExplorerItem[] {
  const items: ExplorerItem[] = EVENT_EXPLORERS.map((p) => ({ name: p.name, href: `${p.base}${nevent}` }));
  items.push({ name: 'Web Client', href: `web+nostr:${nevent}` });
  items.push({ name: 'Native App', href: `nostr:${nevent}` });
  return items;
}

/**
 * Build article-specific portals that render NIP-23 content well from an `naddr`.
 */
export function createArticleExplorerItems(naddr: string): readonly ExplorerItem[] {
  return ARTICLE_EXPLORERS.map((p, idx) => ({
    name: p.name,
    href: `${p.base}${naddr}`,
    dividerAfter: idx === ARTICLE_EXPLORERS.length - 1,
  }));
}
