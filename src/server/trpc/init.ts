import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { createId } from "@paralleldrive/cuid2";
import { prisma, getTenantClient } from "@/server/lib/db";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  clerk_org_id: string;
  tier: string;
}

/** Find org by Clerk ID using raw SQL (bypasses Prisma model layer issues). */
async function findOrgByClerkId(clerkOrgId: string): Promise<OrgRow | null> {
  const rows = await prisma.$queryRawUnsafe<OrgRow[]>(
    `SELECT id, name, slug, clerk_org_id, tier
     FROM organizations
     WHERE clerk_org_id = $1
     LIMIT 1`,
    clerkOrgId,
  );
  return rows[0] ?? null;
}

/** Upsert org via raw SQL — bypasses RLS and Prisma model validation. */
async function ensureOrgExists(
  clerkOrgId: string,
  name: string,
  slug: string,
): Promise<OrgRow> {
  const id = createId();
  const now = new Date();

  await prisma.$executeRawUnsafe(
    `INSERT INTO organizations (id, name, slug, clerk_org_id, tier, settings, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'FREE', '{}', $5, $5)
     ON CONFLICT (clerk_org_id) DO NOTHING`,
    id, name, slug, clerkOrgId, now,
  );

  // Always re-fetch to get the actual row (either existing or newly inserted)
  const org = await findOrgByClerkId(clerkOrgId);
  if (!org) {
    throw new Error(`Failed to upsert organization for clerk_org_id=${clerkOrgId}`);
  }
  return org;
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
