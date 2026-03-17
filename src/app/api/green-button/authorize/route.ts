import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  buildAuthorizationUrl,
  generateState,
} from "@/server/integrations/green-button";
import { createLogger } from "@/server/lib/logger";
import {
  TenantAccessError,
  requireTenantContextFromSession,
} from "@/server/lib/tenant-access";
import { getOptionalGreenButtonConfig } from "@/server/lib/config";

/**
 * GET /api/green-button/authorize?buildingId=xxx
 * Initiates Green Button OAuth flow by redirecting to the utility's authorization page.
 */
export async function GET(req: NextRequest) {
  const requestId = randomUUID();
  const logger = createLogger({
    requestId,
    procedure: "greenButton.authorize",
  });
  let tenant;
  try {
    tenant = await requireTenantContextFromSession();
  } catch (error) {
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    throw error;
  }

  const buildingId = req.nextUrl.searchParams.get("buildingId");
  if (!buildingId) {
    logger.warn("Green Button authorization requested without buildingId");
    return NextResponse.json(
      { error: "buildingId is required", requestId },
      { status: 400 },
    );
  }

  const config = getOptionalGreenButtonConfig();
  if (!config) {
    logger.warn("Green Button authorization attempted without configuration", {
      buildingId,
    });
    return NextResponse.json(
      { error: "Green Button is not configured", requestId },
      { status: 503 },
    );
  }

  const building = await tenant.tenantDb.building.findUnique({
    where: { id: buildingId },
  });
  if (!building) {
    logger.warn("Green Button authorization requested for missing building", {
      buildingId,
    });
    return NextResponse.json(
      { error: "Building not found", requestId },
      { status: 404 },
    );
  }

  // Generate CSRF state that encodes buildingId for the callback
  const csrfToken = generateState();
  const state = `${csrfToken}:${buildingId}`;

  // Update building status to PENDING_AUTH
  await tenant.tenantDb.building.update({
    where: { id: buildingId },
    data: { greenButtonStatus: "PENDING_AUTH" },
  });

  const authUrl = buildAuthorizationUrl(config, state);
  logger.info("Redirecting to Green Button authorization endpoint", {
    buildingId,
  });

  return NextResponse.redirect(authUrl);
}
