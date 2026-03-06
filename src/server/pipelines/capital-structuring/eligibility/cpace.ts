/**
 * C-PACE (Commercial Property Assessed Clean Energy) Eligibility Screener
 *
 * Property tax assessment-secured financing via DC Green Bank.
 * Rules from BEPSGuard Doc4: SIR > 1.0, combined LTV ≤ 90%,
 * DSCR ≥ 1.15, mortgage lender consent required, property tax current.
 *
 * Deterministic boolean checks — no LLM.
 */

import type { BuildingCapitalProfile, EligibilityResult } from "./types";

const CPACE_MAX_COMBINED_LTV = 0.90;
const CPACE_MIN_DSCR = 1.15;
const CPACE_MIN_SIR = 1.0;
const CPACE_INTEREST_RATE = 7.0; // Fixed rate, spread over 10yr UST
const CPACE_TERM_YEARS = 25; // Up to 30yr via PACE Equity; 25yr default

const CPACE_ELIGIBLE_TYPES = new Set([
  "OFFICE",
  "RETAIL",
  "HOTEL",
  "INDUSTRIAL",
  "WAREHOUSE",
  "MULTIFAMILY",
  "MIXED_USE",
  "NONPROFIT",
  "SENIOR_HOUSING",
  "STORAGE",
]);

/**
 * Screen a building for C-PACE eligibility.
 *
 * Per Doc4:
 * - Property owner only (not tenants)
 * - SIR > 1.0 (energy savings must exceed assessment cost)
 * - DSCR ≥ 1.15 (capital provider underwriting standard)
 * - Combined LTV ≤ 90% (existing mortgage + PACE / assessed value)
 * - Mortgage lender consent required
 * - Property taxes must be current
 * - No existing C-PACE lien
 */
export function screenCPACE(
  profile: BuildingCapitalProfile,
): EligibilityResult {
  const reasons: string[] = [];
  const disqualifiers: string[] = [];

  if (!CPACE_ELIGIBLE_TYPES.has(profile.propertyType)) {
    disqualifiers.push(
      `Property type ${profile.propertyType} not eligible for C-PACE`,
    );
  } else {
    reasons.push(`Property type ${profile.propertyType} is eligible`);
  }

  if (profile.ownerType === "GOVERNMENT") {
    disqualifiers.push("Government-owned properties not eligible for C-PACE");
  }

  if (profile.hasExistingCpaceLien) {
    disqualifiers.push("Property already has an existing C-PACE lien");
  }

  if (!profile.propertyTaxesCurrent) {
    disqualifiers.push("Property taxes must be current for C-PACE eligibility");
  } else {
    reasons.push("Property taxes are current");
  }

  // SIR check: annual energy savings / annual assessment
  if (
    profile.estimatedAnnualEnergySavings !== null &&
    profile.totalProjectCost > 0
  ) {
    const annualAssessment = profile.totalProjectCost / CPACE_TERM_YEARS;
    const sir = profile.estimatedAnnualEnergySavings / annualAssessment;
    if (sir <= CPACE_MIN_SIR) {
      disqualifiers.push(
        `SIR ${sir.toFixed(2)} does not exceed ${CPACE_MIN_SIR} (savings must exceed assessment cost)`,
      );
    } else {
      reasons.push(`SIR ${sir.toFixed(2)} exceeds minimum ${CPACE_MIN_SIR}`);
    }
  }

  // DSCR check
  if (
    profile.debtServiceCoverageRatio !== null &&
    profile.debtServiceCoverageRatio < CPACE_MIN_DSCR
  ) {
    disqualifiers.push(
      `DSCR ${profile.debtServiceCoverageRatio} below capital provider minimum ${CPACE_MIN_DSCR}`,
    );
  } else if (profile.debtServiceCoverageRatio !== null) {
    reasons.push(
      `DSCR ${profile.debtServiceCoverageRatio} meets minimum ${CPACE_MIN_DSCR}`,
    );
  }

  // Combined LTV check
  if (
    profile.propertyAssessedValue !== null &&
    profile.propertyAssessedValue > 0
  ) {
    const existingMortgage = profile.existingMortgageBalance ?? 0;
    const combinedLtv =
      (existingMortgage + profile.totalProjectCost) /
      profile.propertyAssessedValue;
    if (combinedLtv > CPACE_MAX_COMBINED_LTV) {
      disqualifiers.push(
        `Combined LTV ${(combinedLtv * 100).toFixed(0)}% exceeds ${(CPACE_MAX_COMBINED_LTV * 100).toFixed(0)}% limit`,
      );
    } else {
      reasons.push(
        `Combined LTV ${(combinedLtv * 100).toFixed(0)}% within ${(CPACE_MAX_COMBINED_LTV * 100).toFixed(0)}% limit`,
      );
    }
  }

  // Mortgage lender consent flag
  if (profile.mortgageLenderConsent === false) {
    disqualifiers.push(
      "Mortgage lender consent not obtained (required for C-PACE senior lien)",
    );
  } else if (profile.mortgageLenderConsent === true) {
    reasons.push("Mortgage lender consent obtained");
  } else {
    reasons.push(
      "Note: Mortgage lender consent required (status unknown — confirm before application)",
    );
  }

  const eligible = disqualifiers.length === 0 && reasons.length > 0;
  const maxFunding = eligible ? profile.totalProjectCost : null;

  return {
    programName: "C-PACE (DC)",
    programCode: "CPACE",
    eligible,
    reasons,
    disqualifiers,
    maxFundingAmount: maxFunding,
    fundingType: "CPACE",
    interestRate: CPACE_INTEREST_RATE,
    termYears: CPACE_TERM_YEARS,
  };
}
