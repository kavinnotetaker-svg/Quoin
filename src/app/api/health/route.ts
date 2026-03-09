import { NextResponse } from "next/server";
import { prisma } from "@/server/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      status: "ok",
      database: "ok",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Health] Database check failed:", error);

    return NextResponse.json(
      {
        status: "degraded",
        database: "error",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
