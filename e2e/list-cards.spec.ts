import { expect, test } from "@playwright/test";
import {
  finalizeEvent,
  getPublicKey,
  nip19,
  type EventTemplate,
} from "nostr-tools";
const ownerKey = new Uint8Array(32).fill(4);
const secondOwnerKey = new Uint8Array(32).fill(5);
const mutedKey = new Uint8Array(32).fill(6);
const muted = getPublicKey(mutedKey);
const thread = "b".repeat(64);
const created_at = Math.floor(Date.now() / 1000) - 60;
const sign = (event: Omit<EventTemplate, "created_at">, key = ownerKey) =>
  finalizeEvent({ ...event, created_at }, key);
const list = sign({
  kind: 3,
  content: "LEGACY_RELAY_CONTENT",
  tags: [["p", muted]],
});
const pins = sign({
  kind: 10001,
  content: "",
  tags: Array.from({ length: 10 }, (_, i) => [
    "e",
    i.toString(16).padStart(64, "0"),
  ]),
});
const address = {
  kind: 30023,
  pubkey: muted,
  identifier: "An article:with colons",
};
const bookmarks = sign({
  kind: 10003,
  content: "PRIVATE_CIPHERTEXT_https://example.com/secret.png",
  tags: [
    ["e", thread],
    ["a", `${address.kind}:${address.pubkey}:${address.identifier}`],
  ],
});
const empty = sign({ kind: 10003, content: "", tags: [] }, secondOwnerKey);
const fixtures = [
  list,
  pins,
  bookmarks,
  empty,
  sign(
    { kind: 0, tags: [], content: JSON.stringify({ name: "Followed person" }) },
    mutedKey,
  ),
];

test("follow lists, pins and bookmarks render linked public entries", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.routeWebSocket(/wss?:\/\//, (socket) => {
    socket.onMessage((raw) => {
      const message = JSON.parse(String(raw));
      if (!Array.isArray(message)) return;
      const [verb, id, ...filters] = message;
      if (verb !== "REQ") return;
      for (const event of fixtures) {
        if (
          filters.some(
            (f: {
              kinds?: number[];
              ids?: string[];
              authors?: string[];
              "#p"?: string[];
            }) =>
              (!f.kinds || f.kinds.includes(event.kind)) &&
              (!f.ids || f.ids.includes(event.id)) &&
              (!f.authors || f.authors.includes(event.pubkey)) &&
              (!f["#p"] ||
                event.tags.some(
                  (t) => t[0] === "p" && f["#p"]!.includes(t[1]),
                )),
          )
        )
          socket.send(JSON.stringify(["EVENT", id, event]));
      }
      socket.send(JSON.stringify(["EOSE", id]));
    });
  });
  await page.goto(
    "/?q=" + encodeURIComponent("kind:3 OR kind:10001 OR kind:10003"),
  );
  await expect(page.getByTestId("list-content")).toHaveCount(4);
  const following = page.locator(`[data-event-id="${list.id}"]`);
  await expect(following).toContainText("Following");
  await expect(
    following.getByRole("link", { name: "Profile: Followed person" }),
  ).toHaveAttribute("href", `/p/${nip19.npubEncode(muted)}`);
  await expect(following).not.toContainText("Private entries");
  await expect(following).not.toContainText("LEGACY_RELAY_CONTENT");
  const pinned = page.locator(`[data-event-id="${pins.id}"]`);
  await expect(pinned).toContainText("Pinned notes");
  await expect(pinned.getByRole("link", { name: /^note:/ })).toHaveCount(8);
  await pinned
    .getByRole("button", { name: "Show 2 more (2 remaining)" })
    .click();
  await expect(pinned.getByRole("link", { name: /^note:/ })).toHaveCount(10);
  await pinned.getByRole("button", { name: "Show fewer" }).click();
  await expect(pinned.getByRole("link", { name: /^note:/ })).toHaveCount(8);
  const saved = page.locator(`[data-event-id="${bookmarks.id}"]`);
  await expect(saved).toContainText("Bookmarks");
  await expect(saved.getByRole("link", { name: /^note:/ })).toHaveAttribute(
    "href",
    `/e/${nip19.neventEncode({ id: thread })}`,
  );
  await expect(
    saved.getByRole("link", { name: "article: An article:with colons" }),
  ).toHaveAttribute("href", `/e/${nip19.naddrEncode(address)}`);
  await expect(saved).toContainText("Private entries are encrypted.");
  await expect(saved).not.toContainText("PRIVATE_CIPHERTEXT");
  await expect(saved.locator('img[src*="secret.png"]')).toHaveCount(0);
  await expect(page.locator(`[data-event-id="${empty.id}"]`)).toContainText(
    "No public entries.",
  );
  await expect(page.getByRole("button", { name: /nevent1/ })).toHaveCount(0);
  await saved.getByRole("button", { name: "Open in portals" }).click();
  await page.getByText("Show raw JSON", { exact: true }).click();
  await expect(saved).toContainText("PRIVATE_CIPHERTEXT");
  await saved.getByRole("button", { name: "Open in portals" }).click();
  await page.getByText("Hide raw JSON", { exact: true }).click();
  await expect(saved.getByTestId("list-content")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath("lists-mobile.png"),
    fullPage: true,
  });
});
