import { parseMuteList } from "../muteLists";
import { getReplyToEventId } from "../utils/eventHelpers";

const pubkey = "a".repeat(64);
const note = "b".repeat(64);

test("parses and deduplicates all public NIP-51 mute entries", () => {
  expect(
    parseMuteList({
      tags: [
        ["p", pubkey],
        ["p", pubkey.toUpperCase()],
        ["e", note],
        ["t", "nostr"],
        ["word", "spam"],
        ["word", "spam"],
        ["title", "Ignored"],
        ["p", "bad"],
        ["e", "bad"],
        ["t", " "],
      ],
    }).entries,
  ).toEqual([
    { type: "p", value: pubkey },
    { type: "e", value: note },
    { type: "t", value: "nostr" },
    { type: "word", value: "spam" },
  ]);
});
test("never parses private content as public tags", () => {
  expect(
    parseMuteList({ content: JSON.stringify([["p", pubkey]]), tags: [] }),
  ).toEqual({ entries: [], hasPrivateContent: true });
  expect(parseMuteList({ content: "encrypted?iv=abc" })).toEqual({
    entries: [],
    hasPrivateContent: true,
  });
  expect(parseMuteList({ content: " " })).toEqual({
    entries: [],
    hasPrivateContent: false,
  });
});
test("preserves literal keywords for safe quoted searches", () => {
  expect(
    parseMuteList({
      tags: [
        ["word", 'foo" OR kind:0'],
        ["t", "bitcoin"],
      ],
    }).entries[0].value,
  ).toBe('foo" OR kind:0');
});
test("mute-list thread references are not reply parents", () => {
  expect(getReplyToEventId({ kind: 10000, tags: [["e", note]] })).toBeNull();
  expect(getReplyToEventId({ kind: 1, tags: [["e", note, "", "reply"]] })).toBe(
    note,
  );
  expect(getReplyToEventId({ kind: 9735, tags: [["e", note]] })).toBe(note);
});
