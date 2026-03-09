import crypto from "crypto";
import type { EnergyUnit, MeterType } from "./types";

export interface PersistableEnergyReading {
  source: "GREEN_BUTTON" | "CSV_UPLOAD" | "ESPM_SYNC" | "MANUAL";
  meterType: MeterType;
  periodStart: Date;
  periodEnd: Date;
  consumption: number;
  unit: EnergyUnit;
  consumptionKbtu: number;
  cost: number | null;
  isVerified?: boolean;
  rawPayload?: unknown;
}

function shortHash(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 24);
}

export function buildUploadBatchId(seed: string): string {
  return `batch_${shortHash(seed)}`;
}

export function buildIngestionRunIdempotencyKey(input: {
  organizationId: string;
  buildingId: string;
  triggerType: "CSV_UPLOAD" | "MANUAL" | "WEBHOOK" | "SCHEDULED";
  uploadBatchId?: string;
}): string {
  return `ingest_${shortHash(
    [
      input.organizationId,
      input.buildingId,
      input.triggerType,
      input.uploadBatchId ?? "latest",
    ].join("|"),
  )}`;
}

export function buildEnergyReadingIdempotencyKey(input: {
  buildingId: string;
  source: PersistableEnergyReading["source"];
  meterType: MeterType;
  periodStart: Date;
  periodEnd: Date;
  consumption: number;
  unit: EnergyUnit;
}): string {
  return `reading_${shortHash(
    [
      input.buildingId,
      input.source,
      input.meterType,
      input.periodStart.toISOString(),
      input.periodEnd.toISOString(),
      input.unit,
      input.consumption.toFixed(6),
    ].join("|"),
  )}`;
}

export async function persistEnergyReadings(params: {
  buildingId: string;
  organizationId: string;
  uploadBatchId: string;
  readings: PersistableEnergyReading[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tenantDb: any;
}) {
  const result = await params.tenantDb.energyReading.createMany({
    data: params.readings.map((reading) => ({
      buildingId: params.buildingId,
      organizationId: params.organizationId,
      source: reading.source,
      meterType: reading.meterType,
      periodStart: reading.periodStart,
      periodEnd: reading.periodEnd,
      consumption: reading.consumption,
      unit: reading.unit,
      consumptionKbtu: reading.consumptionKbtu,
      cost: reading.cost,
      isVerified: reading.isVerified ?? false,
      uploadBatchId: params.uploadBatchId,
      idempotencyKey: buildEnergyReadingIdempotencyKey({
        buildingId: params.buildingId,
        source: reading.source,
        meterType: reading.meterType,
        periodStart: reading.periodStart,
        periodEnd: reading.periodEnd,
        consumption: reading.consumption,
        unit: reading.unit,
      }),
      rawPayload: reading.rawPayload ?? null,
    })),
    skipDuplicates: true,
  });

  return {
    createdCount: result.count,
    duplicateCount: params.readings.length - result.count,
  };
}
