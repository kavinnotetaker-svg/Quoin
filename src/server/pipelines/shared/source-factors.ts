import type { MeterType } from "../data-ingestion/types";

/**
 * DC BEPS Source Energy Factors — 2024-2026 EPA standard ratios.
 *
 * These convert site energy (kBtu) to source energy (kBtu) by fuel type.
 * Source energy accounts for upstream losses (generation, transmission, distribution).
 *
 * Reference: EPA Portfolio Manager Technical Reference, Source Energy (2024).
 * These factors MUST be stored alongside every calculation for auditability —
 * if EPA updates them, historical snapshots remain verifiable against the factor
 * that was in effect at the time.
 */

export interface SourceFactor {
  readonly fuelType: FuelType;
  readonly meterType: MeterType;
  readonly ratio: number;
  readonly label: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
}

export type FuelType =
  | "GRID_ELECTRICITY"
  | "NATURAL_GAS"
  | "DISTRICT_STEAM"
  | "ONSITE_SOLAR";

/**
 * DC 2024-2026 EPA source-to-site ratios.
 * Keyed by MeterType for direct lookup from EnergyReading records.
 */
const DC_SOURCE_FACTORS_2024: ReadonlyMap<MeterType, SourceFactor> = new Map([
  [
    "ELECTRIC",
    {
      fuelType: "GRID_ELECTRICITY",
      meterType: "ELECTRIC",
      ratio: 2.70,
      label: "Grid Electricity",
      effectiveFrom: "2024-01-01",
      effectiveTo: "2026-12-31",
    },
  ],
  [
    "GAS",
    {
      fuelType: "NATURAL_GAS",
      meterType: "GAS",
      ratio: 1.05,
      label: "Natural Gas",
      effectiveFrom: "2024-01-01",
      effectiveTo: "2026-12-31",
    },
  ],
  [
    "STEAM",
    {
      fuelType: "DISTRICT_STEAM",
      meterType: "STEAM",
      ratio: 1.20,
      label: "District Steam",
      effectiveFrom: "2024-01-01",
      effectiveTo: "2026-12-31",
    },
  ],
  [
    "OTHER",
    {
      fuelType: "ONSITE_SOLAR",
      meterType: "OTHER",
      ratio: 1.00,
      label: "On-site Solar / Other",
      effectiveFrom: "2024-01-01",
      effectiveTo: "2026-12-31",
    },
  ],
]);

/**
 * RegulatoryDataError — thrown when required compliance data is null/undefined.
 *
 * Distinguishes missing regulatory data from generic runtime errors.
 * Callers should catch this to produce actionable user-facing messages.
 */
export class RegulatoryDataError extends Error {
  public readonly code: string;
  public readonly field: string;

  constructor(message: string, field: string) {
    super(message);
    this.name = "RegulatoryDataError";
    this.code = "REGULATORY_DATA_MISSING";
    this.field = field;
  }
}

/**
 * Look up the source factor for a given meter type using the DC 2024-2026 registry.
 *
 * @throws {RegulatoryDataError} if meterType is null/undefined
 */
export function getSourceFactor(meterType: MeterType): SourceFactor {
  const factor = DC_SOURCE_FACTORS_2024.get(meterType);
  if (!factor) {
    throw new RegulatoryDataError(
      `No source factor registered for meter type "${meterType}". ` +
        `Valid types: ${Array.from(DC_SOURCE_FACTORS_2024.keys()).join(", ")}`,
      "meterType",
    );
  }
  return factor;
}

/**
 * Get the numeric source-to-site ratio for a meter type.
 *
 * @throws {RegulatoryDataError} if meterType is null/undefined
 */
export function getSourceRatio(meterType: MeterType): number {
  return getSourceFactor(meterType).ratio;
}

/**
 * Convert site kBtu to source kBtu for a given meter type.
 *
 * @throws {RegulatoryDataError} if consumption is null/undefined
 */
export function toSourceKbtu(
  siteKbtu: number | null | undefined,
  meterType: MeterType,
): { sourceKbtu: number; factorUsed: number } {
  if (siteKbtu == null) {
    throw new RegulatoryDataError(
      "Cannot convert to source kBtu: consumption value is null or undefined",
      "siteKbtu",
    );
  }
  const ratio = getSourceRatio(meterType);
  return {
    sourceKbtu: siteKbtu * ratio,
    factorUsed: ratio,
  };
}

/**
 * Return all registered source factors (for display/audit purposes).
 */
export function getAllSourceFactors(): readonly SourceFactor[] {
  return Array.from(DC_SOURCE_FACTORS_2024.values());
}
