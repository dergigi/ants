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
  kind: 10000,
  content: "PRIVATE_CIPHERTEXT_https://example.com/secret.png",
  tags: [
    ["p", muted],
    ["e", thread],
    ["t", "nostr"],
    ...Array.from({ length: 10 }, (_, i) => ["word", `muted word ${i}`]),
  ],
});
const second = sign(
  { kind: 10000, content: "", tags: [["p", muted]] },
  secondOwnerKey,
);
const fixtures = [
  list,
  second,
  sign({ kind: 0, tags: [], content: JSON.stringify({ name: "Alice" }) }),
  sign(
    { kind: 0, tags: [], content: JSON.stringify({ name: "Bob" }) },
    secondOwnerKey,
  ),
  sign(
    { kind: 0, tags: [], content: JSON.stringify({ name: "Muted person" }) },
    mutedKey,
  ),
];

test("mention searches render separate mute lists with expandable public entries", async ({
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
  await page.goto(`/?q=${encodeURIComponent(`is:muted mentions:${muted}`)}`);
  await expect(page.getByTestId("mute-list-content")).toHaveCount(2);
  const card = page.locator(`[data-event-id="${list.id}"]`);
  await expect(card).toContainText("13 public muted entries");
  await expect(
    card.getByRole("link", { name: "Muted profile: Muted person" }),
  ).toHaveAttribute("href", `/p/${nip19.npubEncode(muted)}`);
  await expect(
    card.getByRole("link", { name: /Muted thread:/ }),
  ).toHaveAttribute("href", `/e/${nip19.neventEncode({ id: thread })}`);
  await expect(
    card.getByRole("link", { name: "Muted hashtag: #nostr" }),
  ).toHaveAttribute("href", "/?q=%23nostr");
  await expect(
    card.getByRole("link", { name: "Muted word: muted word 0", exact: true }),
  ).toHaveAttribute("href", "/?q=%22muted%20word%200%22");
  await expect(card).toContainText("Private entries are encrypted.");
  await expect(card).not.toContainText("PRIVATE_CIPHERTEXT");
  await expect(card.locator('img[src*="secret.png"]')).toHaveCount(0);
  await expect(card.getByRole("link", { name: /Muted / })).toHaveCount(8);
  await card.getByRole("button", { name: "Show 5 more (5 remaining)" }).click();
  await expect(card.getByRole("link", { name: /Muted / })).toHaveCount(13);
  await card.getByRole("button", { name: "Show fewer" }).click();
  await expect(card.getByRole("link", { name: /Muted / })).toHaveCount(8);
  await expect(page.getByRole("button", { name: /nevent1/ })).toHaveCount(0);
  await card.getByRole("button", { name: "Open in portals" }).click();
  await page.getByText("Show raw JSON", { exact: true }).click();
  await expect(card).toContainText("PRIVATE_CIPHERTEXT");
  await card.getByRole("button", { name: "Open in portals" }).click();
  await page.getByText("Hide raw JSON", { exact: true }).click();
  await expect(card.getByTestId("mute-list-content")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath("mute-lists-mobile.png"),
    fullPage: true,
  });
});
