import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { prisma } from "@/server/lib/db";

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

function mapClerkRole(clerkRole: string): "ADMIN" | "MANAGER" | "ENGINEER" | "VIEWER" {
  switch (clerkRole) {
    case "org:admin":
      return "ADMIN";
    case "org:manager":
      return "MANAGER";
    case "org:engineer":
      return "ENGINEER";
    default:
      return "VIEWER";
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function POST(req: Request): Promise<NextResponse> {
  const WEBHOOK_SECRET = process.env["CLERK_WEBHOOK_SECRET"];
  if (!WEBHOOK_SECRET) {
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

  let evt: WebhookEvent;
  try {
    const wh = new Webhook(WEBHOOK_SECRET);
    evt = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Webhook verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const eventType = evt.type;
  console.log(`[Clerk Webhook] type=${eventType}`);

  try {
    switch (eventType) {
      case "organization.created": {
        const { data } = evt as ClerkOrganizationEvent;
        await prisma.organization.create({
          data: {
            clerkOrgId: data.id,
            name: data.name,
            slug: data.slug || slugify(data.name),
            tier: "FREE",
            settings: {},
          },
        });
        console.log(`[Clerk Webhook] Created organization: ${data.name}`);
        break;
      }

      case "organization.updated": {
        const { data } = evt as ClerkOrganizationEvent;
        await prisma.organization.update({
          where: { clerkOrgId: data.id },
          data: {
            name: data.name,
            slug: data.slug || slugify(data.name),
          },
        });
        console.log(`[Clerk Webhook] Updated organization: ${data.name}`);
        break;
      }

      case "organization.deleted": {
        const { data } = evt as ClerkOrganizationEvent;
        console.warn(`[Clerk Webhook] Organization deleted in Clerk: ${data.id} — data preserved locally`);
        break;
      }

      case "organizationMembership.created": {
        const { data } = evt as ClerkMembershipEvent;
        const org = await prisma.organization.findUnique({
          where: { clerkOrgId: data.organization.id },
        });
        if (!org) {
          console.warn(`[Clerk Webhook] Org not found for membership: ${data.organization.id}`);
          break;
        }
        const clerkUserId = data.public_user_data.user_id;
        const existingUser = await prisma.user.findUnique({
          where: { clerkUserId },
        });
        if (existingUser) {
          await prisma.user.update({
            where: { clerkUserId },
            data: {
              organizationId: org.id,
              role: mapClerkRole(data.role),
            },
          });
        } else {
          await prisma.user.create({
            data: {
              clerkUserId,
              organizationId: org.id,
              email: `${clerkUserId}@placeholder.local`,
              name: "Unknown",
              role: mapClerkRole(data.role),
            },
          });
        }
        console.log(`[Clerk Webhook] Membership created: user=${clerkUserId} org=${org.slug} role=${data.role}`);
        break;
      }

      case "organizationMembership.updated": {
        const { data } = evt as ClerkMembershipEvent;
        const clerkUserId = data.public_user_data.user_id;
        await prisma.user.update({
          where: { clerkUserId },
          data: { role: mapClerkRole(data.role) },
        });
        console.log(`[Clerk Webhook] Membership updated: user=${clerkUserId} role=${data.role}`);
        break;
      }

      case "organizationMembership.deleted": {
        const { data } = evt as ClerkMembershipEvent;
        console.warn(`[Clerk Webhook] Membership deleted: user=${data.public_user_data.user_id} — data preserved`);
        break;
      }

      case "user.created": {
        const { data } = evt as ClerkUserEvent;
        const email = data.email_addresses[0]?.email_address;
        if (!email) {
          console.warn(`[Clerk Webhook] User created without email: ${data.id}`);
          break;
        }
        const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || "Unknown";
        const existingUser = await prisma.user.findUnique({
          where: { clerkUserId: data.id },
        });
        if (existingUser) {
          await prisma.user.update({
            where: { clerkUserId: data.id },
            data: { email, name },
          });
        }
        // If no org yet, skip creation — membership event will handle it
        console.log(`[Clerk Webhook] User created: ${email}`);
        break;
      }

      case "user.updated": {
        const { data } = evt as ClerkUserEvent;
        const email = data.email_addresses[0]?.email_address;
        const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || "Unknown";
        const existingUser = await prisma.user.findUnique({
          where: { clerkUserId: data.id },
        });
        if (existingUser) {
          await prisma.user.update({
            where: { clerkUserId: data.id },
            data: {
              ...(email ? { email } : {}),
              name,
            },
          });
          console.log(`[Clerk Webhook] User updated: ${data.id}`);
        }
        break;
      }

      default:
        console.log(`[Clerk Webhook] Unhandled event type: ${eventType}`);
    }
  } catch (err) {
    console.error(`[Clerk Webhook] Error processing ${eventType}:`, err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
