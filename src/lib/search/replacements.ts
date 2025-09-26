let cachedRules: Array<{ kind: string; key: string; expansion: string }> | null = null;

function parseLine(line: string): { kind: string; key: string; expansion: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const arrowIdx = trimmed.indexOf('=>');
  if (arrowIdx === -1) return null;
  const left = trimmed.slice(0, arrowIdx).trim();
  const right = trimmed.slice(arrowIdx + 2).trim();
  const colonIdx = left.indexOf(':');
  if (colonIdx === -1) return null;
  const kind = left.slice(0, colonIdx).trim().toLowerCase();
  const key = left.slice(colonIdx + 1).trim();
  const expansion = right;
  if (!kind || !key || !expansion) return null;
  return { kind, key, expansion };
}

async function loadRules(): Promise<Array<{ kind: string; key: string; expansion: string }>> {
  if (cachedRules) return cachedRules;
  try {
    const res = await fetch('/replacements.txt', { cache: 'no-store' });
    if (!res.ok) throw new Error('failed');
    const txt = await res.text();
    const rules: Array<{ kind: string; key: string; expansion: string }> = [];
    for (const raw of txt.split(/\r?\n/)) {
      const r = parseLine(raw);
      if (r) rules.push(r);
    }
    cachedRules = rules;
    return cachedRules;
  } catch {
    cachedRules = [];
    return cachedRules;
  }
}

export async function applySimpleReplacements(input: string): Promise<string> {
  const rules = await loadRules();
  if (!rules.length) return input.trim();
  let q = input;

  // Replace site: lists supporting commas, mapping each token via rules
  q = q.replace(/(^|\s)site:([^\s]+)(?=\s|$)/gi, (full, lead: string, raw: string) => {
    const tokens = raw.split(',').map((s) => s.trim()).filter(Boolean);
    const expanded = tokens.map((t) => {
      const rule = rules.find((r) => r.kind === 'site' && r.key.toLowerCase() === t.toLowerCase());
      return rule ? rule.expansion : t;
    });
    const combined = expanded.join(' OR ');
    return `${lead}${combined}`;
  });

  // Replace any kind:key token (single, no commas). Keep site handled above for comma lists.
  q = q.replace(/(^|\s)([a-zA-Z0-9_-]+):([^\s,]+)(?=\s|$)/g, (full, lead: string, kind: string, key: string) => {
    const kindLower = kind.toLowerCase();
    const rule = rules.find((r) => r.kind === kindLower && r.key.toLowerCase() === key.toLowerCase());
    if (rule) return `${lead}${rule.expansion}`;
    // Default support for nip: tokens if not explicitly listed in replacements file.
    if (kindLower === 'nip') {
      const formatted = (() => {
        const clean = key.trim();
        if (/^\d+$/.test(clean)) {
          if (clean.length === 1) return `0${clean}`;
          return clean;
        }
        return clean.toUpperCase();
      })();
      return `${lead}nips/blob/master/${formatted}.md`;
    }
    return full;
  });

  return q.replace(/\s{2,}/g, ' ').trim();
}

export async function getIsKindTokens(): Promise<string[]> {
  const rules = await loadRules();
  return rules
    .filter((r) => r.kind === 'is')
    .map((r) => `is:${r.key}`);
}


