import { NextRequest, NextResponse } from "next/server";
import { processCSVUpload } from "@/server/pipelines/data-ingestion/logic";
import type { MeterType } from "@/server/pipelines/data-ingestion/types";
import { getServerAuth } from "@/server/lib/auth";
import { inngest } from "@/server/inngest/client";
import { dataIngestEvent } from "@/server/inngest/events";

export async function POST(req: NextRequest) {
  try {
    const auth = await getServerAuth("ENGINEER");
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const buildingId = formData.get("buildingId") as string | null;
    const meterTypeHint = formData.get("meterType") as string | null;
    const unitHint = formData.get("unit") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
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

    const building = await auth.tenantDb.building.findFirst({
      where: {
        id: buildingId,
        archivedAt: null,
      },
    });

    if (!building) {
      return NextResponse.json({ error: "Building not found" }, { status: 404 });
    }

    const csvContent = await file.text();
    const result = await processCSVUpload({
      csvContent,
      buildingId,
      organizationId: auth.organizationId,
      buildingGSF: building.grossSquareFeet,
      meterTypeHint: (meterTypeHint as MeterType) || undefined,
      unitHint: unitHint || undefined,
      tenantDb: auth.tenantDb,
    });

    if (result.success) {
      try {
        await inngest.send(
          dataIngestEvent({
            buildingId,
            organizationId: auth.organizationId,
            uploadBatchId: result.uploadBatchId,
            triggerType: "CSV_UPLOAD",
          }),
        );
        result.warnings.push(
          "Compliance recalculation queued asynchronously.",
        );
      } catch (queueError) {
        console.error("[Upload] Failed to queue ingestion job:", queueError);
        result.warnings.push(
          "Data saved, but compliance recalculation could not be queued.",
        );
      }
    }

    return NextResponse.json(result, { status: result.success ? 200 : 422 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload processing failed";
    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : 500;

    if (status === 500) {
      console.error("[Upload] Error:", error);
    }

    return NextResponse.json({ error: message }, { status });
  }
}
