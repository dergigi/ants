import { parseList, parseListAddress } from "../lists";
import { getReplyToEventId } from "../utils/eventHelpers";
const key = "a".repeat(64);
const id = "b".repeat(64);

test("follow lists only include valid unique profiles and ignore legacy relay content", () => {
  expect(
    parseList({
      kind: 3,
      content: '{"wss://relay.example":{}}',
      tags: [
        ["p", key],
        ["p", key.toUpperCase()],
        ["p", "bad"],
        ["e", id],
      ],
    }),
  ).toEqual({ entries: [{ type: "p", value: key }], hasPrivateContent: false });
});
test("pins only include event references; bookmarks also accept addressable events", () => {
  const tags = [
    ["e", id],
    ["e", id.toUpperCase()],
    ["p", key],
    ["a", `30023:${key.toUpperCase()}:A:title`],
    ["a", `30023:${key}:A:title`],
    ["a", "bad"],
    ["a", `1:${key}:invalid`],
  ];
  expect(parseList({ kind: 10001, tags }).entries).toEqual([
    { type: "e", value: id },
  ]);
  expect(parseList({ kind: 10003, tags }).entries).toEqual([
    { type: "e", value: id },
    { type: "a", value: `30023:${key}:A:title` },
  ]);
  expect(parseListAddress(`30023:${key}:A:title`)).toEqual({
    kind: 30023,
    pubkey: key,
    identifier: "A:title",
  });
  expect(parseListAddress(`30000:${key}:`)).toEqual({
    kind: 30000,
    pubkey: key,
    identifier: "",
  });
});
test.each([10001, 10003])(
  "kind %s keeps private content hidden and references are not reply parents",
  (kind) => {
    expect(parseList({ kind, content: JSON.stringify([["e", id]]) })).toEqual({
      entries: [],
      hasPrivateContent: true,
    });
    expect(getReplyToEventId({ kind, tags: [["e", id]] })).toBeNull();
  },
);
