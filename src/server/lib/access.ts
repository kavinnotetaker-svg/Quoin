import { auth } from "@clerk/nextjs/server";
import { getTenantClient, prisma } from "@/server/lib/db";

export type AppRole = "ADMIN" | "MANAGER" | "ENGINEER" | "VIEWER";

const ROLE_PRIORITY: Record<AppRole, number> = {
  VIEWER: 0,
  ENGINEER: 1,
  MANAGER: 2,
  ADMIN: 3,
};

export class AccessError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AccessError";
  }
}

export interface TenantAccessContext {
  clerkUserId: string;
  clerkOrgId: string;
  clerkOrgRole: string | null;
  appRole: AppRole;
  organizationId: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    clerkOrgId: string;
    tier: string;
  };
  tenantDb: ReturnType<typeof getTenantClient>;
}

export function mapClerkOrgRole(clerkRole: string | null | undefined): AppRole {
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

export function hasRequiredRole(
  actualRole: AppRole,
  minimumRole: AppRole,
): boolean {
  return ROLE_PRIORITY[actualRole] >= ROLE_PRIORITY[minimumRole];
}

export function requireMinimumRole(
  actualRole: AppRole,
  minimumRole: AppRole,
): AppRole {
  if (!hasRequiredRole(actualRole, minimumRole)) {
    throw new AccessError("Forbidden", 403);
  }
  return actualRole;
}

export async function findOrganizationByClerkOrgId(clerkOrgId: string) {
  return prisma.organization.findUnique({
    where: { clerkOrgId },
    select: {
      id: true,
      name: true,
      slug: true,
      clerkOrgId: true,
      tier: true,
    },
  });
}

export async function requireRouteTenantAccess(
  minimumRole: AppRole = "VIEWER",
): Promise<TenantAccessContext> {
  const { userId, orgId, orgRole } = await auth();

  if (!userId) {
    throw new AccessError("Unauthorized", 401);
  }

  if (!orgId) {
    throw new AccessError(
      "No organization selected. Please select or create an organization.",
      403,
    );
  }

  const organization = await findOrganizationByClerkOrgId(orgId);
  if (!organization) {
    throw new AccessError("Organization not found", 404);
  }

  const appRole = mapClerkOrgRole(orgRole);
  requireMinimumRole(appRole, minimumRole);

  return {
    clerkUserId: userId,
    clerkOrgId: orgId,
    clerkOrgRole: orgRole ?? null,
    appRole,
    organizationId: organization.id,
    organization,
    tenantDb: getTenantClient(organization.id),
  };
}
