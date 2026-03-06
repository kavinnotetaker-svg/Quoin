/**
 * Shared types for capital program eligibility screeners.
 */

export interface BuildingCapitalProfile {
  grossSquareFeet: number;
  propertyType: string;
  ward: number | null;
  yearBuilt: number | null;
  ownerType: "PRIVATE" | "NONPROFIT" | "GOVERNMENT" | "UNKNOWN";
  isAffordableHousing: boolean;
  annualRevenue: number | null;
  totalProjectCost: number;
  occupancyPct: number | null;
  hasExistingCpaceLien: boolean;
  debtServiceCoverageRatio: number | null;
  propertyAssessedValue: number | null;
  unitCount: number | null;
  hasAuthorizedContractor: boolean;
  propertyTaxesCurrent: boolean;
  mortgageLenderConsent: boolean | null;
  existingMortgageBalance: number | null;
  estimatedAnnualEnergySavings: number | null;
  projectedSavingsPercent: number | null;
  isBepsCompliant: boolean;
  affordableUnitsPercent: number | null;
}

export interface EligibilityResult {
  programName: string;
  programCode: string;
  eligible: boolean;
  reasons: string[];
  disqualifiers: string[];
  maxFundingAmount: number | null;
  fundingType: "GRANT" | "LOAN" | "TAX_CREDIT" | "CPACE";
  interestRate: number | null;
  termYears: number | null;
}
