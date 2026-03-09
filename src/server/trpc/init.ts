import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getTenantClient, prisma } from "@/server/lib/db";
import {
  hasRequiredRole,
  mapClerkOrgRole,
  type AppRole,
} from "@/server/lib/access";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  clerkOrgId: string;
  tier: string;
}

async function findOrgByClerkId(clerkOrgId: string): Promise<OrgRow | null> {
  const org = await prisma.organization.findUnique({
    where: { clerkOrgId },
    select: { id: true, name: true, slug: true, clerkOrgId: true, tier: true },
  });

  if (!org) {
    return null;
  }

  return org;
}

async function ensureOrgExists(
  clerkOrgId: string,
  name: string,
  slug: string,
): Promise<OrgRow> {
  return prisma.organization.upsert({
    where: { clerkOrgId },
    update: {},
    create: {
      name,
      slug,
      clerkOrgId,
      tier: "FREE",
    },
    select: { id: true, name: true, slug: true, clerkOrgId: true, tier: true },
  });
}

export async function createContext() {
  const { userId, orgId, orgRole } = await auth();

  return {
    clerkUserId: userId,
    clerkOrgId: orgId,
    clerkOrgRole: orgRole,
    appRole: mapClerkOrgRole(orgRole),
    prisma,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const enforceAuth = t.middleware(async ({ ctx, next }) => {
  if (!ctx.clerkUserId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({ ctx: { ...ctx, clerkUserId: ctx.clerkUserId } });
});

export const protectedProcedure = t.procedure.use(enforceAuth);

function tenantAccessMiddleware(minimumRole: AppRole) {
  return t.middleware(async ({ ctx, next }) => {
    if (!ctx.clerkUserId) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    if (!ctx.clerkOrgId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "No organization selected. Please select or create an organization.",
      });
    }

    let org = await findOrgByClerkId(ctx.clerkOrgId);

    if (!org) {
      try {
        const client = await clerkClient();
        const clerkOrg = await client.organizations.getOrganization({
          organizationId: ctx.clerkOrgId,
        });
        const slug =
          clerkOrg.slug ||
          clerkOrg.name
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, "")
            .replace(/\s+/g, "-");

        org = await ensureOrgExists(ctx.clerkOrgId, clerkOrg.name, slug);
      } catch (syncErr) {
        console.error("[tenantAccessMiddleware] Auto-sync org failed:", syncErr);
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organization not found. It may not have synced yet.",
        });
      }
    }

    const appRole = mapClerkOrgRole(ctx.clerkOrgRole);
    if (!hasRequiredRole(appRole, minimumRole)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Forbidden" });
    }

    return next({
      ctx: {
        ...ctx,
        clerkUserId: ctx.clerkUserId,
        clerkOrgId: ctx.clerkOrgId,
        appRole,
        organizationId: org.id,
        tenantDb: getTenantClient(org.id),
      },
    });
  });
}

export const tenantProcedure = t.procedure.use(tenantAccessMiddleware("VIEWER"));
export const tenantWriteProcedure = t.procedure.use(
  tenantAccessMiddleware("ENGINEER"),
);
export const tenantManagerProcedure = t.procedure.use(
  tenantAccessMiddleware("MANAGER"),
);
export const tenantAdminProcedure = t.procedure.use(
  tenantAccessMiddleware("ADMIN"),
);
