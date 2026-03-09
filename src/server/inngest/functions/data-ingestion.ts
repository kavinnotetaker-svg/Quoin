import { NonRetriableError } from "inngest";
import { inngest } from "../client";
import {
  dataIngestEventSchema,
  driftDetectEvent,
  espmSyncMetricsEvent,
  espmSyncMetricsEventSchema,
} from "../events";
import { getTenantClient } from "@/server/lib/db";
import { runIngestionPipeline } from "@/server/pipelines/data-ingestion/logic";
import { createESPMClient } from "@/server/integrations/espm";

export const dataIngestionJob = inngest.createFunction(
  {
    id: "data-ingestion-process",
    retries: 3,
    onFailure: async ({ error }) => {
      console.error("[DLQ] Data ingestion failed completely", error);
    },
  },
  { event: "data/ingest" },
  async ({ event, step }) => {
    const data = dataIngestEventSchema.parse(event.data);

    const result = await step.run("run-ingestion-pipeline", async () => {
      const tenantDb = getTenantClient(data.organizationId);
      let espmClient;
      try {
        espmClient = createESPMClient();
      } catch {
        espmClient = undefined;
      }

      return runIngestionPipeline({
        buildingId: data.buildingId,
        organizationId: data.organizationId,
        uploadBatchId: data.uploadBatchId,
        triggerType: data.triggerType,
        tenantDb,
        espmClient,
      });
    });

    if (!result.success) {
      throw new Error(`Ingestion failed: ${result.summary}`);
    }

    if (result.snapshotId) {
      await step.sendEvent(
        "trigger-drift-detection",
        driftDetectEvent({
          buildingId: data.buildingId,
          organizationId: data.organizationId,
          triggerType: "ON_INGESTION",
        }),
      );
    }

    if (result.snapshotId && result.espmSync?.pushed) {
      await step.sendEvent(
        "trigger-espm-metrics-refresh",
        espmSyncMetricsEvent({
          organizationId: data.organizationId,
          buildingId: data.buildingId,
          snapshotId: result.snapshotId,
        }),
      );
    }

    return result;
  },
);

export const syncEspmMetricsJob = inngest.createFunction(
  {
    id: "sync-espm-metrics",
    retries: 3,
    onFailure: async ({ error }) => {
      console.error("[DLQ] ESPM sync metrics failed", error);
    },
  },
  { event: "espm/sync-metrics" },
  async ({ event, step }) => {
    const { buildingId, organizationId, snapshotId } =
      espmSyncMetricsEventSchema.parse(event.data);
    const espmClient = createESPMClient();
    const tenantDb = getTenantClient(organizationId);

    const metrics = await step.run("pull-metrics", async () => {
      const building = await tenantDb.building.findFirst({
        where: {
          id: buildingId,
          archivedAt: null,
        },
      });

      if (!building?.espmPropertyId) {
        throw new NonRetriableError("No ESPM property linked");
      }

      const now = new Date();
      return espmClient.metrics.getPropertyMetrics(
        Number(building.espmPropertyId),
        now.getFullYear(),
        now.getMonth() + 1,
      );
    });

    if (metrics.score == null && metrics.weatherNormalizedSiteIntensity == null) {
      return { synced: false, reason: "No updated ESPM metrics available" };
    }

    await step.run("append-snapshot", async () => {
      const baseSnapshot = await tenantDb.complianceSnapshot.findFirst({
        where: { id: snapshotId, buildingId },
      });

      if (!baseSnapshot) {
        throw new NonRetriableError("Snapshot not found");
      }

      await tenantDb.complianceSnapshot.create({
        data: {
          buildingId: baseSnapshot.buildingId,
          organizationId: baseSnapshot.organizationId,
          triggerType: "ESPM_SYNC",
          pipelineRunId: baseSnapshot.pipelineRunId,
          energyStarScore: metrics.score ?? baseSnapshot.energyStarScore,
          siteEui: baseSnapshot.siteEui,
          sourceEui: baseSnapshot.sourceEui,
          totalSiteKbtu: baseSnapshot.totalSiteKbtu,
          totalSourceKbtu: baseSnapshot.totalSourceKbtu,
          weatherNormalizedSiteEui:
            metrics.weatherNormalizedSiteIntensity ??
            baseSnapshot.weatherNormalizedSiteEui,
          complianceStatus: baseSnapshot.complianceStatus,
          complianceGap: baseSnapshot.complianceGap,
          estimatedPenalty: baseSnapshot.estimatedPenalty,
          dataQualityScore: baseSnapshot.dataQualityScore,
          activePathway: baseSnapshot.activePathway,
          targetScore: baseSnapshot.targetScore,
          targetEui: baseSnapshot.targetEui,
          penaltyInputsJson: baseSnapshot.penaltyInputsJson ?? undefined,
        },
      });
    });

    return { synced: true, metrics };
  },
);
