import { describe, expect, it } from "vitest";
import { calculateAlternativeComplianceAmount } from "@/server/compliance/beps/alternative-compliance";
import { evaluateBepsApplicability } from "@/server/compliance/beps/applicability";
import {
  BEPS_FACTOR_SET_KEYS,
  getBepsFactorSetKeyForCycle,
} from "@/server/compliance/beps/config";
import { evaluateBepsData } from "@/server/compliance/beps/beps-evaluator";
import { calculateMaximumAlternativeComplianceAmount } from "@/server/compliance/beps/formulas";
import { evaluatePerformancePathway } from "@/server/compliance/beps/performance-pathway";
import { evaluatePrescriptivePathway } from "@/server/compliance/beps/prescriptive-pathway";
import { BEPS_REASON_CODES } from "@/server/compliance/beps/reason-codes";
import { evaluateStandardTargetPathway } from "@/server/compliance/beps/standard-target-pathway";
import type {
  BepsBuildingInput,
  BepsFactorConfig,
  BepsRuleConfig,
  BepsSnapshotInput,
} from "@/server/compliance/beps/types";

const building: BepsBuildingInput = {
  id: "building-1",
  organizationId: "org-1",
  grossSquareFeet: 120000,
  propertyType: "OFFICE",
  ownershipType: "PRIVATE",
  yearBuilt: 1990,
  bepsTargetScore: 71,
  complianceCycle: "CYCLE_1",
  selectedPathway: null,
  baselineYear: 2021,
  targetEui: 82,
  maxPenaltyExposure: 1200000,
  isEnergyStarScoreEligible: true,
};

const ruleConfig: BepsRuleConfig = {
  cycle: "CYCLE_1",
  filingYear: 2026,
  pathwayRouting: {
    prescriptiveAlwaysEligible: true,
    supportedPathways: ["PERFORMANCE", "STANDARD_TARGET", "PRESCRIPTIVE"],
  },
};

const canonicalInputs = {
  metricInput: {
    id: "metric-1",
    filingYear: 2026,
    complianceCycle: "CYCLE_1" as const,
    baselineYearStart: 2018,
    baselineYearEnd: 2019,
    evaluationYearStart: 2026,
    evaluationYearEnd: 2026,
    comparisonYear: 2026,
    delayedCycle1OptionApplied: false,
    baselineAdjustedSiteEui: 100,
    evaluationAdjustedSiteEui: 90,
    baselineWeatherNormalizedSiteEui: 100,
    evaluationWeatherNormalizedSiteEui: 90,
    baselineWeatherNormalizedSourceEui: 80,
    evaluationWeatherNormalizedSourceEui: 70,
    baselineEnergyStarScore: 61,
    evaluationEnergyStarScore: 65,
    baselineSnapshotId: null,
    evaluationSnapshotId: null,
    sourceArtifactId: null,
    notesJson: {},
  },
  prescriptiveItems: [
    {
      id: "prescriptive-1",
      itemKey: "lighting",
      name: "Lighting",
      milestoneName: null,
      isRequired: true,
      pointsPossible: 10,
      pointsEarned: 10,
      status: "APPROVED" as const,
      completedAt: null,
      approvedAt: "2026-01-01T00:00:00.000Z",
      dueAt: null,
      sourceArtifactId: null,
      metadata: {},
    },
    {
      id: "prescriptive-2",
      itemKey: "controls",
      name: "Controls",
      milestoneName: null,
      isRequired: true,
      pointsPossible: 15,
      pointsEarned: 15,
      status: "APPROVED" as const,
      completedAt: null,
      approvedAt: "2026-01-01T00:00:00.000Z",
      dueAt: null,
      sourceArtifactId: null,
      metadata: {},
    },
  ],
  prescriptiveSummary: {
    pointsEarned: 25,
    pointsNeeded: 25,
    requirementsMet: true,
    requiredItemCount: 2,
    satisfiedRequiredItemCount: 2,
    itemsCount: 2,
  },
  alternativeComplianceAgreement: {
    id: "agreement-1",
    agreementIdentifier: "ACP-1",
    pathway: "PERFORMANCE" as const,
    multiplier: 0.65,
    status: "ACTIVE",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: null,
    sourceArtifactId: null,
    agreementPayload: {},
  },
};

const factorConfig: BepsFactorConfig = {
  cycle: {
    filingYear: 2026,
    cycleStartYear: 2021,
    cycleEndYear: 2026,
    baselineYears: [2018, 2019],
    evaluationYears: [2026],
    baselineBenchmarkYear: 2019,
    complianceDeadline: "2026-12-31",
    delayedCycle1Option: {
      baselineYears: [2018, 2019],
      evaluationYears: [2026],
      comparisonYear: 2026,
      optionYear: 2021,
    },
  },
  applicability: {
    minGrossSquareFeetPrivate: 50000,
    minGrossSquareFeetDistrict: 10000,
    ownershipClassFallback: "PRIVATE",
    coveredPropertyTypes: ["OFFICE", "MULTIFAMILY", "MIXED_USE", "OTHER"],
    recentConstructionExemptionYears: 5,
    cycleStartYear: 2021,
    cycleEndYear: 2026,
    filingYear: 2026,
  },
  pathwayRouting: {
    performanceScoreThreshold: 55,
    prescriptiveAlwaysEligible: true,
    supportedPathways: ["PERFORMANCE", "STANDARD_TARGET", "PRESCRIPTIVE"],
  },
  performance: {
    requiredReductionFraction: 0.2,
    scoreEligibleMetric: "ADJUSTED_SITE_EUI_AVERAGE",
    nonScoreEligibleMetric: "WEATHER_NORMALIZED_SITE_EUI_AVERAGE",
    defaultBaselineYears: [2018, 2019],
    defaultEvaluationYears: [2026],
    delayedCycle1Option: {
      baselineYears: [2018, 2019],
      evaluationYears: [2026],
      comparisonYear: 2026,
      optionYear: 2021,
    },
  },
  standardTarget: {
    defaultMaxGap: 15,
    maxGapByPropertyType: {
      OFFICE: 15,
    },
    exactTargetScoresByPropertyType: {
      OFFICE: 71,
    },
    scoreEligibleMetric: "ENERGY_STAR_SCORE",
    nonScoreEligibleMetric: "WEATHER_NORMALIZED_SOURCE_EUI",
  },
  prescriptive: {
    defaultPointsNeeded: 25,
    complianceBasis: "APPROVED_MEASURES_AND_MILESTONES",
  },
  alternativeCompliance: {
    penaltyPerSquareFoot: 10,
    maxPenaltyCap: 7500000,
    agreementRequired: true,
    allowedAgreementPathways: ["PERFORMANCE", "STANDARD_TARGET", "PRESCRIPTIVE"],
  },
};

describe("BEPS engine exact formulas", () => {
  it("marks a building as not applicable when it is under the size threshold", () => {
    const result = evaluateBepsApplicability({
      building: {
        ...building,
        grossSquareFeet: 30000,
      },
      cycle: "CYCLE_1",
      ruleConfig,
      factorConfig,
    });

    expect(result.applicable).toBe(false);
    expect(result.reasonCodes).toContain(BEPS_REASON_CODES.bepsNotApplicable);
    expect(result.reasonCodes).toContain(
      BEPS_REASON_CODES.notApplicableUnderSizeThreshold,
    );
  });

  it("reproduces the Cycle 1 performance example with 50% remaining penalty", () => {
    const result = evaluatePerformancePathway({
      eligible: true,
      building,
      isEnergyStarScoreEligible: true,
      baselineAdjustedSiteEui: 100,
      currentAdjustedSiteEui: 90,
      baselineWeatherNormalizedSiteEui: null,
      currentWeatherNormalizedSiteEui: null,
      ruleConfig,
      factorConfig,
    });

    expect(result.evaluationStatus).toBe("NON_COMPLIANT");
    expect(result.metrics["comparisonPeriods"]).toEqual({
      baselineYears: [2018, 2019],
      evaluationYears: [2026],
      comparisonYear: 2026,
      optionYear: null,
    });
    expect(result.calculation.remainingPenaltyFraction).toBeCloseTo(0.5, 5);
    expect(result.calculation.adjustedAmount).toBe(600000);
    expect(result.metrics["metricBasis"]).toBe("ADJUSTED_SITE_EUI_AVERAGE");
  });

  it("reproduces the Cycle 1 prescriptive example with 40% remaining penalty", () => {
    const result = evaluatePrescriptivePathway({
      eligible: true,
      building,
      pointsEarned: 15,
      pointsNeeded: 25,
      requirementsMet: false,
      ruleConfig,
      factorConfig,
    });

    expect(result.evaluationStatus).toBe("NON_COMPLIANT");
    expect(result.calculation.remainingPenaltyFraction).toBeCloseTo(0.4, 5);
    expect(result.calculation.adjustedAmount).toBe(480000);
    expect(result.reasonCodes).toContain(
      BEPS_REASON_CODES.prescriptiveRequirementsNotMet,
    );
  });

  it("reproduces the Cycle 1 standard target example with 40% remaining penalty", () => {
    const result = evaluateStandardTargetPathway({
      eligible: true,
      building,
      isEnergyStarScoreEligible: true,
      baselineScore: 61,
      currentScore: 65,
      baselineWeatherNormalizedSourceEui: null,
      currentWeatherNormalizedSourceEui: null,
      ruleConfig,
      factorConfig,
    });

    expect(result.evaluationStatus).toBe("NON_COMPLIANT");
    expect(result.calculation.intermediateValues["initialGap"]).toBe(10);
    expect(result.calculation.intermediateValues["achievedSavings"]).toBe(4);
    expect(result.calculation.intermediateValues["requiredSavings"]).toBe(10);
    expect(result.calculation.remainingPenaltyFraction).toBeCloseTo(0.4, 5);
    expect(result.calculation.adjustedAmount).toBe(480000);
  });

  it("caps P_max at 7,500,000", () => {
    const result = calculateMaximumAlternativeComplianceAmount({
      grossSquareFeet: 900000,
      penaltyPerSquareFoot: 10,
      maxPenaltyCap: 7500000,
    });

    expect(result.rawAmount).toBe(9000000);
    expect(result.maxAmount).toBe(7500000);
    expect(result.capApplied).toBe(true);
  });

  it("forces maximum penalty when an explicit override reason is present", async () => {
    const snapshot: BepsSnapshotInput = {
      id: "snapshot-override",
      snapshotDate: new Date("2026-01-01T00:00:00.000Z"),
      energyStarScore: 60,
      siteEui: 90,
      sourceEui: 180,
      weatherNormalizedSiteEui: 90,
      weatherNormalizedSourceEui: 170,
      complianceStatus: "AT_RISK",
      complianceGap: -11,
      estimatedPenalty: 800000,
      dataQualityScore: 90,
      activePathway: "STANDARD",
      targetEui: null,
      penaltyInputsJson: {
        baselineScore: 55,
        baselineAdjustedSiteEui: 100,
        prescriptivePointsEarned: 20,
        prescriptiveRequirementsMet: true,
      },
    };

    const result = await evaluateBepsData({
      building,
      cycle: "CYCLE_1",
      snapshot,
      ruleConfig,
      factorConfig,
      overrides: {
        maxPenaltyOverrideReason: "INCOMPLETE_OR_INACCURATE_REPORTING",
      },
    });

    expect(result.overallStatus).toBe("NON_COMPLIANT");
    expect(result.reasonCodes).toContain(BEPS_REASON_CODES.maxPenaltyOverrideApplied);
    expect(result.alternativeCompliance.recommended?.amountDue).toBe(1200000);
  });

  it("calculates alternative compliance amount from the exact governed formula output", () => {
    const pathwayResult = evaluatePrescriptivePathway({
      eligible: true,
      building,
      pointsEarned: 15,
      pointsNeeded: 25,
      requirementsMet: false,
      ruleConfig,
      factorConfig,
    });
    const result = calculateAlternativeComplianceAmount({
      grossSquareFeet: building.grossSquareFeet,
      cycle: "CYCLE_1",
      pathwayResult,
      factorConfig,
    });

    expect(result?.maxAmount).toBe(1200000);
    expect(result?.remainingPenaltyFraction).toBeCloseTo(0.4, 5);
    expect(result?.amountDue).toBe(480000);
  });

  it("returns structured failure when exact BEPS inputs are missing", async () => {
    const snapshot: BepsSnapshotInput = {
      id: "snapshot-missing",
      snapshotDate: new Date("2026-01-01T00:00:00.000Z"),
      energyStarScore: 60,
      siteEui: 90,
      sourceEui: 180,
      weatherNormalizedSiteEui: 90,
      weatherNormalizedSourceEui: 170,
      complianceStatus: "AT_RISK",
      complianceGap: -11,
      estimatedPenalty: 800000,
      dataQualityScore: 90,
      activePathway: "STANDARD",
      targetEui: null,
      penaltyInputsJson: {},
    };

    const result = await evaluateBepsData({
      building,
      cycle: "CYCLE_1",
      snapshot,
      ruleConfig,
      factorConfig,
    });

    expect(result.overallStatus).toBe("PENDING_DATA");
    expect(result.reasonCodes).toContain(BEPS_REASON_CODES.missingBaselineInput);
    expect(result.reasonCodes).toContain(BEPS_REASON_CODES.missingEvaluationInput);
  });

  it("exposes governed factor-set keys for configured cycles", () => {
    expect(BEPS_FACTOR_SET_KEYS.CYCLE_1).toBe("DC_BEPS_CYCLE_1_FACTORS_V1");
    expect(BEPS_FACTOR_SET_KEYS.CYCLE_2).toBe("DC_BEPS_CYCLE_2_FACTORS_V1");
    expect(getBepsFactorSetKeyForCycle("CYCLE_2")).toBe("DC_BEPS_CYCLE_2_FACTORS_V1");
  });

  it("uses district ownership to apply the lower applicability threshold", () => {
    const result = evaluateBepsApplicability({
      building: {
        ...building,
        ownershipType: "DISTRICT",
        grossSquareFeet: 18000,
      },
      cycle: "CYCLE_1",
      ruleConfig,
      factorConfig,
    });

    expect(result.applicable).toBe(true);
    expect(result.reasonCodes).not.toContain(
      BEPS_REASON_CODES.notApplicableUnderSizeThreshold,
    );
  });

  it("prefers canonical metrics over transient overrides", async () => {
    const result = await evaluateBepsData({
      building,
      cycle: "CYCLE_1",
      snapshot: null,
      canonicalInputs,
      ruleConfig,
      factorConfig,
      overrides: {
        baselineAdjustedSiteEui: 140,
        currentAdjustedSiteEui: 130,
      },
    });

    expect(result.inputSummary.baselineAdjustedSiteEui).toBe(100);
    expect(result.inputSummary.currentAdjustedSiteEui).toBe(90);
    expect(result.inputSummary.sources.baselineAdjustedSiteEui).toBe(
      "CANONICAL_METRIC_INPUT",
    );
    expect(result.inputSummary.canonicalRefs.metricInputId).toBe("metric-1");
  });

  it("uses persisted score eligibility to select non-score pathway metrics", async () => {
    const result = await evaluateBepsData({
      building: {
        ...building,
        isEnergyStarScoreEligible: false,
        targetEui: 68,
      },
      cycle: "CYCLE_1",
      snapshot: null,
      canonicalInputs: {
        ...canonicalInputs,
        metricInput: {
          ...canonicalInputs.metricInput,
          baselineEnergyStarScore: null,
          evaluationEnergyStarScore: null,
          baselineWeatherNormalizedSourceEui: 80,
          evaluationWeatherNormalizedSourceEui: 65,
        },
      },
      ruleConfig,
      factorConfig: {
        ...factorConfig,
        standardTarget: {
          ...factorConfig.standardTarget,
          maxGapByPropertyTypeNoScore: {
            OFFICE: 15,
          },
        },
      },
    });

    expect(result.inputSummary.isEnergyStarScoreEligible).toBe(false);
    expect(result.pathwayResults.standardTarget?.metricBasis).toBe(
      "WEATHER_NORMALIZED_SOURCE_EUI",
    );
    expect(result.pathwayResults.standardTarget?.evaluationStatus).toBe("COMPLIANT");
  });

  it("evaluates prescriptive progress from persisted records", async () => {
    const result = await evaluateBepsData({
      building,
      cycle: "CYCLE_1",
      snapshot: null,
      canonicalInputs,
      ruleConfig,
      factorConfig,
    });

    expect(result.inputSummary.prescriptivePointsEarned).toBe(25);
    expect(result.inputSummary.prescriptiveRequirementsMet).toBe(true);
    expect(result.pathwayResults.prescriptive?.evaluationStatus).toBe("COMPLIANT");
  });

  it("loads agreement multipliers from canonical ACP records", async () => {
    const result = await evaluateBepsData({
      building,
      cycle: "CYCLE_1",
      snapshot: null,
      canonicalInputs,
      ruleConfig,
      factorConfig,
      overrides: {
        requestAlternativeComplianceAgreement: true,
        alternativeComplianceAgreementMultiplier: 0.2,
        alternativeComplianceAgreementPathway: "PERFORMANCE",
      },
    });

    expect(result.inputSummary.alternativeComplianceAgreementMultiplier).toBe(0.65);
    expect(result.inputSummary.sources.alternativeComplianceAgreementMultiplier).toBe(
      "CANONICAL_AGREEMENT",
    );
  });

  it("falls back to explicit overrides when canonical inputs are incomplete", async () => {
    const result = await evaluateBepsData({
      building,
      cycle: "CYCLE_1",
      snapshot: null,
      canonicalInputs: {
        ...canonicalInputs,
        metricInput: null,
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
      ruleConfig,
      factorConfig,
      overrides: {
        baselineAdjustedSiteEui: 100,
        currentAdjustedSiteEui: 90,
        prescriptivePointsEarned: 12,
        prescriptiveRequirementsMet: false,
      },
    });

    expect(result.inputSummary.baselineAdjustedSiteEui).toBe(100);
    expect(result.inputSummary.sources.baselineAdjustedSiteEui).toBe("OVERRIDE");
    expect(result.inputSummary.prescriptivePointsEarned).toBe(12);
  });
});
