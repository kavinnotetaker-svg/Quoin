import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma, getTenantClient } from "@/server/lib/db";
import {
  buildAuthorizationUrl,
  generateState,
} from "@/server/integrations/green-button";

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
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  // Verify building belongs to this org
  const org = await prisma.organization.findUnique({
    where: { clerkOrgId: orgId },
  });
  if (!org) {
    return NextResponse.json(
      { error: "Organization not found" },
      { status: 404 },
    );
  }

  const tenantDb = getTenantClient(org.id);
  const building = await tenantDb.building.findUnique({
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
  await tenantDb.building.update({
    where: { id: buildingId },
    data: { greenButtonStatus: "PENDING_AUTH" },
  });

  const authUrl = buildAuthorizationUrl(config, state);

  return NextResponse.redirect(authUrl);
}
