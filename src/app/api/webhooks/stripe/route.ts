import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { inngest } from "@/server/inngest/client";
import { stripeWebhookReceivedEvent } from "@/server/inngest/events";
import { verifyStripeWebhookSignature } from "@/server/integrations/stripe/signature";

export async function POST(req: Request) {
  const body = await req.text();
  const signature = (await headers()).get("Stripe-Signature");
  const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"];

  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
  }

  if (!webhookSecret) {
    console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const verified = verifyStripeWebhookSignature({
    payload: body,
    signatureHeader: signature,
    secret: webhookSecret,
  });

  if (!verified) {
    return NextResponse.json({ error: "Invalid Stripe signature" }, { status: 400 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = typeof event["id"] === "string" ? event["id"] : null;
  const eventType = typeof event["type"] === "string" ? event["type"] : null;

  if (!eventId || !eventType) {
    return NextResponse.json({ error: "Malformed Stripe event" }, { status: 400 });
  }

  await inngest.send(
    stripeWebhookReceivedEvent({
      eventId,
      type: eventType,
      payload: event,
    }),
  );

  return NextResponse.json({ received: true });
}
