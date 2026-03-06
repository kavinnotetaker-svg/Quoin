/**
 * AHRA (Affordable Housing Retrofit Accelerator) Eligibility Screener
 *
 * DCSEU program providing technical assistance + IRA HER rebates for
 * affordable multifamily buildings.
 *
 * Rules from BEPSGuard Doc4:
 * - ≥5 dwelling units
 * - ≥50% of units at ≤80% AMI
 * - Must NOT be BEPS compliant (non-compliant prioritized)
 * - ≥20% projected energy savings for rebate eligibility
 * - Per-unit rebates: $15K (20-34% savings) or $30K (≥35% savings)
 * - Priority tiers: high (≥50K SF), standard (10-50K SF), future (<10K SF)
 *
 * Deterministic boolean checks — no LLM.
 */

import type { BuildingCapitalProfile, EligibilityResult } from "./types";

const AHRA_MIN_UNITS = 5;
const AHRA_MIN_AFFORDABLE_PCT = 50;
const AHRA_MIN_SAVINGS_PCT = 20;
const AHRA_REBATE_STANDARD = 15_000; // 20-34% savings tier
const AHRA_REBATE_DEEP = 30_000; // ≥35% savings tier
const AHRA_HIGH_PRIORITY_GSF = 50_000;
const AHRA_STANDARD_MIN_GSF = 10_000;

export type AHRAPriorityTier = "HIGH" | "STANDARD" | "FUTURE_ELIGIBLE";

/**
 * Screen a building for AHRA grant/rebate eligibility.
 *
 * Per Doc4:
 * - Primarily residential (multifamily or mixed-use with residential)
 * - ≥5 dwelling units
 * - ≥50% of units occupied by households ≤80% AMI
 * - Must NOT currently meet BEPS compliance
 * - ≥20% projected energy savings required for HER rebate
 * - Rebate: $15K/unit (20-34% savings), $30K/unit (≥35% savings)
 */
export function screenAHRA(
  profile: BuildingCapitalProfile,
): EligibilityResult {
  const reasons: string[] = [];
  const disqualifiers: string[] = [];

  // Property type check
  if (
    profile.propertyType !== "MULTIFAMILY" &&
    profile.propertyType !== "MIXED_USE"
  ) {
    disqualifiers.push(
      `Property type ${profile.propertyType} not eligible (must be MULTIFAMILY or MIXED_USE)`,
    );
  } else {
    reasons.push(`Property type ${profile.propertyType} is eligible`);
  }

  // Unit count check
  if (profile.unitCount === null || profile.unitCount < AHRA_MIN_UNITS) {
    disqualifiers.push(
      `Requires ${AHRA_MIN_UNITS}+ dwelling units (has ${profile.unitCount ?? "unknown"})`,
    );
  } else {
    reasons.push(`${profile.unitCount} units meets ${AHRA_MIN_UNITS}-unit minimum`);
  }

  // Affordability check
  if (
    profile.affordableUnitsPercent === null ||
    profile.affordableUnitsPercent < AHRA_MIN_AFFORDABLE_PCT
  ) {
    disqualifiers.push(
      `Requires ≥${AHRA_MIN_AFFORDABLE_PCT}% affordable units at ≤80% AMI (has ${profile.affordableUnitsPercent ?? "unknown"}%)`,
    );
  } else {
    reasons.push(
      `${profile.affordableUnitsPercent}% affordable units meets ${AHRA_MIN_AFFORDABLE_PCT}% minimum`,
    );
  }

  // BEPS compliance check — must be non-compliant
  if (profile.isBepsCompliant) {
    disqualifiers.push(
      "Building is currently BEPS compliant (AHRA targets non-compliant buildings)",
    );
  } else {
    reasons.push("Building is non-compliant with BEPS (eligible for AHRA)");
  }

  // Projected savings check
  if (
    profile.projectedSavingsPercent !== null &&
    profile.projectedSavingsPercent < AHRA_MIN_SAVINGS_PCT
  ) {
    disqualifiers.push(
      `Projected savings ${profile.projectedSavingsPercent}% below ${AHRA_MIN_SAVINGS_PCT}% minimum for HER rebate`,
    );
  }

  if (profile.ownerType === "GOVERNMENT") {
    disqualifiers.push(
      "Government-owned properties not eligible for AHRA grants",
    );
  }

  const eligible = disqualifiers.length === 0 && reasons.length > 0;

  // Calculate rebate amount
  let maxFunding: number | null = null;
  if (eligible && profile.unitCount !== null) {
    const rebatePerUnit = getRebatePerUnit(profile.projectedSavingsPercent);
    maxFunding = profile.unitCount * rebatePerUnit;
  }

  // Priority tier info
  const tier = getPriorityTier(profile.grossSquareFeet);
  if (eligible) {
    reasons.push(`Priority tier: ${tier} (${profile.grossSquareFeet.toLocaleString()} SF)`);
  }

  return {
    programName: "AHRA (Affordable Housing Retrofit Accelerator)",
    programCode: "AHRA",
    eligible,
    reasons,
    disqualifiers,
    maxFundingAmount: maxFunding,
    fundingType: "GRANT",
    interestRate: null,
    termYears: null,
  };
}

/**
 * Determine per-unit rebate based on projected energy savings tier.
 * ≥35% → $30K (deep retrofit with electrification)
 * ≥20% → $15K (standard efficiency improvements)
 * <20% or unknown → $15K default (eligibility check handled separately)
 */
function getRebatePerUnit(projectedSavingsPercent: number | null): number {
  if (projectedSavingsPercent !== null && projectedSavingsPercent >= 35) {
    return AHRA_REBATE_DEEP;
  }
  return AHRA_REBATE_STANDARD;
}

/**
 * Determine AHRA priority tier based on building size.
 */
export function getPriorityTier(grossSquareFeet: number): AHRAPriorityTier {
  if (grossSquareFeet >= AHRA_HIGH_PRIORITY_GSF) return "HIGH";
  if (grossSquareFeet >= AHRA_STANDARD_MIN_GSF) return "STANDARD";
  return "FUTURE_ELIGIBLE";
}
