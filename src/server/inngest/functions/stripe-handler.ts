import { inngest } from "../client";
import { prisma } from "@/server/lib/db";
import { stripeWebhookReceivedEventSchema } from "../events";

/**
 * Handles Stripe webhook events asynchronously to prevent timeouts.
 */
export const stripeWebhookJob = inngest.createFunction(
    {
        id: "stripe-webhook-handler",
        retries: 3,
        onFailure: async ({ error }) => {
            console.error(`[DLQ] Stripe webhook processing failed`, error);
        }
    },
    { event: "stripe/webhook.received" },
    async ({ event, step }) => {
        const { type, payload } = stripeWebhookReceivedEventSchema.parse(event.data);

        await step.run("process-stripe-event", async () => {
            console.log(`[Stripe Handler] Processing event type: ${type}`);
            const customerId =
                typeof payload["data"] === "object" &&
                payload["data"] !== null &&
                typeof (payload["data"] as Record<string, unknown>)["object"] === "object" &&
                (payload["data"] as Record<string, unknown>)["object"] !== null &&
                typeof ((payload["data"] as Record<string, unknown>)["object"] as Record<string, unknown>)["customer"] === "string"
                    ? (((payload["data"] as Record<string, unknown>)["object"] as Record<string, unknown>)["customer"] as string)
                    : null;

            switch (type) {
                case "customer.subscription.created":
                case "customer.subscription.updated": {
                    if (!customerId) {
                        break;
                    }
                    // Example logic - upgrade organization to PRO if subscribed
                    await prisma.organization.updateMany({
                        where: { stripeCustomerId: customerId },
                        data: { tier: "PRO" }, // Simplified
                    });
                    break;
                }
                case "customer.subscription.deleted": {
                    if (!customerId) {
                        break;
                    }
                    // Downgrade to FREE
                    await prisma.organization.updateMany({
                        where: { stripeCustomerId: customerId },
                        data: { tier: "FREE" },
                    });
                    break;
                }
                default:
                    console.log(`Unhandled Stripe event type: ${type}`);
            }
        });

        return { processed: true, type };
    }
);
