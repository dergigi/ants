import { verifyEvent, type Event } from "nostr-tools";

export const isPaymentKind = (kind?: number) => kind === 9735 || kind === 9321;
type PaymentEvent = {
  kind?: number;
  pubkey: string;
  content: string;
  tags: string[][];
};
export type PaymentPreview = {
  sender: string | null;
  recipient: string | null;
  amount: string | null;
  unit: string;
  comment: string;
  anonymous: boolean;
  mint: string | null;
};
const key = (value?: string) =>
  value && /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : null;
const tag = (event: PaymentEvent, name: string) =>
  event.tags.find((t) => t[0] === name)?.[1];

// Read the published invoice amount, without claiming settlement verification.
// Decimal strings preserve sub-satoshi amounts and avoid floating point rounding.
export function invoiceSats(invoice?: string): string | null {
  const match = invoice
    ?.trim()
    .match(/^ln(?:bcrt|tbs|bc|tb)([0-9]{1,18})([munp]?)1/i);
  if (!match) return null;
  const digits = match[1].replace(/^0+/, "");
  if (!digits) return null;
  const scale =
    ({ m: 5, u: 2, n: -1, p: -4 } as Record<string, number>)[
      match[2].toLowerCase()
    ] ?? 8;
  if (scale >= 0) return digits + "0".repeat(scale);
  const padded = digits.padStart(-scale + 1, "0");
  const fraction = padded.slice(scale).replace(/0+$/, "");
  return padded.slice(0, scale) + (fraction ? `.${fraction}` : "");
}

export function parsePayment(event: PaymentEvent): PaymentPreview {
  const recipient = key(tag(event, "p"));
  if (event.kind === 9735) {
    let request: Event | null = null;
    try {
      const description = tag(event, "description");
      if (description && description.length <= 65536) {
        const parsed = JSON.parse(description) as Event;
        if (
          parsed.kind === 9734 &&
          verifyEvent(parsed) &&
          recipient &&
          key(tag(parsed, "p")) === recipient &&
          tag(parsed, "e") === tag(event, "e") &&
          tag(parsed, "a") === tag(event, "a")
        )
          request = parsed;
      }
    } catch {
      /* Missing or malformed requests must not identify the wallet as the sender. */
    }
    const anonymous = request?.tags.some((t) => t[0] === "anon") ?? false;
    return {
      recipient,
      sender: request && !anonymous ? key(request.pubkey) : null,
      amount: invoiceSats(tag(event, "bolt11")),
      unit: "sats",
      anonymous,
      comment: request?.content || "",
      mint: null,
    };
  }
  let amount: string | null = null;
  try {
    const proofs = event.tags.filter((t) => t[0] === "proof");
    if (!proofs.length || proofs.length > 1000)
      throw new Error("Invalid proof count");
    let sum = BigInt(0);
    for (const proof of proofs) {
      if (!proof[1] || proof[1].length > 16384)
        throw new Error("Invalid proof");
      const value: unknown = JSON.parse(proof[1]).amount;
      if (typeof value !== "number" && typeof value !== "string")
        throw new Error("Invalid amount");
      if (typeof value === "number" && !Number.isSafeInteger(value))
        throw new Error("Unsafe amount");
      const raw = String(value);
      if (!/^[0-9]{1,18}$/.test(raw) || BigInt(raw) <= BigInt(0))
        throw new Error("Invalid amount");
      sum += BigInt(raw);
    }
    amount = sum.toString();
  } catch {
    /* Do not display a partial total when any proof is malformed. */
  }
  let mint: string | null = null;
  try {
    const url = new URL(tag(event, "u") || "");
    if (url.protocol === "https:" || url.protocol === "http:") mint = url.href;
  } catch {}
  return {
    recipient,
    sender: key(event.pubkey),
    amount,
    unit: tag(event, "unit")?.trim().slice(0, 12) || "sat",
    anonymous: false,
    comment: event.content || "",
    mint,
  };
}
