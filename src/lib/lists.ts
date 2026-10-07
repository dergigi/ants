export type ListEntry = { type: "p" | "e" | "a" | "t" | "word"; value: string };

export function isListKind(kind?: number) {
  return kind === 3 || kind === 10000 || kind === 10001 || kind === 10003;
}

export function parseListAddress(value: string) {
  const match = /^(\d+):([a-f0-9]{64}):(.*)$/i.exec(value);
  if (!match) return null;
  const kind = Number(match[1]);
  if (kind < 30000 || kind >= 40000) return null;
  return { kind, pubkey: match[2].toLowerCase(), identifier: match[3] };
}

/** Read public tags only; private list content is never interpreted as entries. */
export function parseList(event: {
  kind?: number;
  tags?: string[][];
  content?: string;
}) {
  const allowed =
    event.kind === 3
      ? ["p"]
      : event.kind === 10001
        ? ["e"]
        : event.kind === 10003
          ? ["e", "a"]
          : event.kind === 10000
            ? ["p", "e", "t", "word"]
            : [];
  const entries: ListEntry[] = [];
  const seen = new Set<string>();
  for (const tag of event.tags || []) {
    if (
      !Array.isArray(tag) ||
      typeof tag[1] !== "string" ||
      !allowed.includes(tag[0])
    )
      continue;
    const type = tag[0] as ListEntry["type"];
    let value = tag[1].trim();
    if (!value) continue;
    if (type === "p" || type === "e") {
      if (!/^[a-f0-9]{64}$/i.test(value)) continue;
      value = value.toLowerCase();
    }
    if (type === "a") {
      const address = parseListAddress(value);
      if (!address) continue;
      value = `${address.kind}:${address.pubkey}:${address.identifier}`;
    }
    const identity = `${type}:${value}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    entries.push({ type, value });
  }
  return {
    entries,
    hasPrivateContent:
      event.kind !== 3 &&
      isListKind(event.kind) &&
      Boolean(event.content?.trim()),
  };
}
