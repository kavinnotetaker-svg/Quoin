import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma, getTenantClient } from "@/server/lib/db";
import { createQueue, QUEUES } from "@/server/lib/queue";
import { processCSVUpload } from "@/server/pipelines/data-ingestion/logic";
import type { MeterType } from "@/server/pipelines/data-ingestion/types";

export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const buildingId = formData.get("buildingId") as string | null;
    const meterTypeHint = formData.get("meterType") as string | null;
    const unitHint = formData.get("unit") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 },
      );
    }
    if (!buildingId) {
      return NextResponse.json(
        { error: "buildingId is required" },
        { status: 400 },
      );
    }

    if (
      !file.name.endsWith(".csv") &&
      !file.name.endsWith(".tsv") &&
      !file.name.endsWith(".txt")
    ) {
      return NextResponse.json(
        { error: "File must be .csv, .tsv, or .txt" },
        { status: 400 },
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large (max 10MB)" },
        { status: 400 },
      );
    }

    const building = await tenantDb.building.findUnique({
      where: { id: buildingId },
    });
    if (!building) {
      return NextResponse.json(
        { error: "Building not found" },
        { status: 404 },
      );
    }

    const csvContent = await file.text();

    const result = await processCSVUpload({
      csvContent,
      buildingId,
      organizationId: org.id,
      buildingGSF: building.grossSquareFeet,
      meterTypeHint: (meterTypeHint as MeterType) || undefined,
      unitHint: unitHint || undefined,
      tenantDb,
    });

    // Enqueue pipeline job if readings were created
    if (result.success && result.readingsCreated > 0) {
      try {
        const queue = createQueue(QUEUES.DATA_INGESTION);
        await queue.add("ingest", {
          buildingId,
          organizationId: org.id,
          uploadBatchId: result.uploadBatchId,
          triggerType: "CSV_UPLOAD",
        });
      } catch (queueErr) {
        console.error("[Upload] Failed to enqueue pipeline job:", queueErr);
        // Don't fail the upload — readings are persisted, pipeline can be retried
        result.warnings.push(
          "Data saved but pipeline job could not be enqueued. It will be retried.",
        );
      }
    }

    return NextResponse.json(result, { status: result.success ? 200 : 422 });
  } catch (error) {
    console.error("[Upload] Error:", error);
    return NextResponse.json(
      { error: "Upload processing failed" },
      { status: 500 },
    );
  }
}
