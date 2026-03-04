import type { ESPM } from "@/server/integrations/espm";
import type { PropertyMetrics } from "@/server/integrations/espm/types";

export interface ESPMSyncInput {
  espmPropertyId: number;
  espmMeterId: number;
  readings: Array<{
    periodStart: Date;
    periodEnd: Date;
    consumptionNative: number;
    nativeUnit: string;
  }>;
}

export interface ESPMSyncResult {
  pushed: boolean;
  pushError?: string;
  metrics: PropertyMetrics | null;
  metricsError?: string;
}

/**
 * Sync energy data with ESPM:
 * 1. Push consumption data to the building's meter
 * 2. Pull updated metrics (score, EUI)
 *
 * Each step is independent — a push failure doesn't prevent pulling metrics.
 */
export async function syncWithESPM(
  espmClient: ESPM,
  input: ESPMSyncInput,
): Promise<ESPMSyncResult> {
  const result: ESPMSyncResult = { pushed: false, metrics: null };

  // Push consumption data
  if (input.readings.length > 0) {
    try {
      const entries = input.readings.map((r) => ({
        startDate: formatDate(r.periodStart),
        endDate: formatDate(r.periodEnd),
        usage: r.consumptionNative,
      }));

      const chunks = chunkArray(entries, 120);
      for (const chunk of chunks) {
        await espmClient.consumption.pushConsumptionData(
          input.espmMeterId,
          chunk,
        );
      }
      result.pushed = true;
    } catch (err) {
      result.pushError = err instanceof Error ? err.message : String(err);
      console.error(
        `[ESPM Sync] Push failed for property ${input.espmPropertyId}:`,
        result.pushError,
      );
    }
  }

  // Pull updated metrics
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    result.metrics = await espmClient.metrics.getPropertyMetrics(
      input.espmPropertyId,
      year,
      month,
    );
  } catch (err) {
    result.metricsError = err instanceof Error ? err.message : String(err);
    console.error(
      `[ESPM Sync] Metrics pull failed for property ${input.espmPropertyId}:`,
      result.metricsError,
    );
  }

  return result;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
