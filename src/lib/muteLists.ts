export type MuteEntry = { type: "p" | "e" | "t" | "word"; value: string };

/** NIP-51 public entries only. Content contains encrypted private entries. */
export function parseMuteList(event: { tags?: string[][]; content?: string }) {
  const entries: MuteEntry[] = [];
  const seen = new Set<string>();
  for (const tag of event.tags || []) {
    if (!Array.isArray(tag) || typeof tag[1] !== "string") continue;
    const type = tag[0];
    if (type !== "p" && type !== "e" && type !== "t" && type !== "word")
      continue;
    let value = tag[1].trim();
    if (!value) continue;
    if (type === "p" || type === "e") {
      if (!/^[a-f0-9]{64}$/i.test(value)) continue;
      value = value.toLowerCase();
    }
    const identity = `${type}:${value}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    entries.push({ type, value });
  }
  return { entries, hasPrivateContent: Boolean(event.content?.trim()) };
}
