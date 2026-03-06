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
 * 1. Ensure a meter exists on the property (create one if not)
 * 2. Push consumption data to the meter
 * 3. Pull updated metrics (score, EUI) from the property
 *
 * Each step is independent — a push failure doesn't prevent pulling metrics.
 */
export async function syncWithESPM(
  espmClient: ESPM,
  input: ESPMSyncInput,
): Promise<ESPMSyncResult> {
  const result: ESPMSyncResult = { pushed: false, metrics: null };

  // Step 1: Find or create a meter on this property
  let meterId = input.espmMeterId;

  if (input.readings.length > 0) {
    try {
      // Try to list existing meters
      const metersResponse = await espmClient.meter.listMeters(input.espmPropertyId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const meterList = metersResponse as any;
      const links = meterList?.response?.links?.link;

      if (links && Array.isArray(links) && links.length > 0) {
        // Use the first existing meter
        const meterLink = links[0];
        const meterIdMatch = String(meterLink?.["@_id"] || meterLink?.["@_href"] || "").match(/\/meter\/(\d+)/);
        if (meterIdMatch) {
          meterId = Number(meterIdMatch[1]);
          console.log(`[ESPM Sync] Found existing meter: ${meterId}`);
        }
      } else if (links && !Array.isArray(links)) {
        // Single meter returned as object
        const meterIdMatch = String(links?.["@_id"] || links?.["@_href"] || "").match(/\/meter\/(\d+)/);
        if (meterIdMatch) {
          meterId = Number(meterIdMatch[1]);
          console.log(`[ESPM Sync] Found existing meter: ${meterId}`);
        }
      }

      // If no meter found, create one
      if (meterId === input.espmPropertyId) {
        console.log(`[ESPM Sync] No meter found, creating electric meter on property ${input.espmPropertyId}...`);
        const firstReading = input.readings[0];
        const createResult = await espmClient.meter.createMeter(input.espmPropertyId, {
          type: "Electric",
          name: "Primary Electric Meter",
          unitOfMeasure: "kWh (thousand Watt-hours)",
          metered: true,
          firstBillDate: formatDate(firstReading.periodStart),
          inUse: true,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const createResponse = createResult as any;
        // Try to parse the new meter ID from the response
        const newId = createResponse?.response?.links?.link?.["@_id"]
          || createResponse?.meterId
          || createResponse?.id;
        if (newId) {
          meterId = Number(String(newId).replace(/\D/g, ""));
          console.log(`[ESPM Sync] Created meter: ${meterId}`);
        } else {
          // Try to extract from Location header or href
          const href = createResponse?.response?.links?.link?.["@_href"] || "";
          const hrefMatch = String(href).match(/\/meter\/(\d+)/);
          if (hrefMatch) {
            meterId = Number(hrefMatch[1]);
            console.log(`[ESPM Sync] Created meter (from href): ${meterId}`);
          } else {
            console.warn(`[ESPM Sync] Could not parse meter ID from create response:`, JSON.stringify(createResponse));
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[ESPM Sync] Meter setup failed: ${msg}`);
      // Continue — we'll try to push with whatever meter ID we have
    }

    // Step 2: Push consumption data to the meter
    try {
      const entries = input.readings.map((r) => ({
        startDate: formatDate(r.periodStart),
        endDate: formatDate(r.periodEnd),
        usage: r.consumptionNative,
      }));

      const chunks = chunkArray(entries, 120);
      for (const chunk of chunks) {
        await espmClient.consumption.pushConsumptionData(meterId, chunk);
      }
      result.pushed = true;
      console.log(`[ESPM Sync] Pushed ${entries.length} readings to meter ${meterId}`);
    } catch (err) {
      result.pushError = err instanceof Error ? err.message : String(err);
      console.error(
        `[ESPM Sync] Push failed for meter ${meterId}:`,
        result.pushError,
      );
    }
  }

  // Step 3: Pull updated metrics from the property
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
