import { auth, clerkClient } from "@clerk/nextjs/server";
import { getTenantClient, prisma } from "@/server/lib/db";
import {
  mapClerkRole,
  upsertOrganization,
  upsertOrganizationMembership,
  type AppRole,
} from "@/server/lib/organization-membership";

export class TenantAccessError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "TenantAccessError";
  }
}

export interface TenantContext {
  clerkUserId: string;
  clerkOrgId: string;
  clerkOrgRole: string | null;
  appRole: AppRole;
  organizationId: string;
  tenantDb: ReturnType<typeof getTenantClient>;
}

export async function ensureOrganizationForClerkOrgId(clerkOrgId: string) {
  const existing = await prisma.organization.findFirst({
    where: { clerkOrgId },
  });
  if (existing) {
    return existing;
  }

  const client = await clerkClient();
  const clerkOrg = await client.organizations.getOrganization({
    organizationId: clerkOrgId,
  });

  return upsertOrganization({
    clerkOrgId,
    name: clerkOrg.name,
    slug: clerkOrg.slug,
  });
}

export async function requireTenantContext(input: {
  clerkUserId: string | null;
  clerkOrgId: string | null | undefined;
  clerkOrgRole?: string | null | undefined;
}) {
  if (!input.clerkUserId) {
    throw new TenantAccessError("Unauthorized", 401);
  }

  if (!input.clerkOrgId) {
    throw new TenantAccessError(
      "No organization selected. Please select or create an organization.",
      403,
    );
  }

  const organization = await ensureOrganizationForClerkOrgId(input.clerkOrgId);
  const appRole = mapClerkRole(input.clerkOrgRole);

  await upsertOrganizationMembership({
    organizationId: organization.id,
    clerkUserId: input.clerkUserId,
    role: appRole,
  });

  return {
    clerkUserId: input.clerkUserId,
    clerkOrgId: input.clerkOrgId,
    clerkOrgRole: input.clerkOrgRole ?? null,
    appRole,
    organizationId: organization.id,
    tenantDb: getTenantClient(organization.id),
  } satisfies TenantContext;
}

export async function requireTenantContextFromSession() {
  const { userId, orgId, orgRole } = await auth();

  return requireTenantContext({
    clerkUserId: userId,
    clerkOrgId: orgId,
    clerkOrgRole: orgRole,
  });
}
