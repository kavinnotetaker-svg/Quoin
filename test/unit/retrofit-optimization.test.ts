import { describe, expect, it } from "vitest";
import type { RankingContext, RetrofitCandidateRecord } from "@/server/compliance/retrofit-optimization";
import {
  RETROFIT_RANK_REASON_CODES,
  rankRetrofitCandidateData,
} from "@/server/compliance/retrofit-optimization";

function makeCandidate(
  overrides: Partial<RetrofitCandidateRecord> = {},
): RetrofitCandidateRecord {
  return {
    id: "candidate-1",
    organizationId: "org-1",
    buildingId: "building-1",
    sourceArtifactId: null,
    projectType: "LED_LIGHTING_RETROFIT",
    candidateSource: "MANUAL",
    status: "ACTIVE",
    name: "Candidate",
    description: null,
    complianceCycle: "CYCLE_1",
    targetFilingYear: 2026,
    estimatedCapex: 200000,
    estimatedIncentiveAmount: 0,
    estimatedAnnualSavingsKbtu: 400000,
    estimatedAnnualSavingsUsd: 12000,
    estimatedSiteEuiReduction: 8,
    estimatedSourceEuiReduction: 12,
    estimatedBepsImprovementPct: 12,
    estimatedImplementationMonths: 4,
    confidenceBand: "MEDIUM",
    sourceMetadata: {},
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: new Date("2026-03-01T00:00:00.000Z"),
    building: {
      id: "building-1",
      name: "Candidate Building",
      complianceCycle: "CYCLE_1",
    },
    ...overrides,
  };
}

function makeContext(overrides: Partial<RankingContext> = {}): RankingContext {
  return {
    building: {
      id: "building-1",
      organizationId: "org-1",
      name: "Candidate Building",
      grossSquareFeet: 100000,
      propertyType: "OFFICE",
      yearBuilt: 1990,
      complianceCycle: "CYCLE_1",
      maxPenaltyExposure: 1000000,
      ...(overrides.building ?? {}),
    },
    latestSnapshot: {
      id: "snapshot-1",
      siteEui: 80,
      sourceEui: 150,
    },
    latestComplianceContext: {
      id: "filing-1",
      filingYear: 2026,
      complianceCycle: "CYCLE_1",
      complianceRunId: "run-1",
    },
    penaltySummary: {
      status: "ESTIMATED",
      currentEstimatedPenalty: 900000,
      calculatedAt: "2026-03-09T00:00:00.000Z",
    },
    anomalies: [],
    deadlineDate: new Date("2026-12-31T00:00:00.000Z"),
    ...overrides,
  };
}

describe("retrofit optimization", () => {
  it("ranks higher avoided penalty above lower avoided penalty", () => {
    const context = makeContext();
    const highBenefit = rankRetrofitCandidateData({
      candidate: makeCandidate({
        id: "high",
        estimatedBepsImprovementPct: 20,
      }),
      context,
      now: new Date("2026-03-10T00:00:00.000Z"),
    });
    const lowBenefit = rankRetrofitCandidateData({
      candidate: makeCandidate({
        id: "low",
        estimatedBepsImprovementPct: 6,
      }),
      context,
      now: new Date("2026-03-10T00:00:00.000Z"),
    });

    expect(highBenefit.estimatedAvoidedPenalty ?? -1).toBeGreaterThan(
      lowBenefit.estimatedAvoidedPenalty ?? -1,
    );
    expect(highBenefit.priorityScore).toBeGreaterThan(lowBenefit.priorityScore);
  });

  it("ranks lower capex higher when compliance benefit is similar", () => {
    const context = makeContext();
    const lowCapex = rankRetrofitCandidateData({
      candidate: makeCandidate({
        id: "low-capex",
        estimatedCapex: 120000,
        estimatedBepsImprovementPct: 12,
      }),
      context,
      now: new Date("2026-03-10T00:00:00.000Z"),
    });
    const highCapex = rankRetrofitCandidateData({
      candidate: makeCandidate({
        id: "high-capex",
        estimatedCapex: 400000,
        estimatedBepsImprovementPct: 12,
      }),
      context,
      now: new Date("2026-03-10T00:00:00.000Z"),
    });

    expect(lowCapex.priorityScore).toBeGreaterThan(highCapex.priorityScore);
    expect(lowCapex.reasonCodes).toContain(RETROFIT_RANK_REASON_CODES.lowNetCostForBenefit);
  });

  it("penalizes projects that likely miss the active cycle deadline", () => {
    const context = makeContext();
    const fast = rankRetrofitCandidateData({
      candidate: makeCandidate({
        id: "fast",
        estimatedImplementationMonths: 4,
      }),
      context,
      now: new Date("2026-03-10T00:00:00.000Z"),
    });
    const slow = rankRetrofitCandidateData({
      candidate: makeCandidate({
        id: "slow",
        estimatedImplementationMonths: 16,
      }),
      context,
      now: new Date("2026-11-01T00:00:00.000Z"),
    });

    expect(fast.priorityScore).toBeGreaterThan(slow.priorityScore);
    expect(slow.reasonCodes).toContain(RETROFIT_RANK_REASON_CODES.mayMissCycleDeadline);
  });

  it("adds anomaly context to the rationale when the candidate is linked to active anomalies", () => {
    const candidate = makeCandidate({
      sourceMetadata: {
        sourceAnomalyIds: ["anomaly-1"],
      },
    });
    const ranked = rankRetrofitCandidateData({
      candidate,
      context: makeContext({
        anomalies: [
          {
            id: "anomaly-1",
            anomalyType: "UNUSUAL_CONSUMPTION_SPIKE",
            severity: "HIGH",
            title: "Consumption spike",
            estimatedEnergyImpactKbtu: null,
            estimatedPenaltyImpactUsd: null,
            penaltyImpactStatus: "INSUFFICIENT_CONTEXT",
          },
        ],
      }),
      now: new Date("2026-03-10T00:00:00.000Z"),
    });

    expect(ranked.rationale.anomalyContextCount).toBe(1);
    expect(ranked.reasonCodes).toContain(RETROFIT_RANK_REASON_CODES.anomalyContextPresent);
    expect(ranked.sourceRefs.some((sourceRef) => sourceRef.recordType === "OPERATIONAL_ANOMALY")).toBe(true);
    expect(ranked.estimatedOperationalRiskReduction.penaltyImpactUsd).toBeNull();
    expect(ranked.estimatedOperationalRiskReduction.status).toBe("INSUFFICIENT_CONTEXT");
  });

  it("omits avoided penalty when no governed penalty summary exists", () => {
    const ranked = rankRetrofitCandidateData({
      candidate: makeCandidate(),
      context: makeContext({
        penaltySummary: null,
      }),
      now: new Date("2026-03-10T00:00:00.000Z"),
    });

    expect(ranked.estimatedAvoidedPenalty).toBeNull();
    expect(ranked.estimatedAvoidedPenaltyStatus).toBe("INSUFFICIENT_CONTEXT");
    expect(ranked.priorityScore).toBeGreaterThan(0);
    expect(ranked.basis.assumptions).toContain(
      "Avoided penalty is omitted because no current governed penalty estimate is available.",
    );
  });

  it("uses anomaly penalty impact as operational risk reduction when aligned anomaly context exists", () => {
    const ranked = rankRetrofitCandidateData({
      candidate: makeCandidate({
        sourceMetadata: {
          sourceAnomalyIds: ["anomaly-1"],
        },
      }),
      context: makeContext({
        anomalies: [
          {
            id: "anomaly-1",
            anomalyType: "UNUSUAL_CONSUMPTION_SPIKE",
            severity: "HIGH",
            title: "Consumption spike",
            estimatedEnergyImpactKbtu: 15000,
            estimatedPenaltyImpactUsd: 12000,
            penaltyImpactStatus: "ESTIMATED",
          },
        ],
      }),
      now: new Date("2026-03-10T00:00:00.000Z"),
    });

    expect(ranked.estimatedOperationalRiskReduction.penaltyImpactUsd).toBe(12000);
    expect(ranked.estimatedOperationalRiskReduction.energyImpactKbtu).toBe(15000);
    expect(ranked.estimatedOperationalRiskReduction.status).toBe("ESTIMATED");
  });
});
