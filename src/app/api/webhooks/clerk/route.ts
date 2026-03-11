import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { prisma } from "@/server/lib/db";
import {
  deleteOrganizationMembership,
  ensureUserRecord,
  mapClerkRole,
  upsertOrganization,
  upsertOrganizationMembership,
} from "@/server/lib/organization-membership";

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
  const webhookSecret = process.env["CLERK_WEBHOOK_SECRET"];
  if (!webhookSecret) {
    console.error("CLERK_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
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
    console.error("Webhook verification failed:", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const eventType = event.type;
  console.log(`[Clerk Webhook] type=${eventType}`);

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
        console.log(`[Clerk Webhook] Upserted organization: ${data.name}`);
        break;
      }

      case "organization.deleted": {
        const { data } = event as ClerkOrganizationEvent;
        console.warn(
          `[Clerk Webhook] Organization deleted in Clerk: ${data.id} - data preserved locally`,
        );
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
          console.warn(
            `[Clerk Webhook] Org not found for membership event: ${data.organization.id}`,
          );
          break;
        }

        const clerkUserId = data.public_user_data.user_id;
        await upsertOrganizationMembership({
          organizationId: organization.id,
          clerkMembershipId: data.id,
          clerkUserId,
          role: mapClerkRole(data.role),
        });
        console.log(
          `[Clerk Webhook] Membership upserted: user=${clerkUserId} org=${organization.slug} role=${data.role}`,
        );
        break;
      }

      case "organizationMembership.deleted": {
        const { data } = event as ClerkMembershipEvent;
        await deleteOrganizationMembership({
          clerkMembershipId: data.id,
          clerkOrgId: data.organization.id,
          clerkUserId: data.public_user_data.user_id,
        });
        console.warn(
          `[Clerk Webhook] Membership deleted: user=${data.public_user_data.user_id} org=${data.organization.id}`,
        );
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
        console.log(`[Clerk Webhook] User upserted: ${data.id}`);
        break;
      }

      default:
        console.log(`[Clerk Webhook] Unhandled event type: ${eventType}`);
    }
  } catch (error) {
    console.error(`[Clerk Webhook] Error processing ${eventType}:`, error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
