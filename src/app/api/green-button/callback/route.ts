import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  encryptToken,
} from "@/server/integrations/green-button";
import { toAppError } from "@/server/lib/errors";
import { createAuditLog } from "@/server/lib/audit-log";
import {
  createJob,
  markCompleted,
  markDead,
  markFailed,
  markRunning,
} from "@/server/lib/jobs";
import { createLogger } from "@/server/lib/logger";
import {
  TenantAccessError,
  requireTenantContextFromSession,
} from "@/server/lib/tenant-access";
import {
  getGreenButtonEncryptionKey,
  getOptionalGreenButtonConfig,
} from "@/server/lib/config";

/**
 * GET /api/green-button/callback?code=xxx&state=xxx
 * Handles the OAuth callback from Pepco after user authorization.
 * Exchanges the code for tokens and stores them encrypted on the building.
 */
export async function GET(req: NextRequest) {
  const requestId = randomUUID();
  const logger = createLogger({
    requestId,
    procedure: "greenButton.callback",
  });
  let tenant;
  try {
    tenant = await requireTenantContextFromSession();
  } catch (error) {
    if (error instanceof TenantAccessError) {
      return NextResponse.redirect(new URL("/sign-in", req.nextUrl.origin));
    }

    throw error;
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  // User denied authorization
  if (error) {
    const buildingId = state?.split(":")?.[1];
    const redirectUrl = buildingId
      ? `/buildings/${buildingId}?gb=denied`
      : "/dashboard?gb=denied";
    return NextResponse.redirect(new URL(redirectUrl, req.nextUrl.origin));
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/dashboard?gb=error", req.nextUrl.origin),
    );
  }

  // Extract buildingId from state (format: csrfToken:buildingId)
  const stateParts = state.split(":");
  if (stateParts.length < 2) {
    return NextResponse.redirect(
      new URL("/dashboard?gb=error", req.nextUrl.origin),
    );
  }
  const buildingId = stateParts[1]!;
  const job = await createJob({
    type: "GREEN_BUTTON_CALLBACK",
    organizationId: tenant.organizationId,
    buildingId,
    maxAttempts: 1,
  });
  const runningJob = await markRunning(job.id);
  const jobLogger = logger.child({
    jobId: job.id,
    organizationId: tenant.organizationId,
    buildingId,
    userId: tenant.clerkUserId,
  });
  const safelyPersist = async (
    label: string,
    operation: () => Promise<unknown>,
  ) => {
    try {
      await operation();
    } catch (persistenceError) {
      jobLogger.error("Green Button callback persistence failed", {
        error: persistenceError,
        persistenceLabel: label,
      });
    }
  };
  const writeAudit = (input: {
    action: string;
    inputSnapshot?: Record<string, unknown>;
    outputSnapshot?: Record<string, unknown>;
    errorCode?: string | null;
  }) =>
    createAuditLog({
      actorType: "USER",
      actorId: tenant.clerkUserId,
      organizationId: tenant.organizationId,
      buildingId,
      requestId,
      action: input.action,
      inputSnapshot: input.inputSnapshot,
      outputSnapshot: input.outputSnapshot,
      errorCode: input.errorCode ?? null,
    }).catch((auditError) => {
      jobLogger.error("Green Button callback audit log persistence failed", {
        error: auditError,
        auditAction: input.action,
      });
      return null;
    });

  await writeAudit({
    action: "green_button.callback.started",
    inputSnapshot: {
      buildingId,
    },
  });

  const config = getOptionalGreenButtonConfig();
  if (!config) {
    jobLogger.warn("Green Button callback received without integration config");
    await safelyPersist("job.dead", () =>
      markDead(runningJob.id, "Green Button is not configured"),
    );
    await writeAudit({
      action: "green_button.callback.failed",
      inputSnapshot: {
        buildingId,
      },
      outputSnapshot: {
        retryable: false,
      },
      errorCode: "CONFIG_ERROR",
    });
    return NextResponse.redirect(
      new URL(`/buildings/${buildingId}?gb=error`, req.nextUrl.origin),
    );
  }

  const encryptionKey = getGreenButtonEncryptionKey();
  if (!encryptionKey) {
    jobLogger.error("Green Button callback missing encryption key");
    await safelyPersist("job.dead", () =>
      markDead(runningJob.id, "Green Button encryption key is missing"),
    );
    await writeAudit({
      action: "green_button.callback.failed",
      inputSnapshot: {
        buildingId,
      },
      outputSnapshot: {
        retryable: false,
      },
      errorCode: "CONFIG_ERROR",
    });
    return NextResponse.redirect(
      new URL(`/buildings/${buildingId}?gb=error`, req.nextUrl.origin),
    );
  }

  const building = await tenant.tenantDb.building.findUnique({
    where: { id: buildingId },
    select: { id: true },
  });
  if (!building) {
    await safelyPersist("job.dead", () =>
      markDead(runningJob.id, "Building not found"),
    );
    await writeAudit({
      action: "green_button.callback.failed",
      inputSnapshot: {
        buildingId,
      },
      outputSnapshot: {
        retryable: false,
      },
      errorCode: "NOT_FOUND",
    });
    return NextResponse.redirect(
      new URL("/dashboard?gb=error", req.nextUrl.origin),
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(config, code);

    await tenant.tenantDb.greenButtonConnection.upsert({
      where: { buildingId },
      update: {
        status: "ACTIVE",
        accessToken: encryptToken(tokens.accessToken, encryptionKey),
        refreshToken: encryptToken(tokens.refreshToken, encryptionKey),
        tokenExpiresAt: tokens.expiresAt,
        subscriptionId: tokens.subscriptionId,
        resourceUri: tokens.resourceUri,
      },
      create: {
        buildingId,
        organizationId: tenant.organizationId,
        status: "ACTIVE",
        accessToken: encryptToken(tokens.accessToken, encryptionKey),
        refreshToken: encryptToken(tokens.refreshToken, encryptionKey),
        tokenExpiresAt: tokens.expiresAt,
        subscriptionId: tokens.subscriptionId,
        resourceUri: tokens.resourceUri,
      }
    });

    await tenant.tenantDb.building.update({
      where: { id: buildingId },
      data: {
        greenButtonStatus: "ACTIVE",
        dataIngestionMethod: "GREEN_BUTTON",
      },
    });

    await safelyPersist("job.completed", () => markCompleted(runningJob.id));
    await writeAudit({
      action: "green_button.callback.succeeded",
      inputSnapshot: {
        buildingId,
      },
      outputSnapshot: {
        subscriptionId: tokens.subscriptionId,
        resourceUri: tokens.resourceUri,
      },
    });

    return NextResponse.redirect(
      new URL(`/buildings/${buildingId}?gb=success`, req.nextUrl.origin),
    );
  } catch (err) {
    const appError = toAppError(err);
    jobLogger.error("Green Button callback failed", {
      error: appError,
      retryable: appError.retryable,
    });

    if (appError.retryable && runningJob.attempts < runningJob.maxAttempts) {
      await safelyPersist("job.failed", () =>
        markFailed(runningJob.id, appError.message),
      );
    } else {
      await safelyPersist("job.dead", () =>
        markDead(runningJob.id, appError.message),
      );
    }
    await writeAudit({
      action: "green_button.callback.failed",
      inputSnapshot: {
        buildingId,
      },
      outputSnapshot: {
        retryable: appError.retryable,
      },
      errorCode: appError.code,
    });

    await tenant.tenantDb.building.update({
      where: { id: buildingId },
      data: { greenButtonStatus: "FAILED" },
    });

    return NextResponse.redirect(
      new URL(`/buildings/${buildingId}?gb=error`, req.nextUrl.origin),
    );
  }
}
