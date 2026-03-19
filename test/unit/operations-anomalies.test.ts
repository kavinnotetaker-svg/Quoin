import { describe, expect, it } from "vitest";
import {
  detectOperationalAnomaliesData,
  OPERATIONAL_ANOMALY_REASON_CODES,
} from "@/server/compliance/operations-anomalies";

function monthRange(year: number, monthIndex: number) {
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0));
  return { start, end };
}

function createReading(input: {
  id: string;
  meterId: string | null;
  monthIndex: number;
  dailyKbtu: number;
  year?: number;
}) {
  const year = input.year ?? 2025;
  const { start, end } = monthRange(year, input.monthIndex);
  const days = Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  return {
    id: input.id,
    meterId: input.meterId,
    meterType: "ELECTRIC" as const,
    periodStart: start,
    periodEnd: end,
    consumptionKbtu: input.dailyKbtu * days,
  };
}

function buildBaseInput() {
  return {
    building: {
      id: "building-1",
      organizationId: "org-1",
      name: "Operations Test Building",
      grossSquareFeet: 100000,
      complianceCycle: "CYCLE_1" as const,
    },
    meters: [
      {
        id: "meter-1",
        name: "Main Electric",
        meterType: "ELECTRIC" as const,
        isActive: true,
      },
    ],
    latestSnapshot: {
      id: "snapshot-1",
      snapshotDate: new Date("2026-03-01T00:00:00.000Z"),
      siteEui: 72,
    },
    syncState: {
      id: "sync-1",
    },
    now: new Date("2026-03-09T00:00:00.000Z"),
  };
}

describe("operations anomaly detection", () => {
  it("detects abnormal baseload from elevated recent low-load months", () => {
    const anomalies = detectOperationalAnomaliesData({
      ...buildBaseInput(),
      readings: [
        createReading({ id: "r1", meterId: "meter-1", monthIndex: 0, dailyKbtu: 100 }),
        createReading({ id: "r2", meterId: "meter-1", monthIndex: 1, dailyKbtu: 102 }),
        createReading({ id: "r3", meterId: "meter-1", monthIndex: 2, dailyKbtu: 105 }),
        createReading({ id: "r4", meterId: "meter-1", monthIndex: 3, dailyKbtu: 160 }),
        createReading({ id: "r5", meterId: "meter-1", monthIndex: 4, dailyKbtu: 170 }),
        createReading({ id: "r6", meterId: "meter-1", monthIndex: 5, dailyKbtu: 150 }),
        createReading({ id: "r7", meterId: "meter-1", monthIndex: 6, dailyKbtu: 130 }),
        createReading({ id: "r8", meterId: "meter-1", monthIndex: 7, dailyKbtu: 132 }),
        createReading({ id: "r9", meterId: "meter-1", monthIndex: 8, dailyKbtu: 135 }),
        createReading({ id: "r10", meterId: "meter-1", monthIndex: 9, dailyKbtu: 165 }),
        createReading({ id: "r11", meterId: "meter-1", monthIndex: 10, dailyKbtu: 170 }),
        createReading({ id: "r12", meterId: "meter-1", monthIndex: 11, dailyKbtu: 168 }),
      ],
    });

    const anomaly = anomalies.find((entry) => entry.anomalyType === "ABNORMAL_BASELOAD");
    expect(anomaly).toBeTruthy();
    expect(anomaly?.reasonCodes).toContain(
      OPERATIONAL_ANOMALY_REASON_CODES.elevatedBaseload,
    );
    expect(anomaly?.estimatedEnergyImpactKbtu).toBeGreaterThan(5000);
  });

  it("detects off-hours schedule drift as an explicit monthly proxy", () => {
    const anomalies = detectOperationalAnomaliesData({
      ...buildBaseInput(),
      readings: [
        createReading({ id: "r1", meterId: "meter-1", monthIndex: 0, dailyKbtu: 90 }),
        createReading({ id: "r2", meterId: "meter-1", monthIndex: 1, dailyKbtu: 95 }),
        createReading({ id: "r3", meterId: "meter-1", monthIndex: 2, dailyKbtu: 100 }),
        createReading({ id: "r4", meterId: "meter-1", monthIndex: 3, dailyKbtu: 170 }),
        createReading({ id: "r5", meterId: "meter-1", monthIndex: 4, dailyKbtu: 180 }),
        createReading({ id: "r6", meterId: "meter-1", monthIndex: 5, dailyKbtu: 160 }),
        createReading({ id: "r7", meterId: "meter-1", monthIndex: 6, dailyKbtu: 145 }),
        createReading({ id: "r8", meterId: "meter-1", monthIndex: 7, dailyKbtu: 150 }),
        createReading({ id: "r9", meterId: "meter-1", monthIndex: 8, dailyKbtu: 152 }),
        createReading({ id: "r10", meterId: "meter-1", monthIndex: 9, dailyKbtu: 160 }),
        createReading({ id: "r11", meterId: "meter-1", monthIndex: 10, dailyKbtu: 158 }),
        createReading({ id: "r12", meterId: "meter-1", monthIndex: 11, dailyKbtu: 155 }),
      ],
    });

    const anomaly = anomalies.find(
      (entry) => entry.anomalyType === "OFF_HOURS_SCHEDULE_DRIFT",
    );
    expect(anomaly).toBeTruthy();
    expect(anomaly?.reasonCodes).toContain(
      OPERATIONAL_ANOMALY_REASON_CODES.scheduleDriftProxy,
    );
    expect((anomaly?.metadata["explanation"] as string) ?? "").toContain("proxy");
  });

  it("detects unusual consumption spikes and estimates site-eui impact", () => {
    const anomalies = detectOperationalAnomaliesData({
      ...buildBaseInput(),
      penaltySummary: {
        status: "ESTIMATED",
        currentEstimatedPenalty: 100000,
        calculatedAt: "2026-03-01T00:00:00.000Z",
      },
      readings: [
        createReading({ id: "r1", meterId: "meter-1", monthIndex: 8, dailyKbtu: 100 }),
        createReading({ id: "r2", meterId: "meter-1", monthIndex: 9, dailyKbtu: 100 }),
        createReading({ id: "r3", meterId: "meter-1", monthIndex: 10, dailyKbtu: 100 }),
        createReading({ id: "r4", meterId: "meter-1", monthIndex: 11, dailyKbtu: 135 }),
      ],
    });

    const anomaly = anomalies.find(
      (entry) => entry.anomalyType === "UNUSUAL_CONSUMPTION_SPIKE",
    );
    expect(anomaly).toBeTruthy();
    expect(anomaly?.reasonCodes).toContain(
      OPERATIONAL_ANOMALY_REASON_CODES.consumptionSpike,
    );
    expect(anomaly?.attribution.estimatedSiteEuiDelta).toBeGreaterThan(0);
    expect(anomaly?.attribution.likelyBepsImpact).toBe(
      "LIKELY_HIGHER_EUI_AND_WORSE_TRAJECTORY",
    );
    expect(anomaly?.attribution.penaltyImpactStatus).toBe("ESTIMATED");
    expect(anomaly?.attribution.estimatedPenaltyImpactUsd).toBeGreaterThan(0);
  });

  it("detects missing or suspect meter data from gaps and zero-usage readings", () => {
    const anomalies = detectOperationalAnomaliesData({
      ...buildBaseInput(),
      readings: [
        {
          id: "r1",
          meterId: "meter-1",
          meterType: "ELECTRIC" as const,
          periodStart: new Date("2025-01-01T00:00:00.000Z"),
          periodEnd: new Date("2025-01-31T00:00:00.000Z"),
          consumptionKbtu: 5000,
        },
        {
          id: "r2",
          meterId: "meter-1",
          meterType: "ELECTRIC" as const,
          periodStart: new Date("2025-03-15T00:00:00.000Z"),
          periodEnd: new Date("2025-03-31T00:00:00.000Z"),
          consumptionKbtu: 0,
        },
      ],
    });

    const anomaly = anomalies.find(
      (entry) => entry.anomalyType === "MISSING_OR_SUSPECT_METER_DATA",
    );
    expect(anomaly).toBeTruthy();
    expect(anomaly?.reasonCodes).toContain(OPERATIONAL_ANOMALY_REASON_CODES.coverageGap);
    expect(anomaly?.reasonCodes).toContain(OPERATIONAL_ANOMALY_REASON_CODES.suspectZeroUsage);
    expect(anomaly?.attribution.likelyBenchmarkingImpact).toBe("LIKELY_READINESS_BLOCKER");
    expect(anomaly?.attribution.penaltyImpactStatus).toBe("INSUFFICIENT_CONTEXT");
  });

  it("detects inconsistent meter behavior when a meter diverges from a stable building trend", () => {
    const anomalies = detectOperationalAnomaliesData({
      ...buildBaseInput(),
      meters: [
        {
          id: "meter-1",
          name: "Main Electric",
          meterType: "ELECTRIC" as const,
          isActive: true,
        },
        {
          id: "meter-2",
          name: "Tenant Submeter",
          meterType: "ELECTRIC" as const,
          isActive: true,
        },
      ],
      readings: [
        createReading({ id: "r1", meterId: "meter-1", monthIndex: 8, dailyKbtu: 80 }),
        createReading({ id: "r2", meterId: "meter-1", monthIndex: 9, dailyKbtu: 82 }),
        createReading({ id: "r3", meterId: "meter-1", monthIndex: 10, dailyKbtu: 81 }),
        createReading({ id: "r4", meterId: "meter-1", monthIndex: 11, dailyKbtu: 80 }),
        createReading({ id: "r5", meterId: "meter-2", monthIndex: 8, dailyKbtu: 20 }),
        createReading({ id: "r6", meterId: "meter-2", monthIndex: 9, dailyKbtu: 19 }),
        createReading({ id: "r7", meterId: "meter-2", monthIndex: 10, dailyKbtu: 21 }),
        createReading({ id: "r8", meterId: "meter-2", monthIndex: 11, dailyKbtu: 40 }),
      ],
    });

    const anomaly = anomalies.find(
      (entry) => entry.anomalyType === "INCONSISTENT_METER_BEHAVIOR",
    );
    expect(anomaly).toBeTruthy();
    expect(anomaly?.reasonCodes).toContain(
      OPERATIONAL_ANOMALY_REASON_CODES.meterDivergesFromBuildingTrend,
    );
    expect(anomaly?.meterId).toBe("meter-2");
  });
});
