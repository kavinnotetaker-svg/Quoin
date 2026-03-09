import { NextRequest, NextResponse } from "next/server";
import { getServerAuth } from "@/server/lib/auth";
import {
  decodeGreenButtonStateCookie,
  exchangeCodeForTokens,
  encryptToken,
  getGreenButtonConfig,
  getGreenButtonStateCookieName,
} from "@/server/integrations/green-button";

function redirectWithCookieCleanup(
  req: NextRequest,
  path: string,
) {
  const response = NextResponse.redirect(new URL(path, req.nextUrl.origin));
  response.cookies.delete(getGreenButtonStateCookieName());
  return response;
}

export async function GET(req: NextRequest) {
  const auth = await getServerAuth("ENGINEER").catch(() => null);
  if (!auth) {
    return NextResponse.redirect(new URL("/sign-in", req.nextUrl.origin));
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");
  const stateCookie = decodeGreenButtonStateCookie(
    req.cookies.get(getGreenButtonStateCookieName())?.value,
  );

  if (!stateCookie || stateCookie.organizationId !== auth.organizationId) {
    return redirectWithCookieCleanup(req, "/dashboard?gb=invalid-state");
  }

  if (error) {
    return redirectWithCookieCleanup(
      req,
      `/buildings/${stateCookie.buildingId}?gb=denied`,
    );
  }

  if (!code || !state || state !== stateCookie.nonce) {
    return redirectWithCookieCleanup(
      req,
      `/buildings/${stateCookie.buildingId}?gb=invalid-state`,
    );
  }

  const config = getGreenButtonConfig();
  if (!config) {
    return redirectWithCookieCleanup(
      req,
      `/buildings/${stateCookie.buildingId}?gb=error`,
    );
  }

  const encryptionKey = process.env["GREEN_BUTTON_ENCRYPTION_KEY"];
  if (!encryptionKey) {
    console.error("[Green Button] GREEN_BUTTON_ENCRYPTION_KEY not set");
    return redirectWithCookieCleanup(
      req,
      `/buildings/${stateCookie.buildingId}?gb=error`,
    );
  }

  const building = await auth.tenantDb.building.findFirst({
    where: {
      id: stateCookie.buildingId,
      archivedAt: null,
    },
  });

  if (!building) {
    return redirectWithCookieCleanup(req, "/dashboard?gb=error");
  }

  try {
    const tokens = await exchangeCodeForTokens(config, code);

    await auth.tenantDb.greenButtonConnection.upsert({
      where: { buildingId: stateCookie.buildingId },
      update: {
        status: "ACTIVE",
        accessToken: encryptToken(tokens.accessToken, encryptionKey),
        refreshToken: encryptToken(tokens.refreshToken, encryptionKey),
        tokenExpiresAt: tokens.expiresAt,
        subscriptionId: tokens.subscriptionId,
        resourceUri: tokens.resourceUri,
      },
      create: {
        buildingId: stateCookie.buildingId,
        organizationId: auth.organizationId,
        status: "ACTIVE",
        accessToken: encryptToken(tokens.accessToken, encryptionKey),
        refreshToken: encryptToken(tokens.refreshToken, encryptionKey),
        tokenExpiresAt: tokens.expiresAt,
        subscriptionId: tokens.subscriptionId,
        resourceUri: tokens.resourceUri,
      },
    });

    await auth.tenantDb.building.update({
      where: { id: stateCookie.buildingId },
      data: {
        greenButtonStatus: "ACTIVE",
        dataIngestionMethod: "GREEN_BUTTON",
      },
    });

    return redirectWithCookieCleanup(
      req,
      `/buildings/${stateCookie.buildingId}?gb=success`,
    );
  } catch (err) {
    console.error("[Green Button] Token exchange failed:", err);

    await auth.tenantDb.building.update({
      where: { id: stateCookie.buildingId },
      data: { greenButtonStatus: "FAILED" },
    });

    return redirectWithCookieCleanup(
      req,
      `/buildings/${stateCookie.buildingId}?gb=error`,
    );
  }
}
