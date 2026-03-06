/**
 * CLEER (Commercial Loan for Energy Efficiency & Renewables) Eligibility Screener
 *
 * DC Green Bank program providing below-market unsecured loans.
 * Rules from BEPSGuard Doc4: min $10K, max $250K, 2-12yr term,
 * authorized contractor required, multifamily needs 5+ units.
 *
 * Deterministic boolean checks — no LLM.
 */

import type { BuildingCapitalProfile, EligibilityResult } from "./types";

const CLEER_MIN_PROJECT_COST = 10_000;
const CLEER_MAX_LOAN = 250_000;
const CLEER_MIN_TERM = 2;
const CLEER_MAX_TERM = 12;
const CLEER_INTEREST_RATE = 3.0; // Low-interest per Doc4 (City First partnership)
const CLEER_MIN_MULTIFAMILY_UNITS = 5;

const CLEER_ELIGIBLE_TYPES = new Set([
  "OFFICE",
  "RETAIL",
  "HOTEL",
  "INDUSTRIAL",
  "WAREHOUSE",
  "MULTIFAMILY",
  "MIXED_USE",
  "NONPROFIT",
  "COMMON_OWNERSHIP",
]);

/**
 * Screen a building for CLEER loan eligibility.
 *
 * Per Doc4:
 * - Commercial, multifamily (5+ units), industrial, nonprofit, common ownership
 * - Project cost $10,000–$250,000
 * - Authorized contractor required (flagged, not hard gate at screening)
 * - Located in DC (assumed if in system)
 * - Tenants also eligible (borrowerType check not needed at building level)
 */
export function screenCLEER(
  profile: BuildingCapitalProfile,
): EligibilityResult {
  const reasons: string[] = [];
  const disqualifiers: string[] = [];

  if (!CLEER_ELIGIBLE_TYPES.has(profile.propertyType)) {
    disqualifiers.push(
      `Property type ${profile.propertyType} not eligible (must be commercial, multifamily 5+, industrial, nonprofit, or common ownership)`,
    );
  } else {
    reasons.push(`Property type ${profile.propertyType} is eligible`);
  }

  if (
    profile.propertyType === "MULTIFAMILY" &&
    profile.unitCount !== null &&
    profile.unitCount < CLEER_MIN_MULTIFAMILY_UNITS
  ) {
    disqualifiers.push(
      `Multifamily requires ${CLEER_MIN_MULTIFAMILY_UNITS}+ units (has ${profile.unitCount})`,
    );
  }

  if (profile.totalProjectCost < CLEER_MIN_PROJECT_COST) {
    disqualifiers.push(
      `Project cost $${profile.totalProjectCost.toLocaleString()} below minimum $${CLEER_MIN_PROJECT_COST.toLocaleString()}`,
    );
  } else {
    reasons.push(
      `Project cost $${profile.totalProjectCost.toLocaleString()} meets minimum $${CLEER_MIN_PROJECT_COST.toLocaleString()}`,
    );
  }

  if (profile.totalProjectCost > CLEER_MAX_LOAN) {
    disqualifiers.push(
      `Project cost $${profile.totalProjectCost.toLocaleString()} exceeds CLEER max $${CLEER_MAX_LOAN.toLocaleString()} (case-by-case exceptions possible)`,
    );
  }

  if (profile.ownerType === "GOVERNMENT") {
    disqualifiers.push("Government-owned properties not eligible for CLEER");
  }

  if (!profile.hasAuthorizedContractor) {
    reasons.push(
      "Note: Authorized contractor required for application (not yet confirmed)",
    );
  } else {
    reasons.push("Authorized contractor confirmed");
  }

  const eligible = disqualifiers.length === 0;
  const maxFunding = eligible
    ? Math.min(profile.totalProjectCost, CLEER_MAX_LOAN)
    : null;

  return {
    programName: "CLEER (DC Green Bank)",
    programCode: "CLEER",
    eligible,
    reasons,
    disqualifiers,
    maxFundingAmount: maxFunding,
    fundingType: "LOAN",
    interestRate: CLEER_INTEREST_RATE,
    termYears: CLEER_MAX_TERM,
  };
}
