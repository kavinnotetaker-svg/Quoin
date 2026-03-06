export interface PenaltyInput {
  grossSquareFeet: number;
  propertyType: string;
  bepsTargetScore: number;
}

export interface PerformancePathwayInput extends PenaltyInput {
  baselineAdjustedSiteEui: number;
  currentAdjustedSiteEui: number;
  targetReductionPct: number;
}

export interface StandardTargetInput extends PenaltyInput {
  baselineScore: number;
  currentScore: number;
  maxGapForPropertyType?: number;
}

export interface PrescriptivePathwayInput extends PenaltyInput {
  pointsEarned: number;
  pointsNeeded: number;
}

export interface PenaltyResult {
  maxPenalty: number;
  adjustedPenalty: number;
  reductionPct: number;
  pathway: "PERFORMANCE" | "STANDARD_TARGET" | "PRESCRIPTIVE";
  compliant: boolean;
  details: string;
}

export interface AllPathwaysResult {
  performance: PenaltyResult | null;
  standardTarget: PenaltyResult | null;
  prescriptive: PenaltyResult | null;
  recommended: PenaltyResult | null;
  recommendedPathway: string | null;
}

/**
 * Input for metric-aware penalty routing.
 *
 * StandardTarget uses Source EUI (derived from Energy Star Score / source-based median).
 * Performance uses Site EUI (20% reduction from 2019 baseline).
 */
export interface MetricAwarePenaltyInput {
  grossSquareFeet: number;
  propertyType: string;
  bepsTargetScore: number;
  pathway: "STANDARD_TARGET" | "PERFORMANCE";
  /** Site EUI — required for Performance pathway */
  currentSiteEui: number | null;
  /** Source EUI — required for StandardTarget pathway */
  currentSourceEui: number | null;
  /** Baseline Site EUI (2019) — required for Performance pathway */
  baselineSiteEui: number | null;
  /** Baseline Source EUI — required for StandardTarget pathway */
  baselineSourceEui: number | null;
  /** Current ENERGY STAR score — required for StandardTarget pathway */
  currentScore: number | null;
  /** Baseline ENERGY STAR score — required for StandardTarget pathway */
  baselineScore: number | null;
  /** Property-type-specific max gap for StandardTarget two-step calc */
  maxGapForPropertyType?: number;
  /** Override the 20% default for Performance pathway */
  targetReductionPct?: number;
}
