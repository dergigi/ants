let cachedRules: Array<{ kind: string; key: string; expansion: string }> | null = null;
let cachedDirectRules: Array<{ pattern: string; replacement: string }> | null = null;

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
  if (!kind) return null;
  return { kind, key, expansion };
}

function parseDirectLine(line: string): { pattern: string; replacement: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const arrowIdx = trimmed.indexOf('=>');
  if (arrowIdx === -1) return null;
  const left = trimmed.slice(0, arrowIdx).trim();
  const right = trimmed.slice(arrowIdx + 2).trim();
  const colonIdx = left.indexOf(':');
  
  // Parse as direct replacement if:
  // 1. No colon (simple pattern)
  // 2. Colon is part of a protocol (http://, https://, ftp://, etc.)
  // 3. Colon is at the end (like "https://" => "")
  if (colonIdx !== -1) {
    // Check if this looks like a protocol pattern (contains //)
    if (!left.includes('//')) {
      return null; // Not a protocol, likely a kind:key pattern
    }
  }
  
  return { pattern: left, replacement: right };
}

export async function loadRules(): Promise<Array<{ kind: string; key: string; expansion: string }>> {
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

async function loadDirectRules(): Promise<Array<{ pattern: string; replacement: string }>> {
  if (cachedDirectRules) return cachedDirectRules;
  try {
    const res = await fetch('/replacements.txt', { cache: 'no-store' });
    if (!res.ok) throw new Error('failed');
    const txt = await res.text();
    const rules: Array<{ pattern: string; replacement: string }> = [];
    for (const raw of txt.split(/\r?\n/)) {
      const r = parseDirectLine(raw);
      if (r) rules.push(r);
    }
    cachedDirectRules = rules;
    return cachedDirectRules;
  } catch {
    cachedDirectRules = [];
    return cachedDirectRules;
  }
}

export async function applySimpleReplacements(input: string): Promise<string> {
  const rules = await loadRules();
  const directRules = await loadDirectRules();
  if (!rules.length && !directRules.length) return input.trim();
  let q = input;

  // Apply direct string replacements first (e.g., `http:// => `)
  for (const rule of directRules) {
    const escapedPattern = rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedPattern, 'g');
    q = q.replace(regex, rule.replacement);
  }

  // Allow stripping prefixes via rules with an empty key (e.g. `nostr: =>`)
  q = q.replace(/(^|\s)([a-zA-Z0-9_-]+):([^\s,]+)(?=\s|$)/g, (full, lead: string, kind: string, key: string) => {
    const kindLower = kind.toLowerCase();
    const keyLower = key.toLowerCase();
    const exactRule = rules.find((r) => r.kind === kindLower && r.key.toLowerCase() === keyLower);
    if (exactRule) return `${lead}${exactRule.expansion}`;
    const prefixRule = rules.find((r) => r.kind === kindLower && r.key === '');
    if (prefixRule) {
      const prefix = prefixRule.expansion;
      return `${lead}${prefix ? `${prefix}${key}` : key}`;
    }
    return full;
  });

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
  // Remaining replacements handled above by prefix/exact matching.

  return q.replace(/\s{2,}/g, ' ').trim();
}

export async function getIsKindTokens(): Promise<string[]> {
  const rules = await loadRules();
  return rules
    .filter((r) => r.kind === 'is')
    .map((r) => `is:${r.key}`);
}

export interface IsKindRule {
  token: string;
  kind: string;
  expansion: string;
}

function extractKindNumber(expansion: string): number {
  const match = expansion.match(/kind:(\d+)/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  // If multiple kinds (e.g., "kind:21 OR kind:22"), use the first one
  const firstMatch = expansion.match(/kind:(\d+)/i);
  return firstMatch ? parseInt(firstMatch[1], 10) : 999999;
}

export async function getIsKindRules(): Promise<IsKindRule[]> {
  const rules = await loadRules();
  const isKindRules = rules
    .filter((r) => r.kind === 'is' && r.expansion.includes('kind:'))
    .map((r) => ({
      token: `is:${r.key}`,
      kind: r.kind,
      expansion: r.expansion
    }));
  
  // Sort by numeric kind value (ascending), then by token (alphabetically)
  return isKindRules.sort((a, b) => {
    const kindA = extractKindNumber(a.expansion);
    const kindB = extractKindNumber(b.expansion);
    if (kindA !== kindB) {
      return kindA - kindB;
    }
    return a.token.localeCompare(b.token);
  });
}


