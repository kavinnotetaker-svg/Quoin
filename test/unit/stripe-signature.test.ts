import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { verifyStripeWebhookSignature } from "@/server/integrations/stripe/signature";

describe("Stripe webhook signature verification", () => {
  it("accepts a valid signature", () => {
    const payload = JSON.stringify({ id: "evt_123", type: "invoice.paid" });
    const secret = "whsec_test";
    const timestamp = "1710000000";
    const signature = crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}.${payload}`, "utf8")
      .digest("hex");

    expect(
      verifyStripeWebhookSignature({
        payload,
        secret,
        signatureHeader: `t=${timestamp},v1=${signature}`,
        now: new Date(Number(timestamp) * 1000),
      }),
    ).toBe(true);
  });

  it("rejects an invalid signature", () => {
    expect(
      verifyStripeWebhookSignature({
        payload: "{}",
        secret: "whsec_test",
        signatureHeader: "t=1710000000,v1=deadbeef",
        now: new Date("2024-03-09T00:00:00.000Z"),
      }),
    ).toBe(false);
  });
});
