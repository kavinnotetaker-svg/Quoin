import { NextRequest, NextResponse } from "next/server";
import { processCSVUpload } from "@/server/pipelines/data-ingestion/logic";
import type { MeterType } from "@/server/pipelines/data-ingestion/types";
import {
  TenantAccessError,
  requireTenantContextFromSession,
} from "@/server/lib/tenant-access";

export async function POST(req: NextRequest) {
  let tenant;
  try {
    tenant = await requireTenantContextFromSession();
  } catch (error) {
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    throw error;
  }

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

    const building = await tenant.tenantDb.building.findUnique({
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
      organizationId: tenant.organizationId,
      buildingGSF: building.grossSquareFeet,
      meterTypeHint: (meterTypeHint as MeterType) || undefined,
      unitHint: unitHint || undefined,
      tenantDb: tenant.tenantDb,
    });

    // Run pipeline inline to create ComplianceSnapshot
    try {
      const { runIngestionPipeline } = await import("@/server/pipelines/data-ingestion/logic");
      let espmClient;
      try {
        const { createESPMClient } = await import("@/server/integrations/espm");
        espmClient = createESPMClient();
      } catch {
        console.warn("[Upload] ESPM client not available, skipping sync");
      }
      const pipelineResult = await runIngestionPipeline({
        buildingId,
        organizationId: tenant.organizationId,
        uploadBatchId: result.uploadBatchId,
        triggerType: "CSV_UPLOAD",
        tenantDb: tenant.tenantDb,
        espmClient,
      });
      console.log("[Upload] Pipeline result:", pipelineResult.summary);
      if (pipelineResult.errors.length > 0) {
        result.warnings.push(...pipelineResult.errors.map(e => `Pipeline: ${e}`));
      }
    } catch (pipelineErr) {
      console.error("[Upload] Pipeline failed:", pipelineErr);
      result.warnings.push(
        "Data saved but compliance snapshot could not be generated. Try refreshing.",
      );
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
