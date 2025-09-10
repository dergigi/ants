export interface DslConfig {
  siteHosts: Record<string, string[]>;
  media: {
    imageExts: string[];
    videoExts: string[];
    gifExts: string[];
  };
  isMap: Record<string, string[]>;
  hasMap: Record<string, string[]>;
}

const DEFAULT_DSL: DslConfig = {
  siteHosts: {
    youtube: ['youtube.com', 'youtu.be', 'm.youtube.com', 'www.youtube.com', 'youtube-nocookie.com'],
    reddit: ['reddit.com', 'www.reddit.com', 'old.reddit.com', 'new.reddit.com', 'm.reddit.com', 'reddit.co'],
    twitter: ['twitter.com', 'www.twitter.com', 'm.twitter.com', 'x.com', 't.co'],
    wikipedia: ['wikipedia.org', 'en.wikipedia.org', 'www.wikipedia.org', 'm.wikipedia.org'],
    facebook: ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.com'],
    instagram: ['instagram.com', 'www.instagram.com', 'm.instagram.com'],
    linkedin: ['linkedin.com', 'www.linkedin.com', 'm.linkedin.com', 'lnkd.in'],
    pinterest: ['pinterest.com', 'www.pinterest.com', 'm.pinterest.com'],
    tumblr: ['tumblr.com', 'www.tumblr.com', 'm.tumblr.com'],
    flickr: ['flickr.com', 'www.flickr.com', 'm.flickr.com'],
    github: ['github.com', 'www.github.com', 'gist.github.com'],
    quora: ['quora.com', 'www.quora.com', 'm.quora.com'],
    yt: ['youtube.com', 'youtu.be', 'm.youtube.com', 'www.youtube.com', 'youtube-nocookie.com'],
    x: ['twitter.com', 'www.twitter.com', 'm.twitter.com', 'x.com', 't.co'],
    wiki: ['wikipedia.org', 'en.wikipedia.org', 'www.wikipedia.org', 'm.wikipedia.org'],
    fb: ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.com'],
    ig: ['instagram.com', 'www.instagram.com', 'm.instagram.com'],
    gh: ['github.com', 'www.github.com', 'gist.github.com']
  },
  media: {
    imageExts: ['png', 'jpg', 'jpeg', 'gif', 'gifs', 'apng', 'webp', 'avif', 'svg'],
    videoExts: ['mp4', 'webm', 'ogg', 'ogv', 'mov', 'm4v'],
    gifExts: ['gif', 'gifs', 'apng']
  },
  isMap: {
    image: ['.png', '.jpg', '.jpeg', '.gif', '.gifs', '.apng', '.webp', '.avif', '.svg'],
    video: ['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.m4v'],
    gif: ['.gif', '.gifs', '.apng']
  },
  hasMap: {
    image: ['.png', '.jpg', '.jpeg', '.gif', '.gifs', '.apng', '.webp', '.avif', '.svg'],
    video: ['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.m4v'],
    gif: ['.gif', '.gifs', '.apng']
  }
};

let cachedDsl: DslConfig | null = null;

function parseListFlexible(value: string, removeLeadingDot: boolean): string[] {
  const trimmed = value.trim();
  const raw = trimmed.startsWith('(') && trimmed.endsWith(')')
    ? trimmed.slice(1, -1)
    : trimmed;
  const split = raw.split(/\s+OR\s+|\s*,\s*/i).map((s) => s.trim()).filter(Boolean);
  return split.map((s) => removeLeadingDot ? s.replace(/^\./, '') : s);
}

function parseMappingsMd(md: string): DslConfig {
  const siteHosts: Record<string, string[]> = {};
  let imageExts: string[] | null = null;
  let videoExts: string[] | null = null;
  let gifExts: string[] | null = null;
  const isMap: Record<string, string[]> = {};
  const hasMap: Record<string, string[]> = {};

  const getBlock = (title: string): string | null => {
    // Match lines like: ### `site:`
    const headerRegex = new RegExp('^###\\s*`' + title + ':`\\s*$', 'mi');
    const headerMatch = md.match(headerRegex);
    if (!headerMatch) return null;
    const start = headerMatch.index || 0;
    const afterHeader = md.slice(start);
    const fenceStart = afterHeader.indexOf('```');
    if (fenceStart === -1) return null;
    const afterFence = afterHeader.slice(fenceStart + 3);
    const fenceEnd = afterFence.indexOf('```');
    if (fenceEnd === -1) return null;
    return afterFence.slice(0, fenceEnd);
  };

  // Parse is:/has: generic maps and derive media extensions
  const isBlock = getBlock('is');
  const hasBlock = getBlock('has');
  const mediaBlock = [isBlock, hasBlock].filter(Boolean).join('\n');
  if (mediaBlock) {
    const lines = mediaBlock.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const m = line.match(/^(\w+)\s*=>\s*(.+)\s*$/);
      if (!m) continue;
      const key = m[1].toLowerCase();
      const rhs = m[2];
      // For is: and has: keep leading dots in map (formatting), remove later for extension arrays
      const listRaw = parseListFlexible(rhs, false);
      if (isBlock && line && (mediaBlock.includes(line))) {
        isMap[key] = listRaw;
      }
      if (hasBlock && line && (mediaBlock.includes(line))) {
        hasMap[key] = listRaw;
      }
      const listNoDot = parseListFlexible(rhs, true);
      if (key === 'image') imageExts = listNoDot;
      else if (key === 'video') videoExts = listNoDot;
      else if (key === 'gif') gifExts = listNoDot;
    }
  }

  // Parse site:
  const siteBlock = getBlock('site');
  if (siteBlock) {
    const lines = siteBlock.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const m = line.match(/^(\w+)\s*=>\s*(.+)\s*$/);
      if (!m) continue;
      const key = m[1].toLowerCase();
      const list = parseListFlexible(m[2], false);
      siteHosts[key] = list;
    }
  }

  return {
    siteHosts: Object.keys(siteHosts).length ? siteHosts : DEFAULT_DSL.siteHosts,
    media: {
      imageExts: imageExts || DEFAULT_DSL.media.imageExts,
      videoExts: videoExts || DEFAULT_DSL.media.videoExts,
      gifExts: gifExts || DEFAULT_DSL.media.gifExts
    },
    isMap: Object.keys(isMap).length ? isMap : DEFAULT_DSL.isMap,
    hasMap: Object.keys(hasMap).length ? hasMap : DEFAULT_DSL.hasMap
  };
}

export async function loadDsl(): Promise<DslConfig> {
  if (cachedDsl) return cachedDsl;
  try {
    const res = await fetch('/MAPPINGS.md', { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to fetch MAPPINGS.md: ${res.status}`);
    const md = await res.text();
    cachedDsl = parseMappingsMd(md);
    return cachedDsl;
  } catch {
    cachedDsl = DEFAULT_DSL;
    return cachedDsl;
  }
}

export function getDslSync(): DslConfig {
  return cachedDsl || DEFAULT_DSL;
}

export function getSiteHostsSync(): Record<string, string[]> {
  return getDslSync().siteHosts;
}

export function getMediaExtsSync(): { imageExts: string[]; videoExts: string[]; gifExts: string[] } {
  return getDslSync().media;
}

export async function preloadDsl(): Promise<void> {
  try { await loadDsl(); } catch {}
}

export function getIsHasMapsSync(): { isMap: Record<string, string[]>; hasMap: Record<string, string[]> } {
  const d = getDslSync();
  return { isMap: d.isMap, hasMap: d.hasMap };
}


