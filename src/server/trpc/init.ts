import { randomUUID } from "node:crypto";
import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/server/lib/db";
import type { ESPM } from "@/server/integrations/espm";
import {
  AuthorizationError,
  getAppErrorLogLevel,
  toAppError,
  toTrpcError,
} from "@/server/lib/errors";
import { createLogger } from "@/server/lib/logger";
import {
  requireTenantContext,
} from "@/server/lib/tenant-access";

export interface Context {
  requestId?: string;
  clerkUserId: string | null;
  clerkOrgId: string | null | undefined;
  clerkOrgRole: string | null | undefined;
  prisma: typeof prisma;
  espmFactory?: (() => ESPM) | undefined;
}

export async function createContext(): Promise<Context> {
  const { userId, orgId, orgRole } = await auth();

  return {
    requestId: randomUUID(),
    clerkUserId: userId,
    clerkOrgId: orgId,
    clerkOrgRole: orgRole,
    prisma,
  };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error, ctx }) {
    const appError = toAppError(error.cause ?? error);

    return {
      ...shape,
      message: appError.exposeMessage ? appError.message : shape.message,
      data: {
        ...shape.data,
        requestId: ctx?.requestId ?? null,
        appErrorCode: appError.code,
        retryable: appError.retryable,
      },
    };
  },
});

export const router = t.router;

const normalizeProcedureErrors = t.middleware(async ({ ctx, path, type, next }) => {
  try {
    return await next();
  } catch (error) {
    const appError = toAppError(error);
    const logger = createLogger({
      requestId: ctx.requestId,
      organizationId: "organizationId" in ctx ? String(ctx.organizationId ?? "") : undefined,
      buildingId: undefined,
      userId: ctx.clerkUserId,
      router: path.includes(".") ? path.split(".").slice(0, -1).join(".") : path,
      procedure: path,
      procedureType: type,
    });
    const level = getAppErrorLogLevel(appError);
    logger[level]("tRPC procedure failed", {
      error: appError,
    });
    throw toTrpcError(appError);
  }
});

export const publicProcedure = t.procedure.use(normalizeProcedureErrors);

const enforceAuth = t.middleware(async ({ ctx, next }) => {
  if (!ctx.clerkUserId) {
    throw new AuthorizationError("Unauthorized", {
      httpStatus: 401,
    });
  }

  return next({
    ctx: {
      ...ctx,
      clerkUserId: ctx.clerkUserId,
    },
  });
});

export const protectedProcedure = publicProcedure.use(enforceAuth);

const enforceTenant = t.middleware(async ({ ctx, next }) => {
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
});

export const tenantProcedure = publicProcedure.use(enforceTenant);
