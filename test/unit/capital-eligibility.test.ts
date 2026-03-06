import { describe, it, expect } from "vitest";
import { screenCLEER } from "@/server/pipelines/capital-structuring/eligibility/cleer";
import { screenCPACE } from "@/server/pipelines/capital-structuring/eligibility/cpace";
import { screenAHRA } from "@/server/pipelines/capital-structuring/eligibility/ahra";
import { assembleCapitalStack } from "@/server/pipelines/capital-structuring/logic";
import type { BuildingCapitalProfile } from "@/server/pipelines/capital-structuring/eligibility/types";

function makeProfile(
  overrides: Partial<BuildingCapitalProfile> = {},
): BuildingCapitalProfile {
  return {
    grossSquareFeet: 150_000,
    propertyType: "OFFICE",
    ward: 2,
    yearBuilt: 1985,
    ownerType: "PRIVATE",
    isAffordableHousing: false,
    annualRevenue: null,
    totalProjectCost: 200_000,
    occupancyPct: 90,
    hasExistingCpaceLien: false,
    debtServiceCoverageRatio: 1.3,
    propertyAssessedValue: 10_000_000,
    unitCount: null,
    hasAuthorizedContractor: true,
    propertyTaxesCurrent: true,
    mortgageLenderConsent: true,
    existingMortgageBalance: 3_000_000,
    estimatedAnnualEnergySavings: 50_000,
    projectedSavingsPercent: 25,
    isBepsCompliant: false,
    affordableUnitsPercent: null,
    ...overrides,
  };
}

// ── CLEER ─────────────────────────────────────────────────────────────────

describe("CLEER Eligibility", () => {
  it("qualifies standard commercial building", () => {
    const result = screenCLEER(makeProfile());
    expect(result.eligible).toBe(true);
    expect(result.programCode).toBe("CLEER");
    expect(result.fundingType).toBe("LOAN");
    expect(result.maxFundingAmount).toBe(200_000);
    expect(result.interestRate).toBe(3.0);
  });

  it("disqualifies government-owned buildings", () => {
    const result = screenCLEER(makeProfile({ ownerType: "GOVERNMENT" }));
    expect(result.eligible).toBe(false);
    expect(result.disqualifiers.some((d) => d.includes("Government"))).toBe(true);
  });

  it("disqualifies projects under $10,000", () => {
    const result = screenCLEER(makeProfile({ totalProjectCost: 5_000 }));
    expect(result.eligible).toBe(false);
    expect(result.disqualifiers.some((d) => d.includes("$10,000"))).toBe(true);
  });

  it("disqualifies projects over $250,000", () => {
    const result = screenCLEER(makeProfile({ totalProjectCost: 300_000 }));
    expect(result.eligible).toBe(false);
    expect(result.disqualifiers.some((d) => d.includes("$250,000"))).toBe(true);
  });

  it("caps loan at $250K", () => {
    const result = screenCLEER(makeProfile({ totalProjectCost: 250_000 }));
    expect(result.eligible).toBe(true);
    expect(result.maxFundingAmount).toBe(250_000);
  });

  it("disqualifies multifamily with fewer than 5 units", () => {
    const result = screenCLEER(
      makeProfile({ propertyType: "MULTIFAMILY", unitCount: 3 }),
    );
    expect(result.eligible).toBe(false);
    expect(result.disqualifiers.some((d) => d.includes("5+"))).toBe(true);
  });

  it("qualifies multifamily with 5+ units", () => {
    const result = screenCLEER(
      makeProfile({ propertyType: "MULTIFAMILY", unitCount: 10 }),
    );
    expect(result.eligible).toBe(true);
  });

  it("notes when authorized contractor not confirmed", () => {
    const result = screenCLEER(makeProfile({ hasAuthorizedContractor: false }));
    expect(result.eligible).toBe(true);
    expect(result.reasons.some((r) => r.includes("not yet confirmed"))).toBe(true);
  });

  it("disqualifies ineligible property types", () => {
    const result = screenCLEER(makeProfile({ propertyType: "SINGLE_FAMILY" }));
    expect(result.eligible).toBe(false);
  });
});

// ── C-PACE ────────────────────────────────────────────────────────────────

describe("C-PACE Eligibility", () => {
  it("qualifies standard commercial building", () => {
    const result = screenCPACE(makeProfile());
    expect(result.eligible).toBe(true);
    expect(result.programCode).toBe("CPACE");
    expect(result.fundingType).toBe("CPACE");
  });

  it("disqualifies building with existing C-PACE lien", () => {
    const result = screenCPACE(makeProfile({ hasExistingCpaceLien: true }));
    expect(result.eligible).toBe(false);
    expect(result.disqualifiers.some((d) => d.includes("existing C-PACE"))).toBe(true);
  });

  it("disqualifies when combined LTV exceeds 90%", () => {
    const result = screenCPACE(
      makeProfile({
        totalProjectCost: 5_000_000,
        existingMortgageBalance: 5_000_000,
        propertyAssessedValue: 10_000_000,
      }),
    );
    expect(result.eligible).toBe(false);
    expect(result.disqualifiers.some((d) => d.includes("90%"))).toBe(true);
  });

  it("disqualifies when property taxes not current", () => {
    const result = screenCPACE(makeProfile({ propertyTaxesCurrent: false }));
    expect(result.eligible).toBe(false);
    expect(result.disqualifiers.some((d) => d.includes("taxes"))).toBe(true);
  });

  it("disqualifies when SIR <= 1.0", () => {
    const result = screenCPACE(
      makeProfile({
        totalProjectCost: 200_000,
        estimatedAnnualEnergySavings: 5_000, // 5K / (200K/25) = 0.625
      }),
    );
    expect(result.eligible).toBe(false);
    expect(result.disqualifiers.some((d) => d.includes("SIR"))).toBe(true);
  });

  it("disqualifies low DSCR", () => {
    const result = screenCPACE(makeProfile({ debtServiceCoverageRatio: 1.0 }));
    expect(result.eligible).toBe(false);
    expect(result.disqualifiers.some((d) => d.includes("DSCR"))).toBe(true);
  });

  it("disqualifies when mortgage lender consent denied", () => {
    const result = screenCPACE(makeProfile({ mortgageLenderConsent: false }));
    expect(result.eligible).toBe(false);
    expect(result.disqualifiers.some((d) => d.includes("lender consent"))).toBe(true);
  });

  it("flags unknown mortgage lender consent as note", () => {
    const result = screenCPACE(makeProfile({ mortgageLenderConsent: null }));
    expect(result.eligible).toBe(true);
    expect(result.reasons.some((r) => r.includes("status unknown"))).toBe(true);
  });

  it("funds up to full project cost", () => {
    const result = screenCPACE(makeProfile({ totalProjectCost: 500_000 }));
    expect(result.eligible).toBe(true);
    expect(result.maxFundingAmount).toBe(500_000);
  });
});

// ── AHRA ──────────────────────────────────────────────────────────────────

describe("AHRA Eligibility", () => {
  const affordableProfile = {
    propertyType: "MULTIFAMILY" as const,
    isAffordableHousing: true,
    unitCount: 20,
    affordableUnitsPercent: 60,
    isBepsCompliant: false,
    projectedSavingsPercent: 25,
    grossSquareFeet: 80_000,
  };

  it("qualifies affordable multifamily", () => {
    const result = screenAHRA(makeProfile(affordableProfile));
    expect(result.eligible).toBe(true);
    expect(result.programCode).toBe("AHRA");
    expect(result.fundingType).toBe("GRANT");
    expect(result.maxFundingAmount).toBe(20 * 15_000); // 20 units × $15K
  });

  it("awards $30K/unit for ≥35% savings", () => {
    const result = screenAHRA(
      makeProfile({ ...affordableProfile, projectedSavingsPercent: 40 }),
    );
    expect(result.eligible).toBe(true);
    expect(result.maxFundingAmount).toBe(20 * 30_000); // 20 units × $30K
  });

  it("disqualifies non-affordable housing", () => {
    const result = screenAHRA(
      makeProfile({
        ...affordableProfile,
        affordableUnitsPercent: 30,
      }),
    );
    expect(result.eligible).toBe(false);
    expect(result.disqualifiers.some((d) => d.includes("50%"))).toBe(true);
  });

  it("disqualifies office buildings", () => {
    const result = screenAHRA(
      makeProfile({
        ...affordableProfile,
        propertyType: "OFFICE",
      }),
    );
    expect(result.eligible).toBe(false);
  });

  it("disqualifies buildings with fewer than 5 units", () => {
    const result = screenAHRA(
      makeProfile({
        ...affordableProfile,
        unitCount: 3,
      }),
    );
    expect(result.eligible).toBe(false);
    expect(result.disqualifiers.some((d) => d.includes("5+"))).toBe(true);
  });

  it("disqualifies BEPS-compliant buildings", () => {
    const result = screenAHRA(
      makeProfile({
        ...affordableProfile,
        isBepsCompliant: true,
      }),
    );
    expect(result.eligible).toBe(false);
    expect(result.disqualifiers.some((d) => d.includes("compliant"))).toBe(true);
  });

  it("disqualifies when projected savings < 20%", () => {
    const result = screenAHRA(
      makeProfile({
        ...affordableProfile,
        projectedSavingsPercent: 15,
      }),
    );
    expect(result.eligible).toBe(false);
    expect(result.disqualifiers.some((d) => d.includes("20%"))).toBe(true);
  });

  it("includes priority tier in reasons", () => {
    const result = screenAHRA(
      makeProfile({ ...affordableProfile, grossSquareFeet: 80_000 }),
    );
    expect(result.eligible).toBe(true);
    expect(result.reasons.some((r) => r.includes("HIGH"))).toBe(true);
  });

  it("assigns standard tier for 10-50K SF", () => {
    const result = screenAHRA(
      makeProfile({ ...affordableProfile, grossSquareFeet: 30_000 }),
    );
    expect(result.eligible).toBe(true);
    expect(result.reasons.some((r) => r.includes("STANDARD"))).toBe(true);
  });
});

// ── Capital Stack Assembly ────────────────────────────────────────────────

describe("Capital Stack Assembly", () => {
  it("assembles stack with grants first, then debt, then equity", () => {
    const affordableProfile = makeProfile({
      propertyType: "MULTIFAMILY",
      isAffordableHousing: true,
      totalProjectCost: 200_000,
      unitCount: 20,
      affordableUnitsPercent: 60,
      isBepsCompliant: false,
      projectedSavingsPercent: 25,
      grossSquareFeet: 80_000,
    });

    const eligibility = [
      screenAHRA(affordableProfile),
      screenCLEER(affordableProfile),
      screenCPACE(affordableProfile),
    ];

    const stack = assembleCapitalStack(200_000, eligibility, 50_000);

    expect(stack.totalProjectCost).toBe(200_000);
    expect(stack.layers.length).toBeGreaterThan(0);
    // First layer should be AHRA grant (grants come first)
    expect(stack.layers[0].fundingType).toBe("GRANT");
    expect(stack.totalFunded).toBeGreaterThan(0);
    expect(stack.totalFunded + stack.equityRequired).toBe(200_000);
  });

  it("fills gap with equity when programs don't cover full cost", () => {
    const profile = makeProfile({ totalProjectCost: 200_000 });
    // CLEER only, maxes at $200K
    const eligibility = [screenCLEER(profile)];

    const stack = assembleCapitalStack(10_000_000, eligibility, 500_000);

    expect(stack.equityRequired).toBeGreaterThan(0);
    const equityLayer = stack.layers.find((l) => l.fundingType === "EQUITY");
    expect(equityLayer).toBeDefined();
  });

  it("calculates simple payback", () => {
    const stack = assembleCapitalStack(500_000, [], 100_000);
    expect(stack.simplePaybackYears).toBe(5);
  });

  it("handles zero project cost", () => {
    const stack = assembleCapitalStack(0, [], 0);
    expect(stack.layers).toHaveLength(0);
    expect(stack.totalProjectCost).toBe(0);
  });

  it("handles no eligible programs — full equity", () => {
    const stack = assembleCapitalStack(500_000, [], 50_000);
    expect(stack.layers).toHaveLength(1);
    expect(stack.layers[0].fundingType).toBe("EQUITY");
    expect(stack.layers[0].amount).toBe(500_000);
    expect(stack.equityRequired).toBe(500_000);
  });
});
