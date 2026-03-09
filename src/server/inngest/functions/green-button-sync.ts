import { NonRetriableError } from "inngest";
import { inngest } from "../client";
import { greenButtonSyncEventSchema } from "../events";
import { getTenantClient } from "@/server/lib/db";
import {
  aggregateToMonthly,
  fetchNotificationData,
  fetchSubscriptionData,
  getGreenButtonConfig,
  getValidToken,
} from "@/server/integrations/green-button";
import {
  buildUploadBatchId,
  persistEnergyReadings,
} from "@/server/pipelines/data-ingestion/idempotency";
import { runIngestionPipeline } from "@/server/pipelines/data-ingestion/logic";
import { createESPMClient } from "@/server/integrations/espm";

function validateNotificationUri(
  notificationUri: string | undefined,
  resourceUri: string | null,
) {
  if (!notificationUri) {
    return;
  }

  if (!resourceUri) {
    throw new NonRetriableError("Missing resource URI for Green Button connection");
  }

  const notificationUrl = new URL(notificationUri);
  const resourceUrl = new URL(resourceUri);

  if (notificationUrl.protocol !== "https:") {
    throw new NonRetriableError("Green Button notification URI must use HTTPS");
  }

  if (notificationUrl.host !== resourceUrl.host) {
    throw new NonRetriableError("Green Button notification URI host mismatch");
  }
}

export const greenButtonSyncJob = inngest.createFunction(
  {
    id: "green-button-sync",
    retries: 3,
    onFailure: async ({ error }) => {
      console.error("[DLQ] Green Button sync failed", error);
    },
  },
  { event: "green-button/sync" },
  async ({ event, step }) => {
    const data = greenButtonSyncEventSchema.parse(event.data);
    const config = getGreenButtonConfig();
    const encryptionKey = process.env["GREEN_BUTTON_ENCRYPTION_KEY"];

    if (!config || !encryptionKey) {
      throw new NonRetriableError("Green Button integration is not configured");
    }

    const tenantDb = getTenantClient(data.organizationId);

    const connection = await step.run("load-connection", async () => {
      const building = await tenantDb.building.findFirst({
        where: {
          id: data.buildingId,
          archivedAt: null,
        },
      });
      if (!building) {
        throw new NonRetriableError("Building not found");
      }

      const greenButtonConnection = await tenantDb.greenButtonConnection.findFirst({
        where: {
          id: data.connectionId,
          buildingId: data.buildingId,
        },
      });

      if (!greenButtonConnection) {
        throw new NonRetriableError("Green Button connection not found");
      }

      return greenButtonConnection;
    });

    validateNotificationUri(data.notificationUri, connection.resourceUri);

    const tokens = await step.run("load-valid-token", async () => {
      const currentTokens = await getValidToken(
        data.buildingId,
        config,
        encryptionKey,
        tenantDb,
      );

      if (!currentTokens) {
        await tenantDb.greenButtonConnection.update({
          where: { buildingId: data.buildingId },
          data: { status: "EXPIRED" },
        });
        throw new NonRetriableError("No valid Green Button token available");
      }

      return currentTokens;
    });
    const hydratedTokens = {
      ...tokens,
      expiresAt: new Date(tokens.expiresAt),
    };

    const readings = await step.run("fetch-usage", async () => {
      if (data.notificationUri) {
        return fetchNotificationData(data.notificationUri, hydratedTokens.accessToken);
      }

      return fetchSubscriptionData(hydratedTokens);
    });
    const hydratedReadings = readings.map((reading) => ({
      ...reading,
      periodStart: new Date(reading.periodStart),
      periodEnd: new Date(reading.periodEnd),
    }));

    const monthlyReadings = aggregateToMonthly(hydratedReadings);
    if (monthlyReadings.length === 0) {
      return { synced: false, createdReadings: 0, summary: "No readings returned" };
    }

    const uploadBatchId = buildUploadBatchId(
      [
        data.organizationId,
        data.buildingId,
        data.connectionId,
        data.notificationUri ?? hydratedTokens.subscriptionId,
        monthlyReadings[monthlyReadings.length - 1]?.periodEnd.toISOString() ?? "",
      ].join("|"),
    );

    const persisted = await step.run("persist-readings", async () => {
      return persistEnergyReadings({
        buildingId: data.buildingId,
        organizationId: data.organizationId,
        uploadBatchId,
        tenantDb,
        readings: monthlyReadings.map((reading) => ({
          source: "GREEN_BUTTON",
          meterType: reading.fuelType === "GAS" ? "GAS" : "ELECTRIC",
          periodStart: reading.periodStart,
          periodEnd: reading.periodEnd,
          consumption: reading.consumptionKWh,
          unit: "KWH",
          consumptionKbtu: reading.consumptionKBtu,
          cost: reading.cost,
          isVerified: !reading.isEstimated,
          rawPayload: {
            notificationUri: data.notificationUri ?? null,
            subscriptionId: hydratedTokens.subscriptionId,
            resourceUri: hydratedTokens.resourceUri,
            intervalSeconds: reading.intervalSeconds,
          },
        })),
      });
    });

    if (persisted.createdCount === 0) {
      return {
        synced: true,
        createdReadings: 0,
        summary: "Duplicate notification ignored",
      };
    }

    const pipelineResult = await step.run("run-ingestion-pipeline", async () => {
      let espmClient;
      try {
        espmClient = createESPMClient();
      } catch {
        espmClient = undefined;
      }

      return runIngestionPipeline({
        buildingId: data.buildingId,
        organizationId: data.organizationId,
        uploadBatchId,
        triggerType: "WEBHOOK",
        tenantDb,
        espmClient,
      });
    });

    return {
      synced: true,
      createdReadings: persisted.createdCount,
      duplicateReadings: persisted.duplicateCount,
      pipelineResult,
    };
  },
);
