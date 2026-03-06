import { createWorker } from "@/server/lib/queue";
import { getTenantClient } from "@/server/lib/db";
import { detectDrift, type DriftDetectionInput, type MonthlyReading } from "./rules-engine";

const DRIFT_QUEUE = "drift-detection";

export interface DriftDetectionJobData {
  buildingId: string;
  organizationId: string;
  triggerType: "SCHEDULED" | "MANUAL" | "ON_INGESTION";
}

/**
 * Map worker trigger types to Prisma TriggerType enum values.
 */
function mapTriggerType(trigger: DriftDetectionJobData["triggerType"]): "SCHEDULED" | "MANUAL" | "WEBHOOK" {
  switch (trigger) {
    case "SCHEDULED": return "SCHEDULED";
    case "MANUAL": return "MANUAL";
    case "ON_INGESTION": return "WEBHOOK";
  }
}

/**
 * Start the drift detection BullMQ worker.
 *
 * Runs rules engine against building readings, persists DriftAlert rows.
 * LLM root cause analysis is dispatched asynchronously — alert is immediately
 * visible with deterministic description per CLAUDE.md rules.
 */
export function startDriftDetectionWorker() {
  const worker = createWorker(
    DRIFT_QUEUE,
    async (job) => {
      const data = job.data as DriftDetectionJobData;
      const startedAt = new Date();
      console.log(
        `[Drift Detection] Processing job ${job.id} for building ${data.buildingId}`,
      );

      const tenantDb = getTenantClient(data.organizationId);

      const building = await tenantDb.building.findUnique({
        where: { id: data.buildingId },
      });
      if (!building) {
        throw new Error(`Building ${data.buildingId} not found`);
      }

      // Load current month readings (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const currentReadingsRaw = await tenantDb.energyReading.findMany({
        where: {
          buildingId: data.buildingId,
          periodStart: { gte: thirtyDaysAgo },
        },
        orderBy: { periodStart: "asc" },
      });

      // Load historical readings (12+ months)
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 13);

      const historicalReadingsRaw = await tenantDb.energyReading.findMany({
        where: {
          buildingId: data.buildingId,
          periodStart: { gte: twelveMonthsAgo, lt: thirtyDaysAgo },
        },
        orderBy: { periodStart: "asc" },
      });

      // Load latest two compliance snapshots for score comparison
      const snapshots = await tenantDb.complianceSnapshot.findMany({
        where: { buildingId: data.buildingId },
        orderBy: { snapshotDate: "desc" },
        take: 2,
      });

      const currentScore = snapshots[0]?.energyStarScore ?? null;
      const previousScore = snapshots[1]?.energyStarScore ?? null;

      const toReading = (r: { periodStart: Date; consumptionKbtu: number; meterType: string }): MonthlyReading => ({
        periodStart: r.periodStart,
        consumptionKbtu: r.consumptionKbtu,
        meterType: r.meterType,
      });

      const input: DriftDetectionInput = {
        buildingId: data.buildingId,
        currentReadings: currentReadingsRaw.map(toReading),
        historicalReadings: historicalReadingsRaw.map(toReading),
        currentScore,
        previousScore,
        baselineSiteEui: building.targetEui ?? null,
        currentSiteEui: snapshots[0]?.siteEui ?? null,
        grossSquareFeet: building.grossSquareFeet,
      };

      const alerts = detectDrift(input);
      const completedAt = new Date();

      console.log(
        `[Drift Detection] Building ${data.buildingId}: ${alerts.length} alerts detected`,
      );

      // Create PipelineRun and DriftAlert rows in a single transaction
      const pipelineRun = await tenantDb.pipelineRun.create({
        data: {
          organizationId: data.organizationId,
          buildingId: data.buildingId,
          pipelineType: "DRIFT_DETECTION",
          triggerType: mapTriggerType(data.triggerType),
          status: "COMPLETED",
          startedAt,
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
          inputSummary: {
            triggerType: data.triggerType,
            currentReadings: currentReadingsRaw.length,
            historicalReadings: historicalReadingsRaw.length,
          },
          outputSummary: {
            alertCount: alerts.length,
            ruleIds: alerts.map((a) => a.ruleId),
          },
        },
      });

      // Persist individual DriftAlert rows
      if (alerts.length > 0) {
        await tenantDb.driftAlert.createMany({
          data: alerts.map((a) => ({
            organizationId: data.organizationId,
            buildingId: data.buildingId,
            pipelineRunId: pipelineRun.id,
            ruleId: a.ruleId,
            severity: a.severity,
            status: "ACTIVE" as const,
            title: a.title,
            description: a.description,
            currentValue: a.currentValue,
            threshold: a.threshold,
            detectedAt: a.detectedAt,
          })),
        });
      }

      return { alertCount: alerts.length, pipelineRunId: pipelineRun.id };
    },
    5, // concurrency per CLAUDE.md queue topology
  );

  worker.on("failed", (job, err) => {
    console.error(
      `[Drift Detection] Job ${job?.id} permanently failed:`,
      err.message,
    );
  });

  worker.on("error", (err) => {
    console.error("[Drift Detection] Worker error:", err);
  });

  return worker;
}
