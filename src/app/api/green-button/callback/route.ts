import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma, getTenantClient } from "@/server/lib/db";
import {
  exchangeCodeForTokens,
  encryptToken,
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
    scope: "",
  };
}

/**
 * GET /api/green-button/callback?code=xxx&state=xxx
 * Handles the OAuth callback from Pepco after user authorization.
 * Exchanges the code for tokens and stores them encrypted on the building.
 */
export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    return NextResponse.redirect(
      new URL("/sign-in", req.nextUrl.origin),
    );
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

  const config = getGreenButtonConfig();
  if (!config) {
    return NextResponse.redirect(
      new URL(`/buildings/${buildingId}?gb=error`, req.nextUrl.origin),
    );
  }

  const encryptionKey = process.env["GREEN_BUTTON_ENCRYPTION_KEY"];
  if (!encryptionKey) {
    console.error("[Green Button] GREEN_BUTTON_ENCRYPTION_KEY not set");
    return NextResponse.redirect(
      new URL(`/buildings/${buildingId}?gb=error`, req.nextUrl.origin),
    );
  }

  const org = await prisma.organization.findUnique({
    where: { clerkOrgId: orgId },
  });
  if (!org) {
    return NextResponse.redirect(
      new URL("/dashboard?gb=error", req.nextUrl.origin),
    );
  }

  const tenantDb = getTenantClient(org.id);

  try {
    const tokens = await exchangeCodeForTokens(config, code);

    await tenantDb.building.update({
      where: { id: buildingId },
      data: {
        greenButtonStatus: "ACTIVE",
        greenButtonAccessToken: encryptToken(
          tokens.accessToken,
          encryptionKey,
        ),
        greenButtonRefreshToken: encryptToken(
          tokens.refreshToken,
          encryptionKey,
        ),
        greenButtonTokenExpiresAt: tokens.expiresAt,
        greenButtonSubscriptionId: tokens.subscriptionId,
        greenButtonResourceUri: tokens.resourceUri,
        greenButtonConnectedAt: new Date(),
        dataIngestionMethod: "GREEN_BUTTON",
      },
    });

    return NextResponse.redirect(
      new URL(`/buildings/${buildingId}?gb=success`, req.nextUrl.origin),
    );
  } catch (err) {
    console.error("[Green Button] Token exchange failed:", err);

    await tenantDb.building.update({
      where: { id: buildingId },
      data: { greenButtonStatus: "FAILED" },
    });

    return NextResponse.redirect(
      new URL(`/buildings/${buildingId}?gb=error`, req.nextUrl.origin),
    );
  }
}
