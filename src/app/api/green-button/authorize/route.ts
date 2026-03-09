import { NextRequest, NextResponse } from "next/server";
import { getServerAuth } from "@/server/lib/auth";
import {
  buildAuthorizationUrl,
  encodeGreenButtonStateCookie,
  generateState,
  getGreenButtonConfig,
  getGreenButtonStateCookieName,
} from "@/server/integrations/green-button";

export async function GET(req: NextRequest) {
  try {
    const auth = await getServerAuth("ENGINEER");
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

    const building = await auth.tenantDb.building.findFirst({
      where: {
        id: buildingId,
        archivedAt: null,
      },
    });

    if (!building) {
      return NextResponse.json({ error: "Building not found" }, { status: 404 });
    }

    const nonce = generateState();
    const authUrl = buildAuthorizationUrl(config, nonce);
    const response = NextResponse.redirect(authUrl);

    response.cookies.set(
      getGreenButtonStateCookieName(),
      encodeGreenButtonStateCookie({
        nonce,
        buildingId,
        organizationId: auth.organizationId,
        createdAt: new Date().toISOString(),
      }),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env["NODE_ENV"] === "production",
        path: "/api/green-button",
        maxAge: 10 * 60,
      },
    );

    await auth.tenantDb.building.update({
      where: { id: buildingId },
      data: { greenButtonStatus: "PENDING_AUTH" },
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : 401;

    return NextResponse.json({ error: message }, { status });
  }
}
