import { describe, it, expect } from "vitest";
import {
  calculateMetricAwarePenalty,
  calculatePerformancePenalty,
  calculateStandardTargetPenalty,
} from "@/server/pipelines/pathway-analysis/penalty-calculator";
import {
  getSourceFactor,
  getSourceRatio,
  toSourceKbtu,
  getAllSourceFactors,
  RegulatoryDataError,
} from "@/server/pipelines/shared/source-factors";
import {
  calculateEUI,
  type EUIReading,
} from "@/server/pipelines/data-ingestion/snapshot";

// ── Source Factor Registry ────────────────────────────────────────────────────

describe("Source Factor Registry", () => {
  it("returns correct DC 2024-2026 EPA ratios", () => {
    expect(getSourceRatio("ELECTRIC")).toBe(2.70);
    expect(getSourceRatio("GAS")).toBe(1.05);
    expect(getSourceRatio("STEAM")).toBe(1.20);
    expect(getSourceRatio("OTHER")).toBe(1.00);
  });

  it("returns full factor metadata for audit", () => {
    const factor = getSourceFactor("ELECTRIC");
    expect(factor.fuelType).toBe("GRID_ELECTRICITY");
    expect(factor.ratio).toBe(2.70);
    expect(factor.effectiveFrom).toBe("2024-01-01");
    expect(factor.effectiveTo).toBe("2026-12-31");
  });

  it("lists all registered factors", () => {
    const all = getAllSourceFactors();
    expect(all).toHaveLength(4);
    const fuelTypes = all.map((f) => f.fuelType);
    expect(fuelTypes).toContain("GRID_ELECTRICITY");
    expect(fuelTypes).toContain("NATURAL_GAS");
    expect(fuelTypes).toContain("DISTRICT_STEAM");
    expect(fuelTypes).toContain("ONSITE_SOLAR");
  });
});

// ── toSourceKbtu Conversion ──────────────────────────────────────────────────

describe("toSourceKbtu", () => {
  it("converts site kBtu to source kBtu using registry factor", () => {
    const result = toSourceKbtu(100_000, "ELECTRIC");
    expect(result.sourceKbtu).toBe(270_000);
    expect(result.factorUsed).toBe(2.70);
  });

  it("converts gas with 1.05 factor", () => {
    const result = toSourceKbtu(50_000, "GAS");
    expect(result.sourceKbtu).toBe(52_500);
    expect(result.factorUsed).toBe(1.05);
  });

  it("throws RegulatoryDataError for null consumption", () => {
    expect(() => toSourceKbtu(null, "ELECTRIC")).toThrow(RegulatoryDataError);
    expect(() => toSourceKbtu(null, "ELECTRIC")).toThrow(
      /consumption value is null/,
    );
  });

  it("throws RegulatoryDataError for undefined consumption", () => {
    expect(() => toSourceKbtu(undefined, "GAS")).toThrow(RegulatoryDataError);
  });
});

// ── Mixed-Fuel Building: Electricity + Gas ──────────────────────────────────

describe("Mixed-Fuel Building — Electricity + Gas", () => {
  /**
   * Scenario: A 100,000 SF office with 12 months of mixed-fuel data.
   *
   * Monthly readings:
   *   Electric: 100,000 kBtu/month × 12 = 1,200,000 kBtu (site)
   *   Gas:       50,000 kBtu/month × 12 =   600,000 kBtu (site)
   *   Total site = 1,800,000 kBtu
   *
   * Source conversion (DC 2024-2026 EPA):
   *   Electric: 1,200,000 × 2.70 = 3,240,000 kBtu (source)
   *   Gas:        600,000 × 1.05 =   630,000 kBtu (source)
   *   Total source = 3,870,000 kBtu
   *
   * EUI:
   *   Site EUI   = 1,800,000 / 100,000 = 18.0 kBtu/ft²
   *   Source EUI = 3,870,000 / 100,000 = 38.7 kBtu/ft²
   */
  const GSF = 100_000;

  function makeMixedFuelReadings(): EUIReading[] {
    const readings: EUIReading[] = [];
    for (let m = 0; m < 12; m++) {
      const month = String(m + 1).padStart(2, "0");
      readings.push({
        consumptionKbtu: 100_000,
        meterType: "ELECTRIC",
        periodStart: new Date(`2025-${month}-01T00:00:00Z`),
      });
      readings.push({
        consumptionKbtu: 50_000,
        meterType: "GAS",
        periodStart: new Date(`2025-${month}-01T00:00:00Z`),
      });
    }
    return readings;
  }

  it("correctly sums individual fuel types into TotalSiteKbtu", () => {
    const eui = calculateEUI(makeMixedFuelReadings(), GSF);
    expect(eui.totalSiteKBtu).toBe(1_800_000);
  });

  it("correctly sums individual fuel types into TotalSourceKbtu", () => {
    const eui = calculateEUI(makeMixedFuelReadings(), GSF);
    // Electric: 1,200,000 × 2.70 = 3,240,000
    // Gas:        600,000 × 1.05 =   630,000
    // Total:                        3,870,000
    expect(eui.totalSourceKBtu).toBe(3_870_000);
  });

  it("calculates correct Site EUI from mixed fuels", () => {
    const eui = calculateEUI(makeMixedFuelReadings(), GSF);
    expect(eui.siteEui).toBeCloseTo(18.0, 2);
  });

  it("calculates correct Source EUI from mixed fuels", () => {
    const eui = calculateEUI(makeMixedFuelReadings(), GSF);
    expect(eui.sourceEui).toBeCloseTo(38.7, 2);
  });

  it("tracks per-fuel-type breakdown in kBtu", () => {
    const eui = calculateEUI(makeMixedFuelReadings(), GSF);
    expect(eui.fuelBreakdown["ELECTRIC"]).toBe(1_200_000);
    expect(eui.fuelBreakdown["GAS"]).toBe(600_000);
  });

  it("records source factors used for each fuel type (auditability)", () => {
    const eui = calculateEUI(makeMixedFuelReadings(), GSF);
    expect(eui.sourceFactorsUsed["ELECTRIC"]).toBe(2.70);
    expect(eui.sourceFactorsUsed["GAS"]).toBe(1.05);
  });

  it("covers all 12 months", () => {
    const eui = calculateEUI(makeMixedFuelReadings(), GSF);
    expect(eui.monthsCovered).toBe(12);
    expect(eui.readingCount).toBe(24);
  });
});

// ── Metric-Aware Penalty Calculator: Pathway Switch ─────────────────────────

describe("calculateMetricAwarePenalty — Pathway Switch", () => {
  const base = {
    grossSquareFeet: 150_000,
    propertyType: "OFFICE",
    bepsTargetScore: 71,
  };

  describe("StandardTarget pathway uses Source EUI / Score (source-based)", () => {
    it("routes to StandardTarget and uses score-based gap closure", () => {
      const result = calculateMetricAwarePenalty({
        ...base,
        pathway: "STANDARD_TARGET",
        currentSiteEui: 108,
        currentSourceEui: 291.6,
        baselineSiteEui: 120,
        baselineSourceEui: 324,
        currentScore: 45,
        baselineScore: 42,
      });

      // Should match direct StandardTarget call
      const direct = calculateStandardTargetPenalty({
        ...base,
        baselineScore: 42,
        currentScore: 45,
      });

      expect(result.pathway).toBe("STANDARD_TARGET");
      expect(result.adjustedPenalty).toBe(direct.adjustedPenalty);
      expect(result.reductionPct).toBe(direct.reductionPct);
    });

    it("throws RegulatoryDataError when currentScore is null", () => {
      expect(() =>
        calculateMetricAwarePenalty({
          ...base,
          pathway: "STANDARD_TARGET",
          currentSiteEui: 108,
          currentSourceEui: 291.6,
          baselineSiteEui: 120,
          baselineSourceEui: 324,
          currentScore: null,
          baselineScore: 42,
        }),
      ).toThrow(RegulatoryDataError);
    });

    it("throws RegulatoryDataError when baselineScore is null", () => {
      expect(() =>
        calculateMetricAwarePenalty({
          ...base,
          pathway: "STANDARD_TARGET",
          currentSiteEui: 108,
          currentSourceEui: 291.6,
          baselineSiteEui: 120,
          baselineSourceEui: 324,
          currentScore: 45,
          baselineScore: null,
        }),
      ).toThrow(RegulatoryDataError);
    });

    it("error message mentions ENERGY STAR score for StandardTarget", () => {
      try {
        calculateMetricAwarePenalty({
          ...base,
          pathway: "STANDARD_TARGET",
          currentSiteEui: 108,
          currentSourceEui: null,
          baselineSiteEui: 120,
          baselineSourceEui: null,
          currentScore: null,
          baselineScore: 42,
        });
      } catch (err) {
        expect(err).toBeInstanceOf(RegulatoryDataError);
        expect((err as RegulatoryDataError).message).toMatch(
          /ENERGY STAR score/,
        );
        expect((err as RegulatoryDataError).field).toBe("currentScore");
      }
    });
  });

  describe("Performance pathway uses Site EUI (site-based)", () => {
    it("routes to Performance and uses site EUI reduction", () => {
      const result = calculateMetricAwarePenalty({
        ...base,
        pathway: "PERFORMANCE",
        currentSiteEui: 108,
        currentSourceEui: 291.6,
        baselineSiteEui: 120,
        baselineSourceEui: 324,
        currentScore: 45,
        baselineScore: 42,
      });

      // Should match direct Performance call using Site EUI
      const direct = calculatePerformancePenalty({
        ...base,
        baselineAdjustedSiteEui: 120,
        currentAdjustedSiteEui: 108,
        targetReductionPct: 20,
      });

      expect(result.pathway).toBe("PERFORMANCE");
      expect(result.adjustedPenalty).toBe(direct.adjustedPenalty);
    });

    it("throws RegulatoryDataError when baselineSiteEui is null", () => {
      expect(() =>
        calculateMetricAwarePenalty({
          ...base,
          pathway: "PERFORMANCE",
          currentSiteEui: 108,
          currentSourceEui: 291.6,
          baselineSiteEui: null,
          baselineSourceEui: 324,
          currentScore: 45,
          baselineScore: 42,
        }),
      ).toThrow(RegulatoryDataError);
    });

    it("throws RegulatoryDataError when currentSiteEui is null", () => {
      expect(() =>
        calculateMetricAwarePenalty({
          ...base,
          pathway: "PERFORMANCE",
          currentSiteEui: null,
          currentSourceEui: 291.6,
          baselineSiteEui: 120,
          baselineSourceEui: 324,
          currentScore: 45,
          baselineScore: 42,
        }),
      ).toThrow(RegulatoryDataError);
    });

    it("error message mentions Site EUI for Performance", () => {
      try {
        calculateMetricAwarePenalty({
          ...base,
          pathway: "PERFORMANCE",
          currentSiteEui: null,
          currentSourceEui: 291.6,
          baselineSiteEui: 120,
          baselineSourceEui: 324,
          currentScore: 45,
          baselineScore: 42,
        });
      } catch (err) {
        expect(err).toBeInstanceOf(RegulatoryDataError);
        expect((err as RegulatoryDataError).message).toMatch(/Site EUI/);
        expect((err as RegulatoryDataError).field).toBe("currentSiteEui");
      }
    });
  });

  describe("Pathway produces different penalties for same building", () => {
    it("StandardTarget and Performance yield different penalties", () => {
      const shared = {
        ...base,
        currentSiteEui: 108,
        currentSourceEui: 291.6,
        baselineSiteEui: 120,
        baselineSourceEui: 324,
        currentScore: 45,
        baselineScore: 42,
      };

      const standard = calculateMetricAwarePenalty({
        ...shared,
        pathway: "STANDARD_TARGET",
      });
      const performance = calculateMetricAwarePenalty({
        ...shared,
        pathway: "PERFORMANCE",
      });

      // They use different metrics, so penalties differ
      expect(standard.pathway).toBe("STANDARD_TARGET");
      expect(performance.pathway).toBe("PERFORMANCE");
      expect(standard.adjustedPenalty).not.toBe(performance.adjustedPenalty);
    });
  });
});

// ── RegulatoryDataError ─────────────────────────────────────────────────────

describe("RegulatoryDataError", () => {
  it("has correct name, code, and field properties", () => {
    const err = new RegulatoryDataError("test message", "testField");
    expect(err.name).toBe("RegulatoryDataError");
    expect(err.code).toBe("REGULATORY_DATA_MISSING");
    expect(err.field).toBe("testField");
    expect(err.message).toBe("test message");
    expect(err).toBeInstanceOf(Error);
  });
});
