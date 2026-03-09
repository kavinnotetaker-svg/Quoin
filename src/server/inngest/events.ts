import { z } from "zod";

const triggerTypeSchema = z.enum(["CSV_UPLOAD", "MANUAL", "WEBHOOK", "SCHEDULED"]);

export const dataIngestEventSchema = z.object({
  buildingId: z.string().min(1),
  organizationId: z.string().min(1),
  uploadBatchId: z.string().min(1).optional(),
  triggerType: triggerTypeSchema,
});

export const espmSyncMetricsEventSchema = z.object({
  organizationId: z.string().min(1),
  buildingId: z.string().min(1),
  snapshotId: z.string().min(1),
});

export const stripeWebhookReceivedEventSchema = z.object({
  eventId: z.string().min(1),
  type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

export const driftDetectEventSchema = z.object({
  buildingId: z.string().min(1),
  organizationId: z.string().min(1),
  triggerType: z.enum(["SCHEDULED", "MANUAL", "ON_INGESTION"]),
});

export const pathwayAnalyzeEventSchema = z.object({
  buildingId: z.string().min(1),
  organizationId: z.string().min(1),
});

export const capitalStructureEventSchema = z.object({
  buildingId: z.string().min(1),
  organizationId: z.string().min(1),
  triggerType: z.enum(["MANUAL", "ON_PATHWAY_COMPLETE"]),
});

export const greenButtonSyncEventSchema = z.object({
  buildingId: z.string().min(1),
  organizationId: z.string().min(1),
  connectionId: z.string().min(1),
  notificationUri: z.string().url().optional(),
  triggerType: z.enum(["WEBHOOK", "MANUAL", "SCHEDULED"]),
});

export function dataIngestEvent(
  data: z.input<typeof dataIngestEventSchema>,
) {
  return {
    name: "data/ingest" as const,
    data: dataIngestEventSchema.parse(data),
  };
}

export function espmSyncMetricsEvent(
  data: z.input<typeof espmSyncMetricsEventSchema>,
) {
  return {
    name: "espm/sync-metrics" as const,
    data: espmSyncMetricsEventSchema.parse(data),
  };
}

export function stripeWebhookReceivedEvent(
  data: z.input<typeof stripeWebhookReceivedEventSchema>,
) {
  return {
    name: "stripe/webhook.received" as const,
    data: stripeWebhookReceivedEventSchema.parse(data),
  };
}

export function driftDetectEvent(
  data: z.input<typeof driftDetectEventSchema>,
) {
  return {
    name: "drift/detect" as const,
    data: driftDetectEventSchema.parse(data),
  };
}

export function pathwayAnalyzeEvent(
  data: z.input<typeof pathwayAnalyzeEventSchema>,
) {
  return {
    name: "pathway/analyze" as const,
    data: pathwayAnalyzeEventSchema.parse(data),
  };
}

export function capitalStructureEvent(
  data: z.input<typeof capitalStructureEventSchema>,
) {
  return {
    name: "capital/structure" as const,
    data: capitalStructureEventSchema.parse(data),
  };
}

export function greenButtonSyncEvent(
  data: z.input<typeof greenButtonSyncEventSchema>,
) {
  return {
    name: "green-button/sync" as const,
    data: greenButtonSyncEventSchema.parse(data),
  };
}
