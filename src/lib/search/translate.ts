import { loadDsl, getMediaExtsSync, getIsHasMapsSync } from './dsl';
import { applyQueryExtensions } from './extensions';

function formatOrList(items: string[]): string {
  return `(${items.join(' OR ')})`;
}

export async function explainQuery(raw: string): Promise<string> {
  const query = raw || '';
  await loadDsl();

  const parts: string[] = [];

  // site: expansions
  const siteRegex = /(?:^|\s)site:([^\s]+)(?:\s|$)/gi;
  let m: RegExpExecArray | null;
  const siteSeen = new Set<string>();
  while ((m = siteRegex.exec(query)) !== null) {
    const token = (m[1] || '').trim();
    if (!token) continue;
    const tokens = token.split(',').map((t) => t.trim()).filter(Boolean);
    for (const t of tokens) {
      const key = t.toLowerCase();
      if (siteSeen.has(key)) continue;
      siteSeen.add(key);
      // Apply extensions to get seeds; they will expand alias keys to hostnames
      const ext = applyQueryExtensions(`site:${key}`);
      const hosts = ext.seeds.length > 0 ? ext.seeds : [key];
      parts.push(`site:${key} => ${formatOrList(hosts)}`);
    }
  }

  // has:/is: media expansions
  const { imageExts, videoExts, gifExts } = getMediaExtsSync();
  const { isMap, hasMap } = getIsHasMapsSync();
  const flags: Array<{ rx: RegExp; label: string; list: string[] }> = [
    { rx: /(?:^|\s)has:images?(?:\s|$)/i, label: 'has:image', list: hasMap.image || imageExts.map((e) => `.${e}`) },
    { rx: /(?:^|\s)is:image(?:\s|$)/i, label: 'is:image', list: isMap.image || imageExts.map((e) => `.${e}`) },
    { rx: /(?:^|\s)has:videos?(?:\s|$)/i, label: 'has:video', list: hasMap.video || videoExts.map((e) => `.${e}`) },
    { rx: /(?:^|\s)is:video(?:\s|$)/i, label: 'is:video', list: isMap.video || videoExts.map((e) => `.${e}`) },
    { rx: /(?:^|\s)has:gifs?(?:\s|$)/i, label: 'has:gif', list: hasMap.gif || gifExts.map((e) => `.${e}`) },
    { rx: /(?:^|\s)is:gif(?:\s|$)/i, label: 'is:gif', list: isMap.gif || gifExts.map((e) => `.${e}`) }
  ];
  // Also handle arbitrary tokens like is:quote / has:mp3 from DSL maps
  const arbitraryIs = query.match(/(?:^|\s)is:([^\s]+)(?:\s|$)/i);
  if (arbitraryIs) {
    const key = arbitraryIs[1].toLowerCase();
    if (isMap[key]) parts.push(`is:${key} => ${formatOrList(isMap[key])}`);
  }
  const arbitraryHas = query.match(/(?:^|\s)has:([^\s]+)(?:\s|$)/i);
  if (arbitraryHas) {
    const key = arbitraryHas[1].toLowerCase();
    if (hasMap[key]) parts.push(`has:${key} => ${formatOrList(hasMap[key])}`);
  }
  for (const f of flags) {
    if (f.rx.test(query)) {
      parts.push(`${f.label} => ${formatOrList(f.list.map((e) => `.${e}`))}`);
    }
  }

  // Cleaned base query (modifiers stripped)
  const ext = applyQueryExtensions(query);
  const cleaned = ext.query.trim();
  const inputTrimmed = query.trim();
  if (cleaned && cleaned !== inputTrimmed) {
    parts.unshift(`text: "${cleaned}"`);
  }

  return parts.join(' • ');
}


