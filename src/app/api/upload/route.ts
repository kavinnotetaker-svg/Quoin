import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { processCSVUpload } from "@/server/pipelines/data-ingestion/logic";
import type { MeterType } from "@/server/pipelines/data-ingestion/types";
import {
  TenantAccessError,
  requireTenantContextFromSession,
} from "@/server/lib/tenant-access";
import { createLogger } from "@/server/lib/logger";
import { buildCsvUploadIngestionEnvelope } from "@/server/pipelines/data-ingestion/envelope";

export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  const logger = createLogger({
    requestId,
    procedure: "upload.csv",
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
      const envelope = buildCsvUploadIngestionEnvelope({
        requestId,
        organizationId: tenant.organizationId,
        buildingId,
        uploadBatchId: result.uploadBatchId,
        triggerType: "CSV_UPLOAD",
      });
      let espmClient;
      try {
        const { createESPMClient } = await import("@/server/integrations/espm");
        espmClient = createESPMClient();
      } catch {
        logger.warn("Upload pipeline ESPM client not available, skipping sync");
      }
      const pipelineResult = await runIngestionPipeline({
        buildingId: envelope.buildingId,
        organizationId: envelope.organizationId,
        uploadBatchId: envelope.payload.uploadBatchId,
        triggerType: envelope.payload.triggerType,
        tenantDb: tenant.tenantDb,
        espmClient,
      });
      logger.info("Upload pipeline completed", {
        summary: pipelineResult.summary,
        organizationId: tenant.organizationId,
        buildingId,
      });
      if (pipelineResult.errors.length > 0) {
        result.warnings.push(...pipelineResult.errors.map(e => `Pipeline: ${e}`));
      }
    } catch (pipelineErr) {
      logger.error("Upload pipeline failed", {
        error: pipelineErr,
        organizationId: tenant.organizationId,
        buildingId,
      });
      result.warnings.push(
        "Data saved but compliance snapshot could not be generated. Try refreshing.",
      );
    }

    return NextResponse.json(result, { status: result.success ? 200 : 422 });
  } catch (error) {
    logger.error("Upload processing failed", {
      error,
    });
    return NextResponse.json(
      { error: "Upload processing failed" },
      { status: 500 },
    );
  }
}
