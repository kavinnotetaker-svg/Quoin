import { registerSuite, approxEqual } from "../runner";
import {
  BUILDING_A,
  BUILDING_B,
  BUILDING_C,
  referencePenaltyCalc,
  referenceAHRAScreener,
  verifyGoldenDatasets,
} from "../../fixtures/golden/golden-datasets";
import {
  calculateMaxPenalty,
  calculatePerformancePenalty,
  calculateStandardTargetPenalty,
  calculatePrescriptivePenalty,
} from "@/server/pipelines/pathway-analysis/penalty-calculator";

registerSuite({
  name: "penalty",
  cases: [
    // ── Golden dataset self-verification ────────────────────────────────
    {
      id: "golden-verify",
      name: "Golden datasets self-verification passes",
      suite: "penalty",
      run: async () => {
        const result = verifyGoldenDatasets();
        return {
          passed: result.valid,
          expected: "no errors",
          actual: result.valid ? "no errors" : result.errors.join("; "),
        };
      },
    },

    // ── Building A: Office, 150K SF ─────────────────────────────────────
    {
      id: "penalty-a-max",
      name: `Building A: Max penalty = $${BUILDING_A.maxPenalty.toLocaleString()}`,
      suite: "penalty",
      run: async () => {
        const maxPenalty = calculateMaxPenalty(BUILDING_A.grossSquareFeet);
        return {
          passed: maxPenalty === BUILDING_A.maxPenalty,
          expected: BUILDING_A.maxPenalty,
          actual: maxPenalty,
        };
      },
    },
    {
      id: "penalty-a-performance",
      name: `Building A: Performance penalty = $${BUILDING_A.penalties.performance.toLocaleString()}`,
      suite: "penalty",
      run: async () => {
        const result = calculatePerformancePenalty({
          grossSquareFeet: BUILDING_A.grossSquareFeet,
          propertyType: BUILDING_A.propertyType,
          bepsTargetScore: BUILDING_A.targetScore,
          baselineAdjustedSiteEui: BUILDING_A.baselineEui,
          currentAdjustedSiteEui: BUILDING_A.currentEui,
          targetReductionPct: 20,
        });
        const ref = referencePenaltyCalc({
          maxPenalty: BUILDING_A.maxPenalty,
          pathway: "performance",
          currentScore: BUILDING_A.currentScore,
          targetScore: BUILDING_A.targetScore,
          baselineScore: BUILDING_A.baselineScore,
          euiReductionPct: BUILDING_A.euiReductionPct,
          prescriptivePointsEarned: BUILDING_A.prescriptivePointsEarned,
        });
        return {
          passed:
            approxEqual(result.adjustedPenalty, BUILDING_A.penalties.performance) &&
            approxEqual(ref, BUILDING_A.penalties.performance),
          expected: BUILDING_A.penalties.performance,
          actual: result.adjustedPenalty,
          details: `real=${result.adjustedPenalty}, ref=${ref}`,
        };
      },
    },
    {
      id: "penalty-a-standard",
      name: `Building A: Standard penalty = $${BUILDING_A.penalties.standard.toLocaleString()}`,
      suite: "penalty",
      run: async () => {
        const result = calculateStandardTargetPenalty({
          grossSquareFeet: BUILDING_A.grossSquareFeet,
          propertyType: BUILDING_A.propertyType,
          bepsTargetScore: BUILDING_A.targetScore,
          baselineScore: BUILDING_A.baselineScore,
          currentScore: BUILDING_A.currentScore,
        });
        return {
          passed: approxEqual(result.adjustedPenalty, BUILDING_A.penalties.standard),
          expected: BUILDING_A.penalties.standard,
          actual: result.adjustedPenalty,
        };
      },
    },
    {
      id: "penalty-a-prescriptive",
      name: `Building A: Prescriptive penalty = $${BUILDING_A.penalties.prescriptive.toLocaleString()}`,
      suite: "penalty",
      run: async () => {
        const result = calculatePrescriptivePenalty({
          grossSquareFeet: BUILDING_A.grossSquareFeet,
          propertyType: BUILDING_A.propertyType,
          bepsTargetScore: BUILDING_A.targetScore,
          pointsEarned: BUILDING_A.prescriptivePointsEarned,
          pointsNeeded: 25,
        });
        return {
          passed: approxEqual(result.adjustedPenalty, BUILDING_A.penalties.prescriptive),
          expected: BUILDING_A.penalties.prescriptive,
          actual: result.adjustedPenalty,
        };
      },
    },

    // ── Building B: Multifamily, 80K SF ─────────────────────────────────
    {
      id: "penalty-b-max",
      name: `Building B: Max penalty = $${BUILDING_B.maxPenalty.toLocaleString()}`,
      suite: "penalty",
      run: async () => {
        const maxPenalty = calculateMaxPenalty(BUILDING_B.grossSquareFeet);
        return {
          passed: maxPenalty === BUILDING_B.maxPenalty,
          expected: BUILDING_B.maxPenalty,
          actual: maxPenalty,
        };
      },
    },
    {
      id: "penalty-b-standard",
      name: `Building B: Standard penalty = $${BUILDING_B.penalties.standard.toLocaleString()}`,
      suite: "penalty",
      run: async () => {
        const result = calculateStandardTargetPenalty({
          grossSquareFeet: BUILDING_B.grossSquareFeet,
          propertyType: BUILDING_B.propertyType,
          bepsTargetScore: BUILDING_B.targetScore,
          baselineScore: BUILDING_B.baselineScore,
          currentScore: BUILDING_B.currentScore,
        });
        return {
          passed: approxEqual(result.adjustedPenalty, BUILDING_B.penalties.standard),
          expected: BUILDING_B.penalties.standard,
          actual: result.adjustedPenalty,
        };
      },
    },
    {
      id: "penalty-b-performance",
      name: `Building B: Performance penalty = $${BUILDING_B.penalties.performance.toLocaleString()}`,
      suite: "penalty",
      run: async () => {
        const result = calculatePerformancePenalty({
          grossSquareFeet: BUILDING_B.grossSquareFeet,
          propertyType: BUILDING_B.propertyType,
          bepsTargetScore: BUILDING_B.targetScore,
          baselineAdjustedSiteEui: BUILDING_B.baselineEui,
          currentAdjustedSiteEui: BUILDING_B.currentEui,
          targetReductionPct: 20,
        });
        return {
          passed: approxEqual(result.adjustedPenalty, BUILDING_B.penalties.performance, 0.005),
          expected: BUILDING_B.penalties.performance,
          actual: result.adjustedPenalty,
        };
      },
    },

    // ── Building C: Compliant ───────────────────────────────────────────
    {
      id: "penalty-c-compliant",
      name: "Building C: Compliant via Standard Target — penalty = $0",
      suite: "penalty",
      run: async () => {
        // Building C is compliant: score 68 >= target 61
        // Standard Target pathway correctly identifies compliance
        const std = calculateStandardTargetPenalty({
          grossSquareFeet: BUILDING_C.grossSquareFeet,
          propertyType: BUILDING_C.propertyType,
          bepsTargetScore: BUILDING_C.targetScore,
          baselineScore: BUILDING_C.baselineScore,
          currentScore: BUILDING_C.currentScore,
        });
        return {
          passed: std.compliant && std.adjustedPenalty === 0,
          expected: 0,
          actual: std.adjustedPenalty,
        };
      },
    },

    // ── Penalty cap ─────────────────────────────────────────────────────
    {
      id: "penalty-cap",
      name: "Penalty cap: 800K SF building capped at $7,500,000",
      suite: "penalty",
      run: async () => {
        const maxPenalty = calculateMaxPenalty(800_000);
        return {
          passed: maxPenalty === 7_500_000,
          expected: 7_500_000,
          actual: maxPenalty,
        };
      },
    },

    // ── AHRA Eligibility ────────────────────────────────────────────────
    {
      id: "ahra-eligible",
      name: "Building B: AHRA eligible (multifamily, 55% affordable, 120 units)",
      suite: "penalty",
      run: async () => {
        const result = referenceAHRAScreener(BUILDING_B);
        return {
          passed: result === true,
          expected: true,
          actual: result,
        };
      },
    },
    {
      id: "ahra-ineligible",
      name: "Building A: AHRA ineligible (office, not multifamily)",
      suite: "penalty",
      run: async () => {
        const result = referenceAHRAScreener(BUILDING_A);
        return {
          passed: result === false,
          expected: false,
          actual: result,
        };
      },
    },
  ],
});
