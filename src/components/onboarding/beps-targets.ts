/**
 * DC BEPS Cycle 1 target ENERGY STAR scores by property type.
 * Source: DC BEPS Compliance Regulations, Table of Targets.
 * These are the minimum scores required to avoid penalties by Dec 31, 2026.
 */

export const BEPS_TARGET_SCORES: Record<string, number> = {
  OFFICE: 71,
  MULTIFAMILY: 61,
  MIXED_USE: 66,
  OTHER: 50,
};

export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  OFFICE: "Office",
  MULTIFAMILY: "Multifamily Housing",
  MIXED_USE: "Mixed Use",
  OTHER: "Other",
};

export const DC_WARD_OPTIONS = [
  "Ward 1",
  "Ward 2",
  "Ward 3",
  "Ward 4",
  "Ward 5",
  "Ward 6",
  "Ward 7",
  "Ward 8",
] as const;
