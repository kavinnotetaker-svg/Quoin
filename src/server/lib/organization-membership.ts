import { prisma } from "@/server/lib/db";

export type AppRole = "ADMIN" | "MANAGER" | "ENGINEER" | "VIEWER";

export function mapClerkRole(
  clerkRole: string | null | undefined,
): AppRole {
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

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function upsertOrganization(params: {
  clerkOrgId: string;
  name: string;
  slug?: string | null;
}) {
  const normalizedSlug = params.slug?.trim() || slugify(params.name);

  return prisma.organization.upsert({
    where: { clerkOrgId: params.clerkOrgId },
    update: {
      name: params.name,
      slug: normalizedSlug,
    },
    create: {
      clerkOrgId: params.clerkOrgId,
      name: params.name,
      slug: normalizedSlug,
      tier: "FREE",
      settings: {},
    },
  });
}

export async function ensureUserRecord(params: {
  clerkUserId: string;
  email?: string | null;
  name?: string | null;
}) {
  const email = params.email?.trim() || `${params.clerkUserId}@placeholder.local`;
  const name = params.name?.trim() || "Unknown";

  return prisma.user.upsert({
    where: { clerkUserId: params.clerkUserId },
    update: {
      email,
      name,
    },
    create: {
      clerkUserId: params.clerkUserId,
      email,
      name,
    },
  });
}

export async function upsertOrganizationMembership(params: {
  organizationId: string;
  clerkUserId: string;
  role: AppRole;
  clerkMembershipId?: string | null;
  email?: string | null;
  name?: string | null;
}) {
  const user = await ensureUserRecord({
    clerkUserId: params.clerkUserId,
    email: params.email,
    name: params.name,
  });

  const existingMembership =
    params.clerkMembershipId != null
      ? await prisma.organizationMembership.findUnique({
          where: { clerkMembershipId: params.clerkMembershipId },
        })
      : await prisma.organizationMembership.findUnique({
          where: {
            organizationId_userId: {
              organizationId: params.organizationId,
              userId: user.id,
            },
          },
        });

  if (existingMembership) {
    return prisma.organizationMembership.update({
      where: { id: existingMembership.id },
      data: {
        organizationId: params.organizationId,
        userId: user.id,
        role: params.role,
        clerkMembershipId: params.clerkMembershipId ?? existingMembership.clerkMembershipId,
      },
    });
  }

  return prisma.organizationMembership.create({
    data: {
      organizationId: params.organizationId,
      userId: user.id,
      role: params.role,
      clerkMembershipId: params.clerkMembershipId ?? null,
    },
  });
}

export async function deleteOrganizationMembership(params: {
  clerkOrgId: string;
  clerkUserId: string;
  clerkMembershipId?: string | null;
}) {
  if (params.clerkMembershipId) {
    const deleted = await prisma.organizationMembership.deleteMany({
      where: { clerkMembershipId: params.clerkMembershipId },
    });

    if (deleted.count > 0) {
      return deleted.count;
    }
  }

  const organization = await prisma.organization.findUnique({
    where: { clerkOrgId: params.clerkOrgId },
    select: { id: true },
  });
  if (!organization) {
    return 0;
  }

  const user = await prisma.user.findUnique({
    where: { clerkUserId: params.clerkUserId },
    select: { id: true },
  });
  if (!user) {
    return 0;
  }

  const deleted = await prisma.organizationMembership.deleteMany({
    where: {
      organizationId: organization.id,
      userId: user.id,
    },
  });

  return deleted.count;
}
