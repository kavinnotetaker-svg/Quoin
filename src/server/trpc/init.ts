import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/server/lib/db";
import type { ESPM } from "@/server/integrations/espm";
import {
  TenantAccessError,
  requireTenantContext,
} from "@/server/lib/tenant-access";

export interface Context {
  clerkUserId: string | null;
  clerkOrgId: string | null | undefined;
  clerkOrgRole: string | null | undefined;
  prisma: typeof prisma;
  espmFactory?: (() => ESPM) | undefined;
}

export async function createContext(): Promise<Context> {
  const { userId, orgId, orgRole } = await auth();

  return {
    clerkUserId: userId,
    clerkOrgId: orgId,
    clerkOrgRole: orgRole,
    prisma,
  };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const enforceAuth = t.middleware(async ({ ctx, next }) => {
  if (!ctx.clerkUserId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({
    ctx: {
      ...ctx,
      clerkUserId: ctx.clerkUserId,
    },
  });
});

export const protectedProcedure = t.procedure.use(enforceAuth);

const enforceTenant = t.middleware(async ({ ctx, next }) => {
  try {
    const tenant = await requireTenantContext({
      clerkUserId: ctx.clerkUserId,
      clerkOrgId: ctx.clerkOrgId,
      clerkOrgRole: ctx.clerkOrgRole,
    });

    return next({
      ctx: {
        ...ctx,
        ...tenant,
      },
    });
  } catch (error) {
    if (error instanceof TenantAccessError) {
      const code =
        error.status === 401
          ? "UNAUTHORIZED"
          : error.status === 404
            ? "NOT_FOUND"
            : "FORBIDDEN";

      throw new TRPCError({
        code,
        message: error.message,
      });
    }

    throw error;
  }
});

export const tenantProcedure = t.procedure.use(enforceTenant);
