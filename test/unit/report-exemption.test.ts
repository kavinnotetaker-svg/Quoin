import { describe, it, expect } from "vitest";
import {
  screenForExemptions,
  type ExemptionInput,
  type FinancialDistressIndicators,
} from "@/server/pipelines/pathway-analysis/exemption-screener";

/**
 * Tests for exemption screening logic used by the report router's
 * exemption filing template. Tests the deterministic screening
 * that drives the filing checklist and document requirements.
 */

function makeDistressIndicators(
  overrides: Partial<FinancialDistressIndicators> = {},
): FinancialDistressIndicators {
  return {
    inForeclosure: false,
    inBankruptcy: false,
    negativeNetOperatingIncome: false,
    taxDelinquent: false,
    ...overrides,
  };
}

function makeExemptionInput(
  overrides: Partial<ExemptionInput> = {},
): ExemptionInput {
  return {
    baselineOccupancyPct: 80,
    financialDistressIndicators: makeDistressIndicators(),
    grossSquareFeet: 50_000,
    propertyType: "OFFICE",
    yearBuilt: 2005,
    ...overrides,
  };
}

describe("Exemption Screening for DOEE Filing", () => {
  // ── Low Occupancy Exemption ──────────────────────────────────

  it("flags low occupancy when baseline < 50%", () => {
    const result = screenForExemptions(
      makeExemptionInput({ baselineOccupancyPct: 35 }),
    );
    expect(result.eligible).toBe(true);
    expect(result.qualifiedExemptions).toContain("LOW_OCCUPANCY");
    expect(result.details[0]).toContain("35%");
    expect(result.details[0]).toContain("50%");
  });

  it("does not flag occupancy at exactly 50%", () => {
    const result = screenForExemptions(
      makeExemptionInput({ baselineOccupancyPct: 50 }),
    );
    expect(result.qualifiedExemptions).not.toContain("LOW_OCCUPANCY");
  });

  it("reports missing data when occupancy is null", () => {
    const result = screenForExemptions(
      makeExemptionInput({ baselineOccupancyPct: null }),
    );
    expect(result.missingData).toContain("Baseline occupancy data not available");
  });

  it("flags occupancy at 0%", () => {
    const result = screenForExemptions(
      makeExemptionInput({ baselineOccupancyPct: 0 }),
    );
    expect(result.eligible).toBe(true);
    expect(result.qualifiedExemptions).toContain("LOW_OCCUPANCY");
  });

  // ── Financial Distress Exemption ─────────────────────────────

  it("flags foreclosure as financial distress", () => {
    const result = screenForExemptions(
      makeExemptionInput({
        financialDistressIndicators: makeDistressIndicators({ inForeclosure: true }),
      }),
    );
    expect(result.eligible).toBe(true);
    expect(result.qualifiedExemptions).toContain("FINANCIAL_DISTRESS");
    expect(result.details.some((d) => d.includes("foreclosure"))).toBe(true);
  });

  it("flags bankruptcy as financial distress", () => {
    const result = screenForExemptions(
      makeExemptionInput({
        financialDistressIndicators: makeDistressIndicators({ inBankruptcy: true }),
      }),
    );
    expect(result.qualifiedExemptions).toContain("FINANCIAL_DISTRESS");
  });

  it("flags negative NOI as financial distress", () => {
    const result = screenForExemptions(
      makeExemptionInput({
        financialDistressIndicators: makeDistressIndicators({ negativeNetOperatingIncome: true }),
      }),
    );
    expect(result.qualifiedExemptions).toContain("FINANCIAL_DISTRESS");
  });

  it("flags tax delinquency as financial distress", () => {
    const result = screenForExemptions(
      makeExemptionInput({
        financialDistressIndicators: makeDistressIndicators({ taxDelinquent: true }),
      }),
    );
    expect(result.qualifiedExemptions).toContain("FINANCIAL_DISTRESS");
  });

  it("lists all applicable distress markers", () => {
    const result = screenForExemptions(
      makeExemptionInput({
        financialDistressIndicators: {
          inForeclosure: true,
          inBankruptcy: true,
          negativeNetOperatingIncome: false,
          taxDelinquent: true,
        },
      }),
    );
    const detail = result.details.find((d) => d.includes("distress markers"));
    expect(detail).toContain("foreclosure");
    expect(detail).toContain("bankruptcy");
    expect(detail).toContain("tax delinquent");
    expect(detail).not.toContain("negative NOI");
  });

  it("does not flag financial distress when no indicators set", () => {
    const result = screenForExemptions(makeExemptionInput());
    expect(result.qualifiedExemptions).not.toContain("FINANCIAL_DISTRESS");
  });

  // ── Recent Construction Exemption ────────────────────────────

  it("flags recent construction for yearBuilt >= 2016", () => {
    const result = screenForExemptions(
      makeExemptionInput({ yearBuilt: 2018 }),
    );
    expect(result.eligible).toBe(true);
    expect(result.qualifiedExemptions).toContain("RECENT_CONSTRUCTION");
    expect(result.details.some((d) => d.includes("2018"))).toBe(true);
  });

  it("flags yearBuilt exactly 2016", () => {
    const result = screenForExemptions(
      makeExemptionInput({ yearBuilt: 2016 }),
    );
    expect(result.qualifiedExemptions).toContain("RECENT_CONSTRUCTION");
  });

  it("does not flag yearBuilt 2015", () => {
    const result = screenForExemptions(
      makeExemptionInput({ yearBuilt: 2015 }),
    );
    expect(result.qualifiedExemptions).not.toContain("RECENT_CONSTRUCTION");
  });

  it("reports missing data when yearBuilt is null", () => {
    const result = screenForExemptions(
      makeExemptionInput({ yearBuilt: null }),
    );
    expect(result.missingData).toContain("Year built not available");
  });

  // ── Multiple Exemptions ──────────────────────────────────────

  it("can qualify for multiple exemptions simultaneously", () => {
    const result = screenForExemptions(
      makeExemptionInput({
        baselineOccupancyPct: 30,
        financialDistressIndicators: makeDistressIndicators({ inForeclosure: true }),
        yearBuilt: 2020,
      }),
    );
    expect(result.eligible).toBe(true);
    expect(result.qualifiedExemptions).toHaveLength(3);
    expect(result.qualifiedExemptions).toContain("LOW_OCCUPANCY");
    expect(result.qualifiedExemptions).toContain("FINANCIAL_DISTRESS");
    expect(result.qualifiedExemptions).toContain("RECENT_CONSTRUCTION");
  });

  it("returns not eligible when no exemptions qualify", () => {
    const result = screenForExemptions(makeExemptionInput());
    expect(result.eligible).toBe(false);
    expect(result.qualifiedExemptions).toHaveLength(0);
  });
});
