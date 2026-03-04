import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { auth } from "@clerk/nextjs/server";
import { prisma, getTenantClient } from "@/server/lib/db";

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

  const org = await prisma.organization.findUnique({
    where: { clerkOrgId: ctx.clerkOrgId },
  });

  if (!org) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Organization not found. It may not have synced yet.",
    });
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
