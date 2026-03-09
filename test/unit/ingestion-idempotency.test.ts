import { describe, expect, it } from "vitest";
import {
  buildEnergyReadingIdempotencyKey,
  buildIngestionRunIdempotencyKey,
  buildUploadBatchId,
} from "@/server/pipelines/data-ingestion/idempotency";

describe("ingestion idempotency helpers", () => {
  it("builds deterministic upload batch IDs", () => {
    const first = buildUploadBatchId("building-a|csv-body");
    const second = buildUploadBatchId("building-a|csv-body");
    const third = buildUploadBatchId("building-b|csv-body");

    expect(first).toBe(second);
    expect(first).not.toBe(third);
  });

  it("builds deterministic energy reading keys", () => {
    const baseInput = {
      buildingId: "ck1234567",
      source: "CSV_UPLOAD" as const,
      meterType: "ELECTRIC" as const,
      periodStart: new Date("2025-01-01T00:00:00.000Z"),
      periodEnd: new Date("2025-01-31T00:00:00.000Z"),
      consumption: 42500,
      unit: "KWH" as const,
    };

    expect(buildEnergyReadingIdempotencyKey(baseInput)).toBe(
      buildEnergyReadingIdempotencyKey(baseInput),
    );
    expect(
      buildEnergyReadingIdempotencyKey({
        ...baseInput,
        consumption: 43000,
      }),
    ).not.toBe(buildEnergyReadingIdempotencyKey(baseInput));
  });

  it("builds ingestion run keys from tenant, building, trigger, and batch", () => {
    const first = buildIngestionRunIdempotencyKey({
      organizationId: "ckorg1",
      buildingId: "ckbldg1",
      triggerType: "CSV_UPLOAD",
      uploadBatchId: "batch_1",
    });
    const second = buildIngestionRunIdempotencyKey({
      organizationId: "ckorg1",
      buildingId: "ckbldg1",
      triggerType: "CSV_UPLOAD",
      uploadBatchId: "batch_1",
    });
    const third = buildIngestionRunIdempotencyKey({
      organizationId: "ckorg1",
      buildingId: "ckbldg1",
      triggerType: "MANUAL",
    });

    expect(first).toBe(second);
    expect(first).not.toBe(third);
  });
});
