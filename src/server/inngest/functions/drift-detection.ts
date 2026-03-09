import { inngest } from "../client";
import { driftDetectEventSchema } from "../events";
import { getTenantClient } from "@/server/lib/db";
import {
  detectDrift,
  type DriftDetectionInput,
  type MonthlyReading,
} from "@/server/pipelines/drift-detection/rules-engine";

function mapTriggerType(
  trigger: "SCHEDULED" | "MANUAL" | "ON_INGESTION",
): "SCHEDULED" | "MANUAL" | "WEBHOOK" {
  switch (trigger) {
    case "SCHEDULED":
      return "SCHEDULED";
    case "MANUAL":
      return "MANUAL";
    case "ON_INGESTION":
      return "WEBHOOK";
  }
}

export const driftDetectionJob = inngest.createFunction(
  {
    id: "drift-detection",
    retries: 3,
    onFailure: async ({ error }) => {
      console.error("[DLQ] Drift detection permanently failed", error);
    },
  },
  { event: "drift/detect" },
  async ({ event, step }) => {
    const data = driftDetectEventSchema.parse(event.data);
    const startedAt = new Date();
    const tenantDb = getTenantClient(data.organizationId);

    const result = await step.run("detect-drift", async () => {
      const building = await tenantDb.building.findFirst({
        where: {
          id: data.buildingId,
          archivedAt: null,
        },
      });
      if (!building) {
        throw new Error(`Building ${data.buildingId} not found`);
      }

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const currentReadingsRaw = await tenantDb.energyReading.findMany({
        where: {
          buildingId: data.buildingId,
          periodStart: { gte: thirtyDaysAgo },
        },
        orderBy: { periodStart: "asc" },
      });

      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 13);

      const historicalReadingsRaw = await tenantDb.energyReading.findMany({
        where: {
          buildingId: data.buildingId,
          periodStart: { gte: twelveMonthsAgo, lt: thirtyDaysAgo },
        },
        orderBy: { periodStart: "asc" },
      });

      const snapshots = await tenantDb.complianceSnapshot.findMany({
        where: { buildingId: data.buildingId },
        orderBy: { snapshotDate: "desc" },
        take: 2,
      });

      const currentScore = snapshots[0]?.energyStarScore ?? null;
      const previousScore = snapshots[1]?.energyStarScore ?? null;

      const toReading = (reading: {
        periodStart: Date;
        consumptionKbtu: number;
        meterType: string;
      }): MonthlyReading => ({
        periodStart: reading.periodStart,
        consumptionKbtu: reading.consumptionKbtu,
        meterType: reading.meterType,
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
            ruleIds: alerts.map((alert) => alert.ruleId),
          },
        },
      });

      const newAlerts = [];
      for (const alert of alerts) {
        const idempotencyKey = `${data.buildingId}:${alert.ruleId}:${thirtyDaysAgo.toISOString().split("T")[0]}`;
        const existingAlert = await tenantDb.driftAlert.findUnique({
          where: { idempotencyKey },
        });

        if (existingAlert) {
          continue;
        }

        newAlerts.push(
          await tenantDb.driftAlert.create({
            data: {
              organizationId: data.organizationId,
              buildingId: data.buildingId,
              pipelineRunId: pipelineRun.id,
              ruleId: alert.ruleId,
              severity: alert.severity,
              status: "ACTIVE",
              active: true,
              title: alert.title,
              description: alert.description,
              currentValue: alert.currentValue,
              threshold: alert.threshold,
              detectedAt: alert.detectedAt,
              idempotencyKey,
            },
          }),
        );
      }

      return { alerts: newAlerts, pipelineRunId: pipelineRun.id };
    });

    return { done: true, newAlerts: result.alerts.length };
  },
);
