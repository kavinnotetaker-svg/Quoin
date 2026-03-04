import { describe, it, expect } from "vitest";
import {
  calculateMaxPenalty,
  calculatePerformancePenalty,
  calculateStandardTargetPenalty,
  calculatePrescriptivePenalty,
  calculateAllPathways,
} from "@/server/pipelines/pathway-analysis/penalty-calculator";
import {
  BUILDING_A,
  BUILDING_B,
  BUILDING_C,
} from "../fixtures/golden/golden-datasets";

// ── Max Penalty ─────────────────────────────────────────────────────────────

describe("calculateMaxPenalty", () => {
  it("150,000 SF → $1,500,000", () => {
    expect(calculateMaxPenalty(150_000)).toBe(1_500_000);
  });

  it("80,000 SF → $800,000", () => {
    expect(calculateMaxPenalty(80_000)).toBe(800_000);
  });

  it("200,000 SF → $2,000,000", () => {
    expect(calculateMaxPenalty(200_000)).toBe(2_000_000);
  });

  it("800,000 SF → $7,500,000 (cap)", () => {
    expect(calculateMaxPenalty(800_000)).toBe(7_500_000);
  });

  it("1,000,000 SF → $7,500,000 (cap)", () => {
    expect(calculateMaxPenalty(1_000_000)).toBe(7_500_000);
  });

  it("0 SF → $0", () => {
    expect(calculateMaxPenalty(0)).toBe(0);
  });

  it("negative SF → $0", () => {
    expect(calculateMaxPenalty(-50_000)).toBe(0);
  });
});

// ── Performance Pathway ─────────────────────────────────────────────────────

describe("calculatePerformancePenalty", () => {
  const base = {
    grossSquareFeet: 150_000,
    propertyType: "OFFICE",
    bepsTargetScore: 71,
    targetReductionPct: 20,
  };

  it("20% reduction achieved → $0 (compliant)", () => {
    const result = calculatePerformancePenalty({
      ...base,
      baselineSiteEui: 100,
      currentSiteEui: 80, // 20% reduction
    });
    expect(result.adjustedPenalty).toBe(0);
    expect(result.compliant).toBe(true);
  });

  it("25% reduction → $0 (exceeds target)", () => {
    const result = calculatePerformancePenalty({
      ...base,
      baselineSiteEui: 100,
      currentSiteEui: 75, // 25% reduction
    });
    expect(result.adjustedPenalty).toBe(0);
    expect(result.compliant).toBe(true);
  });

  it("10% of 20% target → 50% penalty reduction", () => {
    const result = calculatePerformancePenalty({
      ...base,
      baselineSiteEui: 120,
      currentSiteEui: 108, // 10% reduction
    });
    expect(result.adjustedPenalty).toBe(750_000);
    expect(result.reductionPct).toBeCloseTo(50, 0);
  });

  it("0% reduction → full penalty", () => {
    const result = calculatePerformancePenalty({
      ...base,
      baselineSiteEui: 100,
      currentSiteEui: 100, // 0% reduction
    });
    expect(result.adjustedPenalty).toBe(1_500_000);
    expect(result.reductionPct).toBe(0);
  });

  it("negative reduction (EUI increased) → full penalty", () => {
    const result = calculatePerformancePenalty({
      ...base,
      baselineSiteEui: 100,
      currentSiteEui: 110, // EUI went up
    });
    expect(result.adjustedPenalty).toBe(1_500_000);
    expect(result.reductionPct).toBe(0);
  });

  it("5% reduction → 25% penalty reduction", () => {
    const result = calculatePerformancePenalty({
      ...base,
      baselineSiteEui: 100,
      currentSiteEui: 95, // 5% reduction → 5/20 = 25%
    });
    expect(result.adjustedPenalty).toBe(1_125_000);
    expect(result.reductionPct).toBeCloseTo(25, 0);
  });

  it("zero baseline EUI → full penalty with no-data message", () => {
    const result = calculatePerformancePenalty({
      ...base,
      baselineSiteEui: 0,
      currentSiteEui: 80,
    });
    expect(result.adjustedPenalty).toBe(1_500_000);
    expect(result.compliant).toBe(false);
  });
});

// ── Standard Target Pathway (two-step) ──────────────────────────────────────

describe("calculateStandardTargetPenalty", () => {
  const base = {
    grossSquareFeet: 80_000,
    propertyType: "MULTIFAMILY",
    bepsTargetScore: 66,
  };

  it("score meets target → $0 (compliant)", () => {
    const result = calculateStandardTargetPenalty({
      ...base,
      baselineScore: 58,
      currentScore: 66,
    });
    expect(result.adjustedPenalty).toBe(0);
    expect(result.compliant).toBe(true);
  });

  it("score exceeds target → $0", () => {
    const result = calculateStandardTargetPenalty({
      ...base,
      baselineScore: 58,
      currentScore: 70,
    });
    expect(result.adjustedPenalty).toBe(0);
    expect(result.compliant).toBe(true);
  });

  it("Guidebook example: gap=10, maxGap=15, gained 4/10 → 40% of max", () => {
    // Two-step: initialAdj = 1 - 10/15 = 0.333, gapClosure = 4/10 = 0.4
    // totalReduction = 1 - 0.667*0.6 = 0.6 → penalty = 40% of max
    const result = calculateStandardTargetPenalty({
      grossSquareFeet: 100_000,
      propertyType: "OFFICE",
      bepsTargetScore: 75, // target
      baselineScore: 65, // gap = 10
      currentScore: 69, // gained 4
      maxGapForPropertyType: 15,
    });
    expect(result.adjustedPenalty).toBe(400_000); // 40% of $1M
    expect(result.reductionPct).toBeCloseTo(60, 0);
  });

  it("baseline gap = 0 (at target at baseline) → full initial adjustment", () => {
    const result = calculateStandardTargetPenalty({
      ...base,
      baselineScore: 66, // already at target
      currentScore: 64, // dropped below
    });
    // baselineGap=0, initialAdj=1, gapClosure=0 (can't gain from 0 gap)
    // totalReduction = 1 - (1-1)*(1-0) = 1 → penalty = 0
    // But wait: currentScore < target → not compliant...
    // When baselineGap <= 0, we set initialAdj=1, gapClosure=0 if gap<=0
    // totalReduction = 1 - 0*1 = 1 → adjustedPenalty = round(800000 * 0) = 0
    expect(result.adjustedPenalty).toBe(0);
  });

  it("no points gained → only initial adjustment applies", () => {
    // baselineGap = 8, maxGap = 15
    // initialAdj = 1 - 8/15 = 0.4667
    // gained 0, gapClosure = 0
    // totalReduction = 1 - (1-0.4667)*(1-0) = 0.4667
    // penalty = round(800,000 * 0.5333) = 426,667
    const result = calculateStandardTargetPenalty({
      ...base,
      baselineScore: 58,
      currentScore: 58, // no improvement
    });
    expect(result.adjustedPenalty).toBe(426_667);
  });

  it("all gap closed → $0", () => {
    const result = calculateStandardTargetPenalty({
      ...base,
      baselineScore: 58,
      currentScore: 66, // closed all 8 points
    });
    expect(result.adjustedPenalty).toBe(0);
    expect(result.compliant).toBe(true);
  });

  it("large gap exceeds maxGap → initialAdj=0, falls back to simple gapClosure", () => {
    // Building A: baselineGap=29, maxGap=15 → initialAdj=0
    // Just gap closure: 3/29 = 0.10345
    // penalty = round(1,500,000 * 0.89655) = 1,344,828
    const result = calculateStandardTargetPenalty({
      grossSquareFeet: 150_000,
      propertyType: "OFFICE",
      bepsTargetScore: 71,
      baselineScore: 42,
      currentScore: 45,
    });
    expect(result.adjustedPenalty).toBe(1_344_828);
  });
});

// ── Prescriptive Pathway ────────────────────────────────────────────────────

describe("calculatePrescriptivePenalty", () => {
  const base = {
    grossSquareFeet: 150_000,
    propertyType: "OFFICE",
    bepsTargetScore: 71,
  };

  it("25/25 points → $0 (compliant)", () => {
    const result = calculatePrescriptivePenalty({
      ...base,
      pointsEarned: 25,
      pointsNeeded: 25,
    });
    expect(result.adjustedPenalty).toBe(0);
    expect(result.compliant).toBe(true);
  });

  it("15/25 points → 60% reduction", () => {
    const result = calculatePrescriptivePenalty({
      ...base,
      pointsEarned: 15,
      pointsNeeded: 25,
    });
    expect(result.adjustedPenalty).toBe(600_000);
    expect(result.reductionPct).toBeCloseTo(60, 0);
  });

  it("0 points → full penalty", () => {
    const result = calculatePrescriptivePenalty({
      ...base,
      pointsEarned: 0,
      pointsNeeded: 25,
    });
    expect(result.adjustedPenalty).toBe(1_500_000);
    expect(result.reductionPct).toBe(0);
  });

  it("10/25 points → 40% reduction", () => {
    const result = calculatePrescriptivePenalty({
      ...base,
      pointsEarned: 10,
      pointsNeeded: 25,
    });
    expect(result.adjustedPenalty).toBe(900_000);
    expect(result.reductionPct).toBeCloseTo(40, 0);
  });

  it("0 points needed → compliant", () => {
    const result = calculatePrescriptivePenalty({
      ...base,
      pointsEarned: 0,
      pointsNeeded: 0,
    });
    expect(result.adjustedPenalty).toBe(0);
    expect(result.compliant).toBe(true);
  });
});

// ── All Pathways Comparison ─────────────────────────────────────────────────

describe("calculateAllPathways", () => {
  it("calculates all three and recommends lowest", () => {
    const result = calculateAllPathways({
      grossSquareFeet: 150_000,
      propertyType: "OFFICE",
      bepsTargetScore: 71,
      baselineSiteEui: 120,
      currentSiteEui: 108,
      baselineScore: 42,
      currentScore: 45,
      prescriptivePointsEarned: 10,
      prescriptivePointsNeeded: 25,
    });

    expect(result.performance).not.toBeNull();
    expect(result.standardTarget).not.toBeNull();
    expect(result.prescriptive).not.toBeNull();
    expect(result.recommended).not.toBeNull();
    // Performance: 750K, Standard: 1,344,828, Prescriptive: 900K → Performance best
    expect(result.recommendedPathway).toBe("PERFORMANCE");
    expect(result.recommended!.adjustedPenalty).toBe(750_000);
  });

  it("Building C: compliant on all pathways → $0", () => {
    const result = calculateAllPathways({
      grossSquareFeet: BUILDING_C.grossSquareFeet,
      propertyType: BUILDING_C.propertyType,
      bepsTargetScore: BUILDING_C.targetScore,
      baselineSiteEui: BUILDING_C.baselineEui,
      currentSiteEui: BUILDING_C.currentEui,
      baselineScore: BUILDING_C.baselineScore,
      currentScore: BUILDING_C.currentScore,
      prescriptivePointsEarned: BUILDING_C.prescriptivePointsEarned,
      prescriptivePointsNeeded: 25,
    });

    expect(result.recommended!.adjustedPenalty).toBe(0);
    expect(result.recommended!.compliant).toBe(true);
  });

  it("returns null for pathways with missing data", () => {
    const result = calculateAllPathways({
      grossSquareFeet: 100_000,
      propertyType: "OFFICE",
      bepsTargetScore: 71,
      // No baseline EUI → no performance
      // No baseline score → no standard
      // No prescriptive data → no prescriptive
    });

    expect(result.performance).toBeNull();
    expect(result.standardTarget).toBeNull();
    expect(result.prescriptive).toBeNull();
    expect(result.recommended).toBeNull();
    expect(result.recommendedPathway).toBeNull();
  });
});

// ── Golden Dataset Validation ───────────────────────────────────────────────

describe("Golden dataset validation", () => {
  it("Building A: Performance penalty matches golden dataset", () => {
    const result = calculatePerformancePenalty({
      grossSquareFeet: BUILDING_A.grossSquareFeet,
      propertyType: BUILDING_A.propertyType,
      bepsTargetScore: BUILDING_A.targetScore,
      baselineSiteEui: BUILDING_A.baselineEui,
      currentSiteEui: BUILDING_A.currentEui,
      targetReductionPct: 20,
    });
    expect(result.adjustedPenalty).toBe(BUILDING_A.penalties.performance);
  });

  it("Building A: Standard Target penalty matches golden dataset", () => {
    const result = calculateStandardTargetPenalty({
      grossSquareFeet: BUILDING_A.grossSquareFeet,
      propertyType: BUILDING_A.propertyType,
      bepsTargetScore: BUILDING_A.targetScore,
      baselineScore: BUILDING_A.baselineScore,
      currentScore: BUILDING_A.currentScore,
    });
    expect(result.adjustedPenalty).toBe(BUILDING_A.penalties.standard);
  });

  it("Building A: Prescriptive penalty matches golden dataset", () => {
    const result = calculatePrescriptivePenalty({
      grossSquareFeet: BUILDING_A.grossSquareFeet,
      propertyType: BUILDING_A.propertyType,
      bepsTargetScore: BUILDING_A.targetScore,
      pointsEarned: BUILDING_A.prescriptivePointsEarned,
      pointsNeeded: 25,
    });
    expect(result.adjustedPenalty).toBe(BUILDING_A.penalties.prescriptive);
  });

  it("Building B: Standard Target penalty matches golden dataset", () => {
    const result = calculateStandardTargetPenalty({
      grossSquareFeet: BUILDING_B.grossSquareFeet,
      propertyType: BUILDING_B.propertyType,
      bepsTargetScore: BUILDING_B.targetScore,
      baselineScore: BUILDING_B.baselineScore,
      currentScore: BUILDING_B.currentScore,
    });
    expect(result.adjustedPenalty).toBe(BUILDING_B.penalties.standard);
  });

  it("Building B: Performance penalty matches golden dataset", () => {
    const result = calculatePerformancePenalty({
      grossSquareFeet: BUILDING_B.grossSquareFeet,
      propertyType: BUILDING_B.propertyType,
      bepsTargetScore: BUILDING_B.targetScore,
      baselineSiteEui: BUILDING_B.baselineEui,
      currentSiteEui: BUILDING_B.currentEui,
      targetReductionPct: 20,
    });
    // Allow $1 rounding tolerance
    expect(Math.abs(result.adjustedPenalty - BUILDING_B.penalties.performance)).toBeLessThanOrEqual(1);
  });

  it("Building C: Compliant via Standard Target → $0", () => {
    const std = calculateStandardTargetPenalty({
      grossSquareFeet: BUILDING_C.grossSquareFeet,
      propertyType: BUILDING_C.propertyType,
      bepsTargetScore: BUILDING_C.targetScore,
      baselineScore: BUILDING_C.baselineScore,
      currentScore: BUILDING_C.currentScore,
    });
    expect(std.adjustedPenalty).toBe(0);
    expect(std.compliant).toBe(true);
  });

  it("Building C: Performance pathway non-zero (EUI < 20%) but overall compliant", () => {
    // Building C has 13.68% EUI reduction — not enough for Performance pathway
    // But it IS compliant via Standard Target (score 68 >= target 61)
    const perf = calculatePerformancePenalty({
      grossSquareFeet: BUILDING_C.grossSquareFeet,
      propertyType: BUILDING_C.propertyType,
      bepsTargetScore: BUILDING_C.targetScore,
      baselineSiteEui: BUILDING_C.baselineEui,
      currentSiteEui: BUILDING_C.currentEui,
      targetReductionPct: 20,
    });
    // Performance pathway independently calculates based on EUI, not score
    expect(perf.adjustedPenalty).toBeGreaterThan(0);
    expect(perf.compliant).toBe(false);
  });
});

// ── Edge Cases ──────────────────────────────────────────────────────────────

describe("Edge cases", () => {
  it("zero GSF → $0 penalty across all pathways", () => {
    const result = calculateAllPathways({
      grossSquareFeet: 0,
      propertyType: "OFFICE",
      bepsTargetScore: 71,
      baselineSiteEui: 100,
      currentSiteEui: 90,
      baselineScore: 50,
      currentScore: 55,
    });
    expect(result.performance!.adjustedPenalty).toBe(0);
    expect(result.standardTarget!.adjustedPenalty).toBe(0);
  });

  it("exactly at 20% EUI reduction → compliant (boundary)", () => {
    const result = calculatePerformancePenalty({
      grossSquareFeet: 100_000,
      propertyType: "OFFICE",
      bepsTargetScore: 71,
      baselineSiteEui: 100,
      currentSiteEui: 80, // exactly 20%
      targetReductionPct: 20,
    });
    expect(result.compliant).toBe(true);
    expect(result.adjustedPenalty).toBe(0);
  });

  it("score exactly at target → compliant (boundary)", () => {
    const result = calculateStandardTargetPenalty({
      grossSquareFeet: 100_000,
      propertyType: "OFFICE",
      bepsTargetScore: 71,
      baselineScore: 65,
      currentScore: 71, // exactly at target
    });
    expect(result.compliant).toBe(true);
    expect(result.adjustedPenalty).toBe(0);
  });
});
