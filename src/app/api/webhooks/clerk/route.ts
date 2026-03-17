import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { prisma } from "@/server/lib/db";
import { toHttpErrorResponseBody } from "@/server/lib/errors";
import { createLogger } from "@/server/lib/logger";
import {
  deleteOrganizationMembership,
  ensureUserRecord,
  mapClerkRole,
  upsertOrganization,
  upsertOrganizationMembership,
} from "@/server/lib/organization-membership";
import { getClerkWebhookSecret } from "@/server/lib/config";

interface ClerkOrganizationEvent {
  data: {
    id: string;
    name: string;
    slug: string;
  };
  type: string;
}

interface ClerkMembershipEvent {
  data: {
    id: string;
    organization: { id: string };
    public_user_data: {
      user_id: string;
    };
    role: string;
  };
  type: string;
}

interface ClerkUserEvent {
  data: {
    id: string;
    email_addresses: Array<{ email_address: string }>;
    first_name: string | null;
    last_name: string | null;
  };
  type: string;
}

type WebhookEvent = ClerkOrganizationEvent | ClerkMembershipEvent | ClerkUserEvent;

export async function POST(req: Request): Promise<NextResponse> {
  const requestId = randomUUID();
  const logger = createLogger({
    requestId,
    procedure: "clerk.webhook",
  });
  const webhookSecret = getClerkWebhookSecret();

  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    logger.warn("Clerk webhook request missing svix headers");
    return NextResponse.json(
      { error: "Missing svix headers", requestId },
      { status: 400 },
    );
  }

  const payload = await req.text();

  let event: WebhookEvent;
  try {
    const webhook = new Webhook(webhookSecret);
    event = webhook.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch (error) {
    logger.warn("Clerk webhook verification failed", {
      error,
    });
    return NextResponse.json(
      { error: "Invalid signature", requestId },
      { status: 400 },
    );
  }

  const eventType = event.type;
  logger.info("Processing Clerk webhook event", {
    eventType,
  });

  try {
    switch (eventType) {
      case "organization.created":
      case "organization.updated": {
        const { data } = event as ClerkOrganizationEvent;
        await upsertOrganization({
          clerkOrgId: data.id,
          name: data.name,
          slug: data.slug,
        });
        logger.info("Upserted organization from Clerk webhook", {
          clerkOrgId: data.id,
          organizationName: data.name,
        });
        break;
      }

      case "organization.deleted": {
        const { data } = event as ClerkOrganizationEvent;
        logger.warn("Clerk organization deleted; preserving local data", {
          clerkOrgId: data.id,
        });
        break;
      }

      case "organizationMembership.created":
      case "organizationMembership.updated": {
        const { data } = event as ClerkMembershipEvent;
        const organization = await prisma.organization.findUnique({
          where: { clerkOrgId: data.organization.id },
          select: { id: true, slug: true },
        });
        if (!organization) {
          logger.warn("Clerk membership event skipped because organization was not found", {
            clerkOrgId: data.organization.id,
          });
          break;
        }

        const clerkUserId = data.public_user_data.user_id;
        await upsertOrganizationMembership({
          organizationId: organization.id,
          clerkMembershipId: data.id,
          clerkUserId,
          role: mapClerkRole(data.role),
        });
        logger.info("Clerk membership upserted", {
          organizationId: organization.id,
          userId: clerkUserId,
          clerkMembershipId: data.id,
          role: data.role,
        });
        break;
      }

      case "organizationMembership.deleted": {
        const { data } = event as ClerkMembershipEvent;
        await deleteOrganizationMembership({
          clerkMembershipId: data.id,
          clerkOrgId: data.organization.id,
          clerkUserId: data.public_user_data.user_id,
        });
        logger.warn("Clerk membership deleted", {
          userId: data.public_user_data.user_id,
          clerkOrgId: data.organization.id,
          clerkMembershipId: data.id,
        });
        break;
      }

      case "user.created":
      case "user.updated": {
        const { data } = event as ClerkUserEvent;
        await ensureUserRecord({
          clerkUserId: data.id,
          email: data.email_addresses[0]?.email_address,
          name: [data.first_name, data.last_name].filter(Boolean).join(" ") || "Unknown",
        });
        logger.info("Clerk user upserted", {
          userId: data.id,
        });
        break;
      }

      default:
        logger.info("Unhandled Clerk webhook event type", {
          eventType,
        });
    }
  } catch (error) {
    logger.error("Clerk webhook processing failed", {
      eventType,
      error,
    });
    const response = toHttpErrorResponseBody(error, requestId);
    return NextResponse.json(response.body, { status: response.status });
  }

  return NextResponse.json({ received: true });
}
