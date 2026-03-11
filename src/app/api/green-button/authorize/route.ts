import { NextRequest, NextResponse } from "next/server";
import {
  buildAuthorizationUrl,
  generateState,
} from "@/server/integrations/green-button";
import {
  TenantAccessError,
  requireTenantContextFromSession,
} from "@/server/lib/tenant-access";

function getGreenButtonConfig() {
  const clientId = process.env["GREEN_BUTTON_CLIENT_ID"];
  const clientSecret = process.env["GREEN_BUTTON_CLIENT_SECRET"];
  const authEndpoint = process.env["GREEN_BUTTON_AUTH_ENDPOINT"];
  const tokenEndpoint = process.env["GREEN_BUTTON_TOKEN_ENDPOINT"];
  const redirectUri = process.env["GREEN_BUTTON_REDIRECT_URI"];

  if (
    !clientId ||
    !clientSecret ||
    !authEndpoint ||
    !tokenEndpoint ||
    !redirectUri
  ) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    authorizationEndpoint: authEndpoint,
    tokenEndpoint,
    redirectUri,
    scope: process.env["GREEN_BUTTON_SCOPE"] ?? "FB=4_5_15;IntervalDuration=900;BlockDuration=monthly;HistoryLength=13",
  };
}

/**
 * GET /api/green-button/authorize?buildingId=xxx
 * Initiates Green Button OAuth flow by redirecting to the utility's authorization page.
 */
export async function GET(req: NextRequest) {
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
    return NextResponse.json(
      { error: "buildingId is required" },
      { status: 400 },
    );
  }

  const config = getGreenButtonConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Green Button is not configured" },
      { status: 503 },
    );
  }

  const building = await tenant.tenantDb.building.findUnique({
    where: { id: buildingId },
  });
  if (!building) {
    return NextResponse.json(
      { error: "Building not found" },
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

  return NextResponse.redirect(authUrl);
}
