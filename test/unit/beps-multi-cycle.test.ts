import { describe, expect, it } from "vitest";
import {
  BepsConfigurationError,
  getBepsFactorSetKeyForCycle,
} from "@/server/compliance/beps/config";
import { evaluateBepsData } from "@/server/compliance/beps/beps-evaluator";
import { evaluateTrajectoryPathway } from "@/server/compliance/beps/trajectory-pathway";
import type {
  BepsBuildingInput,
  BepsFactorConfig,
  BepsHistoricalMetricPoint,
  BepsRuleConfig,
} from "@/server/compliance/beps/types";

const cycle2Building: BepsBuildingInput = {
  id: "building-cycle-2",
  organizationId: "org-1",
  grossSquareFeet: 150000,
  propertyType: "OFFICE",
  ownershipType: "PRIVATE",
  yearBuilt: 1995,
  bepsTargetScore: 74,
  complianceCycle: "CYCLE_2",
  selectedPathway: null,
  baselineYear: 2027,
  targetEui: 85,
  maxPenaltyExposure: 1800000,
  isEnergyStarScoreEligible: true,
};

const cycle2RuleConfig: BepsRuleConfig = {
  cycle: "CYCLE_2",
  filingYear: 2028,
  pathwayRouting: {
    preferredPathway: "TRAJECTORY",
    supportedPathways: ["TRAJECTORY"],
    prescriptiveAlwaysEligible: false,
  },
  trajectory: {
    metricBasis: "ADJUSTED_SITE_EUI_AVERAGE",
    targetYears: [2028],
    finalTargetYear: 2028,
  },
};

const cycle2FactorConfig: BepsFactorConfig = {
  cycle: {
    filingYear: 2028,
    cycleStartYear: 2028,
    cycleEndYear: 2032,
    baselineYears: [2024, 2025],
    evaluationYears: [2028],
  },
  applicability: {
    minGrossSquareFeetPrivate: 25000,
    minGrossSquareFeetDistrict: 10000,
    ownershipClassFallback: "PRIVATE",
    coveredPropertyTypes: ["OFFICE", "MULTIFAMILY", "MIXED_USE", "OTHER"],
    recentConstructionExemptionYears: 5,
    cycleStartYear: 2028,
    cycleEndYear: 2032,
    filingYear: 2028,
  },
  pathwayRouting: {
    performanceScoreThreshold: 60,
    prescriptiveAlwaysEligible: false,
    preferredPathway: "TRAJECTORY",
    supportedPathways: ["TRAJECTORY"],
  },
  trajectory: {
    metricBasis: "ADJUSTED_SITE_EUI_AVERAGE",
    targetYears: [2028],
    finalTargetYear: 2028,
  },
  standardsTable: [
    {
      cycle: "CYCLE_2",
      pathway: "TRAJECTORY",
      propertyType: "OFFICE",
      metricType: "ADJUSTED_SITE_EUI_AVERAGE",
      year: 2028,
      targetValue: 85,
    },
    {
      cycle: "CYCLE_2",
      pathway: "STANDARD_TARGET",
      propertyType: "OFFICE",
      metricType: "ENERGY_STAR_SCORE",
      targetValue: 74,
      maxGap: 12,
    },
  ],
  performance: {
    requiredReductionFraction: 0.25,
    scoreEligibleMetric: "ADJUSTED_SITE_EUI_AVERAGE",
    nonScoreEligibleMetric: "WEATHER_NORMALIZED_SITE_EUI_AVERAGE",
    defaultBaselineYears: [2024, 2025],
    defaultEvaluationYears: [2028],
  },
  standardTarget: {
    defaultMaxGap: 12,
    scoreEligibleMetric: "ENERGY_STAR_SCORE",
    nonScoreEligibleMetric: "WEATHER_NORMALIZED_SOURCE_EUI",
  },
  prescriptive: {
    defaultPointsNeeded: 30,
    complianceBasis: "APPROVED_MEASURES_AND_MILESTONES",
  },
  alternativeCompliance: {
    penaltyPerSquareFoot: 12,
    maxPenaltyCap: 9000000,
    agreementRequired: false,
    allowedAgreementPathways: ["TRAJECTORY"],
  },
};

const successfulHistory: BepsHistoricalMetricPoint[] = [
  {
    id: "2028",
    snapshotDate: new Date("2028-06-30T00:00:00.000Z"),
    siteEui: 84,
    weatherNormalizedSiteEui: 83,
    weatherNormalizedSourceEui: 150,
    energyStarScore: 76,
  },
];

const partialHistory: BepsHistoricalMetricPoint[] = [
  {
    id: "2028-partial",
    snapshotDate: new Date("2028-06-30T00:00:00.000Z"),
    siteEui: 90,
    weatherNormalizedSiteEui: 89,
    weatherNormalizedSourceEui: 158,
    energyStarScore: 72,
  },
];

describe("BEPS multi-cycle support", () => {
  it("selects cycle-specific factor keys", () => {
    expect(getBepsFactorSetKeyForCycle("CYCLE_1")).toBe("DC_BEPS_CYCLE_1_FACTORS_V1");
    expect(getBepsFactorSetKeyForCycle("CYCLE_2")).toBe("DC_BEPS_CYCLE_2_FACTORS_V1");
  });

  it("keeps cycle 3 explicitly unsupported until governed records are added", () => {
    expect(() => getBepsFactorSetKeyForCycle("CYCLE_3")).toThrow(BepsConfigurationError);
    expect(() => getBepsFactorSetKeyForCycle("CYCLE_3")).toThrow(
      "not yet supported by governed BEPS records",
    );
  });

  it("passes the trajectory pathway when the 2028 final target is met", () => {
    const result = evaluateTrajectoryPathway({
      eligible: true,
      cycle: "CYCLE_2",
      building: cycle2Building,
      baselineAdjustedSiteEui: 100,
      baselineWeatherNormalizedSiteEui: 98,
      historicalMetrics: successfulHistory,
      ruleConfig: cycle2RuleConfig,
      factorConfig: cycle2FactorConfig,
    });

    expect(result.evaluationStatus).toBe("COMPLIANT");
    expect(result.calculation.remainingPenaltyFraction).toBe(0);
    expect(result.metrics["metricBasis"]).toBe("ADJUSTED_SITE_EUI_AVERAGE");
  });

  it("fails the trajectory pathway when the 2028 final target is missed", () => {
    const result = evaluateTrajectoryPathway({
      eligible: true,
      cycle: "CYCLE_2",
      building: cycle2Building,
      baselineAdjustedSiteEui: 100,
      baselineWeatherNormalizedSiteEui: 98,
      historicalMetrics: partialHistory,
      ruleConfig: cycle2RuleConfig,
      factorConfig: cycle2FactorConfig,
    });

    expect(result.evaluationStatus).toBe("NON_COMPLIANT");
    expect(result.calculation.remainingPenaltyFraction).toBeCloseTo(1, 5);
  });

  it("evaluates cycle 2 using trajectory-specific governed factors", async () => {
    const result = await evaluateBepsData({
      building: cycle2Building,
      cycle: "CYCLE_2",
      snapshot: null,
      historicalMetrics: successfulHistory,
      canonicalInputs: {
        metricInput: {
          id: "metric-cycle-2",
          filingYear: 2028,
          complianceCycle: "CYCLE_2",
          baselineYearStart: 2024,
          baselineYearEnd: 2025,
          evaluationYearStart: 2028,
          evaluationYearEnd: 2028,
          comparisonYear: 2028,
          delayedCycle1OptionApplied: false,
          baselineAdjustedSiteEui: 100,
          evaluationAdjustedSiteEui: 84,
          baselineWeatherNormalizedSiteEui: 98,
          evaluationWeatherNormalizedSiteEui: 83,
          baselineWeatherNormalizedSourceEui: 170,
          evaluationWeatherNormalizedSourceEui: 150,
          baselineEnergyStarScore: 65,
          evaluationEnergyStarScore: 76,
          baselineSnapshotId: null,
          evaluationSnapshotId: null,
          sourceArtifactId: null,
          notesJson: {},
        },
        prescriptiveItems: [],
        prescriptiveSummary: {
          pointsEarned: null,
          pointsNeeded: null,
          requirementsMet: null,
          requiredItemCount: 0,
          satisfiedRequiredItemCount: 0,
          itemsCount: 0,
        },
        alternativeComplianceAgreement: null,
      },
      ruleConfig: cycle2RuleConfig,
      factorConfig: cycle2FactorConfig,
    });

    expect(result.selectedPathway).toBe("TRAJECTORY");
    expect(result.pathwayResults.trajectory?.evaluationStatus).toBe("COMPLIANT");
    expect(result.governedConfig.alternativeCompliance.penaltyPerSquareFoot).toBe(12);
    expect(result.governedConfig.trajectory.finalTargetYear).toBe(2028);
    expect(result.governedConfig.applicability.minGrossSquareFeetPrivate).toBe(25000);
    expect(result.governedConfig.applicability.cycleStartYear).toBe(2028);
  });

  it("uses the requested cycle config even when the building record still stores cycle 1", async () => {
    const result = await evaluateBepsData({
      building: {
        ...cycle2Building,
        complianceCycle: "CYCLE_1",
      },
      cycle: "CYCLE_2",
      snapshot: null,
      historicalMetrics: successfulHistory,
      canonicalInputs: {
        metricInput: {
          id: "metric-cycle-2-mismatch",
          filingYear: 2028,
          complianceCycle: "CYCLE_2",
          baselineYearStart: 2024,
          baselineYearEnd: 2025,
          evaluationYearStart: 2028,
          evaluationYearEnd: 2028,
          comparisonYear: 2028,
          delayedCycle1OptionApplied: false,
          baselineAdjustedSiteEui: 100,
          evaluationAdjustedSiteEui: 84,
          baselineWeatherNormalizedSiteEui: 98,
          evaluationWeatherNormalizedSiteEui: 83,
          baselineWeatherNormalizedSourceEui: 170,
          evaluationWeatherNormalizedSourceEui: 150,
          baselineEnergyStarScore: 65,
          evaluationEnergyStarScore: 76,
          baselineSnapshotId: null,
          evaluationSnapshotId: null,
          sourceArtifactId: null,
          notesJson: {},
        },
        prescriptiveItems: [],
        prescriptiveSummary: {
          pointsEarned: null,
          pointsNeeded: null,
          requirementsMet: null,
          requiredItemCount: 0,
          satisfiedRequiredItemCount: 0,
          itemsCount: 0,
        },
        alternativeComplianceAgreement: null,
      },
      ruleConfig: cycle2RuleConfig,
      factorConfig: cycle2FactorConfig,
    });

    expect(result.selectedPathway).toBe("TRAJECTORY");
    expect(result.pathwayResults.trajectory?.evaluationStatus).toBe("COMPLIANT");
    expect(result.governedConfig.trajectory.finalTargetYear).toBe(2028);
  });

  it("applies cycle 2 to private buildings starting at 25k square feet", async () => {
    const result = await evaluateBepsData({
      building: {
        ...cycle2Building,
        id: "building-cycle-2-25k",
        grossSquareFeet: 30000,
      },
      cycle: "CYCLE_2",
      snapshot: null,
      historicalMetrics: successfulHistory,
      canonicalInputs: {
        metricInput: {
          id: "metric-cycle-2-25k",
          filingYear: 2028,
          complianceCycle: "CYCLE_2",
          baselineYearStart: 2024,
          baselineYearEnd: 2025,
          evaluationYearStart: 2028,
          evaluationYearEnd: 2028,
          comparisonYear: 2028,
          delayedCycle1OptionApplied: false,
          baselineAdjustedSiteEui: 100,
          evaluationAdjustedSiteEui: 84,
          baselineWeatherNormalizedSiteEui: 98,
          evaluationWeatherNormalizedSiteEui: 83,
          baselineWeatherNormalizedSourceEui: 170,
          evaluationWeatherNormalizedSourceEui: 150,
          baselineEnergyStarScore: 65,
          evaluationEnergyStarScore: 76,
          baselineSnapshotId: null,
          evaluationSnapshotId: null,
          sourceArtifactId: null,
          notesJson: {},
        },
        prescriptiveItems: [],
        prescriptiveSummary: {
          pointsEarned: null,
          pointsNeeded: null,
          requirementsMet: null,
          requiredItemCount: 0,
          satisfiedRequiredItemCount: 0,
          itemsCount: 0,
        },
        alternativeComplianceAgreement: null,
      },
      ruleConfig: cycle2RuleConfig,
      factorConfig: cycle2FactorConfig,
    });

    expect(result.applicability.applicable).toBe(true);
    expect(result.governedConfig.applicability.minGrossSquareFeetPrivate).toBe(25000);
  });
});
