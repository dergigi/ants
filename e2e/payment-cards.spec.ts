import { expect, test } from "@playwright/test";
import { finalizeEvent, getPublicKey, type EventTemplate } from "nostr-tools";

const payerKey = new Uint8Array(32).fill(1);
const walletKey = new Uint8Array(32).fill(2);
const recipientKey = new Uint8Array(32).fill(3);
const recipient = getPublicKey(recipientKey);
const created_at = Math.floor(Date.now() / 1000) - 60;
const sign = (event: Omit<EventTemplate, "created_at">, key = payerKey) =>
  finalizeEvent({ ...event, created_at }, key);
const note = sign(
  { kind: 1, content: "The original note", tags: [] },
  recipientKey,
);
const request = sign({
  kind: 9734,
  content: "Thanks for sharing!",
  tags: [
    ["p", recipient],
    ["e", note.id],
  ],
});
const zap = sign(
  {
    kind: 9735,
    content: "",
    tags: [
      ["p", recipient],
      ["e", note.id],
      ["bolt11", "lnbc420n1fixture"],
      ["description", JSON.stringify(request)],
    ],
  },
  walletKey,
);
const nutzap = sign({
  kind: 9321,
  content: "A little ecash appreciation.",
  tags: [
    ["p", recipient],
    ["e", note.id],
    ["proof", JSON.stringify({ amount: 32 })],
    ["proof", JSON.stringify({ amount: 16 })],
    ["proof", JSON.stringify({ amount: 2 })],
    ["u", "https://mint.example"],
    ["unit", "sat"],
  ],
});
const fixtures = [
  note,
  zap,
  nutzap,
  sign({ kind: 0, content: JSON.stringify({ name: "Alice" }), tags: [] }),
  sign(
    { kind: 0, content: JSON.stringify({ name: "Bob" }), tags: [] },
    recipientKey,
  ),
  sign(
    { kind: 0, content: JSON.stringify({ name: "Wallet service" }), tags: [] },
    walletKey,
  ),
];

test("renders payment parties, amounts, details and parent navigation on mobile", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.routeWebSocket(/wss?:\/\//, (socket) => {
    socket.onMessage((raw) => {
      const message = JSON.parse(String(raw));
      if (message[0] !== "REQ") return;
      const [, id, ...filters] = message;
      for (const event of fixtures) {
        if (
          filters.some(
            (filter: {
              kinds?: number[];
              ids?: string[];
              authors?: string[];
            }) =>
              (!filter.kinds || filter.kinds.includes(event.kind)) &&
              (!filter.ids || filter.ids.includes(event.id)) &&
              (!filter.authors || filter.authors.includes(event.pubkey)),
          )
        )
          socket.send(JSON.stringify(["EVENT", id, event]));
      }
      socket.send(JSON.stringify(["EOSE", id]));
    });
  });
  await page.goto("/?q=kind%3A9735%20OR%20kind%3A9321");
  const payments = page.getByTestId("payment-content");
  await expect(payments).toHaveCount(2);
  const zapCard = payments.filter({ hasText: "Thanks for sharing!" });
  const nutCard = payments.filter({ hasText: "A little ecash appreciation." });
  await expect(
    zapCard.getByRole("link", { name: "Sender: Alice" }),
  ).toHaveAttribute("href", /\/p\/npub/);
  await expect(
    zapCard.getByRole("link", { name: "Recipient: Bob" }),
  ).toBeVisible();
  await expect(
    zapCard.getByRole("button", { name: "Zap: 42 sats. Transaction details" }),
  ).toBeVisible();
  await expect(
    nutCard.getByRole("button", {
      name: "Nutzap: 50 sat. Transaction details",
    }),
  ).toBeVisible();
  await nutCard.getByRole("button", { name: /Transaction details/ }).click();
  await expect(nutCard.getByRole("note")).toContainText(
    "payment not independently verified",
  );
  await expect(
    nutCard.getByRole("link", { name: "Mint: mint.example" }),
  ).toHaveAttribute("href", "https://mint.example/");
  await page.getByRole("button", { name: /Zap for/ }).click();
  await expect(
    page.getByText("The original note", { exact: true }).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await expect(
    zapCard.getByRole("link", { name: "Sender: Alice" }),
  ).toHaveAttribute("title", "Sender: Alice");
  const card = page.locator(`[data-event-id="${zap.id}"]`);
  await card.getByRole("button", { name: "Open in portals" }).click();
  await page.getByText("Show raw JSON", { exact: true }).click();
  await expect(card).toContainText('"bolt11"');
  await card.getByRole("button", { name: "Open in portals" }).click();
  await page.getByText("Hide raw JSON", { exact: true }).click();
  await expect(zapCard).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("payment-cards-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: testInfo.outputPath("payment-cards-desktop.png"), fullPage: true });
});
