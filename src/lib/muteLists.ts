import { parseList } from "./lists";

/** NIP-51 mute-list convenience wrapper. */
export function parseMuteList(event: { tags?: string[][]; content?: string }) {
  return parseList({ ...event, kind: 10000 });
}
