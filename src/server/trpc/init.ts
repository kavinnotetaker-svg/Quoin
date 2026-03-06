import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma, getTenantClient } from "@/server/lib/db";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  clerk_org_id: string;
  tier: string;
}

/** Find org by Clerk ID using Prisma models. */
async function findOrgByClerkId(clerkOrgId: string): Promise<OrgRow | null> {
  const org = await prisma.organization.findUnique({
    where: { clerkOrgId },
    select: { id: true, name: true, slug: true, clerkOrgId: true, tier: true }
  });
  if (!org) return null;
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    clerk_org_id: org.clerkOrgId,
    tier: org.tier
  };
}

/** Upsert org using Prisma models. */
async function ensureOrgExists(
  clerkOrgId: string,
  name: string,
  slug: string,
): Promise<OrgRow> {
  const org = await prisma.organization.upsert({
    where: { clerkOrgId },
    update: {},
    create: {
      name,
      slug,
      clerkOrgId,
      tier: 'FREE'
    },
    select: { id: true, name: true, slug: true, clerkOrgId: true, tier: true }
  });

  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    clerk_org_id: org.clerkOrgId,
    tier: org.tier
  };
}

export async function createContext() {
  const { userId, orgId, orgRole } = await auth();

  return {
    clerkUserId: userId,
    clerkOrgId: orgId,
    clerkOrgRole: orgRole,
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

const enforceTenant = t.middleware(async ({ ctx, next }) => {
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

  // Raw SQL lookup — bypasses Prisma model layer / PrismaPg adapter issues
  let org = await findOrgByClerkId(ctx.clerkOrgId);

  if (!org) {
    // Auto-sync: Clerk webhook doesn't fire in local dev.
    // Fetch org from Clerk API and insert via raw SQL.
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
      console.error("[enforceTenant] Auto-sync org failed:", syncErr);
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Organization not found. It may not have synced yet.",
      });
    }
  }

  const tenantDb = getTenantClient(org.id);

  return next({
    ctx: {
      ...ctx,
      clerkUserId: ctx.clerkUserId,
      clerkOrgId: ctx.clerkOrgId,
      organizationId: org.id,
      tenantDb,
    },
  });
});

export const tenantProcedure = t.procedure.use(enforceTenant);
