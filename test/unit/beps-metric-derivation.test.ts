import { describe, expect, it } from "vitest";
import { derivePeriodMetricsFromSnapshots } from "@/server/compliance/beps";

describe("BEPS metric derivation", () => {
  it("derives canonical period metrics from compliance snapshots deterministically", () => {
    const result = derivePeriodMetricsFromSnapshots({
      baselineSnapshots: [
        {
          id: "baseline-2019",
          snapshotDate: new Date("2019-06-01T00:00:00.000Z"),
          siteEui: 110,
          weatherNormalizedSiteEui: 108,
          weatherNormalizedSourceEui: 180,
          energyStarScore: 50,
          complianceRunId: "run-1",
        },
        {
          id: "baseline-2020",
          snapshotDate: new Date("2020-06-01T00:00:00.000Z"),
          siteEui: 90,
          weatherNormalizedSiteEui: 88,
          weatherNormalizedSourceEui: 170,
          energyStarScore: 55,
          complianceRunId: "run-2",
        },
      ],
      evaluationSnapshots: [
        {
          id: "evaluation-2025",
          snapshotDate: new Date("2025-06-01T00:00:00.000Z"),
          siteEui: 80,
          weatherNormalizedSiteEui: 79,
          weatherNormalizedSourceEui: 150,
          energyStarScore: 70,
          complianceRunId: "run-3",
        },
        {
          id: "evaluation-2026",
          snapshotDate: new Date("2026-06-01T00:00:00.000Z"),
          siteEui: 70,
          weatherNormalizedSiteEui: 68,
          weatherNormalizedSourceEui: 140,
          energyStarScore: 75,
          complianceRunId: "run-4",
        },
      ],
    });

    expect(result.baselineAdjustedSiteEui).toBe(100);
    expect(result.evaluationAdjustedSiteEui).toBe(75);
    expect(result.baselineWeatherNormalizedSiteEui).toBe(98);
    expect(result.evaluationWeatherNormalizedSiteEui).toBe(73.5);
    expect(result.baselineWeatherNormalizedSourceEui).toBe(175);
    expect(result.evaluationWeatherNormalizedSourceEui).toBe(145);
    expect(result.baselineEnergyStarScore).toBe(55);
    expect(result.evaluationEnergyStarScore).toBe(75);
    expect(result.baselineSnapshotId).toBe("baseline-2020");
    expect(result.evaluationSnapshotId).toBe("evaluation-2026");
    expect(result.sourceComplianceRunIds).toEqual(["run-1", "run-2", "run-3", "run-4"]);
  });
});
