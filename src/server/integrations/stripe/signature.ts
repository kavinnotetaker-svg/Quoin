import crypto from "crypto";

const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

function parseStripeSignatureHeader(signatureHeader: string) {
  const values = new Map<string, string[]>();

  for (const segment of signatureHeader.split(",")) {
    const [key, value] = segment.split("=", 2);
    if (!key || !value) {
      continue;
    }

    const existing = values.get(key) ?? [];
    existing.push(value);
    values.set(key, existing);
  }

  return values;
}

export function verifyStripeWebhookSignature(input: {
  payload: string;
  signatureHeader: string;
  secret: string;
  now?: Date;
}): boolean {
  const parsed = parseStripeSignatureHeader(input.signatureHeader);
  const timestamp = parsed.get("t")?.[0];
  const signatures = parsed.get("v1") ?? [];

  if (!timestamp || signatures.length === 0) {
    return false;
  }

  const signedAt = Number(timestamp);
  if (!Number.isFinite(signedAt)) {
    return false;
  }

  const now = input.now ?? new Date();
  if (
    Math.abs(Math.floor(now.getTime() / 1000) - signedAt) >
    STRIPE_SIGNATURE_TOLERANCE_SECONDS
  ) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", input.secret)
    .update(`${timestamp}.${input.payload}`, "utf8")
    .digest("hex");

  return signatures.some((signature) => {
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, "hex"),
        Buffer.from(expected, "hex"),
      );
    } catch {
      return false;
    }
  });
}
