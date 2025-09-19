let cachedRules: Array<{ kind: 'site' | 'is' | 'has'; key: string; expansion: string }> | null = null;

function parseLine(line: string): { kind: 'site' | 'is' | 'has'; key: string; expansion: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const m = trimmed.match(/^(site|is|has):([^\s]+)\s*=>\s*(.+)$/i);
  if (!m) return null;
  const kind = m[1].toLowerCase() as 'site' | 'is' | 'has';
  const key = m[2].trim();
  const expansion = m[3].trim();
  return { kind, key, expansion };
}

async function loadRules(): Promise<Array<{ kind: 'site' | 'is' | 'has'; key: string; expansion: string }>> {
  if (cachedRules) return cachedRules;
  try {
    const res = await fetch('/replacements.txt', { cache: 'no-store' });
    if (!res.ok) throw new Error('failed');
    const txt = await res.text();
    const rules: Array<{ kind: 'site' | 'is' | 'has'; key: string; expansion: string }> = [];
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

  // Replace exact is:/has: tokens (single, no commas)
  q = q.replace(/(^|\s)(is|has):([^\s,]+)(?=\s|$)/gi, (full, lead: string, kind: string, key: string) => {
    const rule = rules.find((r) => r.kind === (kind.toLowerCase() as 'is' | 'has') && r.key.toLowerCase() === key.toLowerCase());
    return rule ? `${lead}${rule.expansion}` : full;
  });

  return q.replace(/\s{2,}/g, ' ').trim();
}

export async function getIsKindTokens(): Promise<string[]> {
  const rules = await loadRules();
  return rules
    .filter((r) => r.kind === 'is')
    .map((r) => `is:${r.key}`);
}


