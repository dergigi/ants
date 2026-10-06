import { finalizeEvent, getPublicKey } from "nostr-tools";
import { invoiceSats, parsePayment } from "../payments";

const secret = new Uint8Array(32).fill(1);
const sender = getPublicKey(secret);
const recipient = "b".repeat(64);
const target = "c".repeat(64);
const base = {
  kind: 9735,
  pubkey: "d".repeat(64),
  content: "",
  tags: [
    ["p", recipient],
    ["e", target],
    ["bolt11", "lnbc420n1test"],
  ],
};
function receipt(extraTags: string[][] = []) {
  const request = finalizeEvent(
    {
      kind: 9734,
      created_at: 1,
      content: "Thanks!",
      tags: [["p", recipient], ["e", target], ...extraTags],
    },
    secret,
  );
  return {
    ...base,
    tags: [...base.tags, ["description", JSON.stringify(request)]],
  };
}
const nut = (proofs: unknown[], extraTags: string[][] = []) => ({
  kind: 9321,
  pubkey: sender,
  content: "Great post",
  tags: [
    ["p", recipient],
    ...proofs.map((amount) => ["proof", JSON.stringify({ amount })]),
    ...extraTags,
  ],
});

describe("payment previews", () => {
  it.each([
    ["lnbc1m1data", "100000"],
    ["lnbc42u1data", "4200"],
    ["lnbc420n1data", "42"],
    ["LNTB1000P1DATA", "0.1"],
    ["lnbc10p1data", "0.001"],
    ["lnbc2ndata", null],
    ["lnbc1data", null],
    ["lnbc0u1data", null],
  ])("reads invoice %s as %s sats", (invoice, amount) => {
    expect(invoiceSats(invoice)).toBe(amount);
  });
  it("uses the signed request sender, not the receipt publisher, and reads the invoice amount", () => {
    expect(parsePayment(receipt([["amount", "999999"]]))).toMatchObject({
      sender,
      recipient,
      amount: "42",
      unit: "sats",
      comment: "Thanks!",
    });
  });
  it("hides anonymous request identities", () => {
    expect(
      parsePayment(receipt([["anon", "encrypted-private-zap"]])),
    ).toMatchObject({ sender: null, anonymous: true });
  });
  it("rejects forged, mismatched and malformed request identities", () => {
    const forged = receipt();
    const request = JSON.parse(forged.tags.at(-1)![1]);
    request.pubkey = recipient;
    forged.tags[forged.tags.length - 1][1] = JSON.stringify(request);
    expect(parsePayment(forged).sender).toBeNull();
    const mismatch = receipt();
    mismatch.tags = mismatch.tags.map((t) =>
      t[0] === "e" ? ["e", "a".repeat(64)] : t,
    );
    expect(parsePayment(mismatch).sender).toBeNull();
    expect(
      parsePayment({
        ...base,
        tags: [...base.tags, ["P", sender], ["description", "{bad"]],
      }).sender,
    ).toBeNull();
  });
  it("adds all nutzap proofs exactly and respects their unit", () => {
    expect(parsePayment(nut([32, 16, 2]))).toMatchObject({
      amount: "50",
      unit: "sat",
      sender,
      recipient,
    });
    expect(
      parsePayment(nut(["999999999999999999", "2"], [["unit", "usd"]])),
    ).toMatchObject({ amount: "1000000000000000001", unit: "usd" });
  });
  it.each(
    [
      [],
      [2, -1],
      [2, "oops"],
      [2, 0],
      [2, 1.5],
      [Number.MAX_SAFE_INTEGER + 1],
      [null],
    ].map((proofs) => ({ proofs })),
  )("does not fabricate totals for invalid proofs $proofs", ({ proofs }) => {
    expect(parsePayment(nut(proofs)).amount).toBeNull();
  });
  it("keeps malformed JSON and unsafe mint URLs out of payment previews", () => {
    expect(
      parsePayment({
        ...nut([1]),
        tags: [
          ["proof", "{bad"],
          ["u", "javascript:alert(1)"],
        ],
      }),
    ).toMatchObject({ amount: null, recipient: null, mint: null });
    expect(parsePayment(nut([1], [["u", "https://mint.example"]])).mint).toBe(
      "https://mint.example/",
    );
  });
});
