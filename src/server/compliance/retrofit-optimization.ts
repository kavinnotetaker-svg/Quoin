import type {
  ComplianceCycle,
  Prisma,
  RetrofitCandidateSource,
  RetrofitCandidateStatus,
  RetrofitConfidenceBand,
  RetrofitProjectType,
} from "@/generated/prisma/client";
import { prisma } from "@/server/lib/db";
import {
  getLatestComplianceSnapshot,
  LATEST_SNAPSHOT_ORDER,
} from "@/server/lib/compliance-snapshots";
import { getECMDatabase } from "@/server/pipelines/pathway-analysis/ecm-scorer";
import {
  listStoredPenaltySummaries,
  type PenaltySummary,
} from "./penalties";
import { getActiveBepsCycleContext } from "./beps/cycle-registry";
import { resolveGovernedFilingYear } from "./beps/config";

const KBTU_TO_SAVINGS_DOLLAR_PROXY = 0.03;
const DAY_MS = 24 * 60 * 60 * 1000;

export const RETROFIT_RANK_REASON_CODES = {
  highAvoidedPenalty: "HIGH_AVOIDED_PENALTY",
  moderateAvoidedPenalty: "MODERATE_AVOIDED_PENALTY",
  lowNetCostForBenefit: "LOW_NET_COST_FOR_BENEFIT",
  longPayback: "LONG_PAYBACK",
  implementableBeforeDeadline: "IMPLEMENTABLE_BEFORE_DEADLINE",
  mayMissCycleDeadline: "MAY_MISS_CYCLE_DEADLINE",
  activeCycleAlignment: "ACTIVE_CYCLE_ALIGNMENT",
  lowCycleAlignment: "LOW_CYCLE_ALIGNMENT",
  highConfidenceEstimate: "HIGH_CONFIDENCE_ESTIMATE",
  lowConfidenceEstimate: "LOW_CONFIDENCE_ESTIMATE",
  anomalyContextPresent: "ANOMALY_CONTEXT_PRESENT",
  limitedComplianceImpact: "LIMITED_COMPLIANCE_IMPACT",
  noCurrentPenaltyExposure: "NO_CURRENT_PENALTY_EXPOSURE",
} as const;

export type RetrofitRankReasonCode =
  (typeof RETROFIT_RANK_REASON_CODES)[keyof typeof RETROFIT_RANK_REASON_CODES];

export interface RetrofitRankingSourceRef {
  recordType:
    | "RETROFIT_CANDIDATE"
    | "FILING_RECORD"
    | "COMPLIANCE_RUN"
    | "OPERATIONAL_ANOMALY"
    | "BUILDING";
  recordId: string;
  label: string;
}

export interface RetrofitCandidateRanking {
  candidateId: string;
  buildingId: string;
  organizationId: string;
  complianceCycle: ComplianceCycle | null;
  targetFilingYear: number | null;
  projectType: RetrofitProjectType;
  candidateSource: RetrofitCandidateSource;
  status: RetrofitCandidateStatus;
  confidenceBand: RetrofitConfidenceBand;
  name: string;
  description: string | null;
  estimatedCapex: number;
  estimatedIncentiveAmount: number;
  netProjectCost: number;
  estimatedAnnualSavingsKbtu: number | null;
  estimatedAnnualSavingsUsd: number | null;
  estimatedSiteEuiReduction: number | null;
  estimatedSourceEuiReduction: number | null;
  estimatedBepsImpactPct: number;
  estimatedAvoidedPenalty: number | null;
  estimatedAvoidedPenaltyStatus:
    | "ESTIMATED"
    | "INSUFFICIENT_CONTEXT"
    | "NOT_APPLICABLE";
  estimatedOperationalRiskReduction: {
    energyImpactKbtu: number | null;
    penaltyImpactUsd: number | null;
    status: "ESTIMATED" | "INSUFFICIENT_CONTEXT" | "NOT_APPLICABLE";
    explanation: string;
  };
  paybackProxyYears: number | null;
  priorityScore: number;
  priorityBand: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reasonCodes: RetrofitRankReasonCode[];
  basis: {
    summary: string;
    explanation: string;
    assumptions: string[];
  };
  rankingBreakdown: {
    avoidedPenaltyScore: number;
    complianceImpactScore: number;
    energyImpactScore: number;
    timingScore: number;
    cycleImpactScore: number;
    costEfficiencyScore: number;
    confidenceScore: number;
    anomalyContextScore: number;
  };
  rationale: {
    currentPenaltyExposure: number | null;
    deadlineDate: string | null;
    monthsUntilDeadline: number | null;
    anomalyContextCount: number;
    anomalyEstimatedPenaltyRisk: number | null;
    penaltyCalculatedAt: string | null;
  };
  sourceRefs: RetrofitRankingSourceRef[];
}

export interface BuildingRetrofitOpportunitySummary {
  activeCount: number;
  highestPriorityBand: RetrofitCandidateRanking["priorityBand"] | null;
  topOpportunity: RetrofitCandidateRanking | null;
  opportunities: RetrofitCandidateRanking[];
}

const retrofitCandidateListSelect = {
  id: true,
  organizationId: true,
  buildingId: true,
  sourceArtifactId: true,
  projectType: true,
  candidateSource: true,
  status: true,
  name: true,
  description: true,
  complianceCycle: true,
  targetFilingYear: true,
  estimatedCapex: true,
  estimatedIncentiveAmount: true,
  estimatedAnnualSavingsKbtu: true,
  estimatedAnnualSavingsUsd: true,
  estimatedSiteEuiReduction: true,
  estimatedSourceEuiReduction: true,
  estimatedBepsImprovementPct: true,
  estimatedImplementationMonths: true,
  confidenceBand: true,
  sourceMetadata: true,
  createdAt: true,
  updatedAt: true,
  building: {
    select: {
      id: true,
      name: true,
      complianceCycle: true,
    },
  },
} satisfies Prisma.RetrofitCandidateSelect;

export type RetrofitCandidateRecord = Prisma.RetrofitCandidateGetPayload<{
  select: typeof retrofitCandidateListSelect;
}>;

export interface RankingContext {
  building: {
    id: string;
    organizationId: string;
    name: string;
    grossSquareFeet: number;
    propertyType: string;
    yearBuilt: number | null;
    complianceCycle: ComplianceCycle;
    maxPenaltyExposure: number;
  };
  latestSnapshot: {
    id: string;
    siteEui: number | null;
    sourceEui: number | null;
  } | null;
  latestComplianceContext: {
    id: string;
    filingYear: number | null;
    complianceCycle: ComplianceCycle | null;
    complianceRunId: string | null;
  } | null;
  penaltySummary: Pick<
    PenaltySummary,
    "status" | "currentEstimatedPenalty" | "calculatedAt"
  > | null;
  anomalies: Array<{
    id: string;
    anomalyType: string;
    severity: string;
    title: string;
    estimatedEnergyImpactKbtu: number | null;
    estimatedPenaltyImpactUsd: number | null;
    penaltyImpactStatus: "ESTIMATED" | "INSUFFICIENT_CONTEXT" | "NOT_APPLICABLE";
  }>;
  deadlineDate: Date | null;
}

export interface UpsertRetrofitCandidateInput {
  organizationId: string;
  buildingId: string;
  candidateId?: string;
  projectType: RetrofitProjectType;
  candidateSource?: RetrofitCandidateSource;
  status?: RetrofitCandidateStatus;
  name?: string | null;
  description?: string | null;
  complianceCycle?: ComplianceCycle | null;
  targetFilingYear?: number | null;
  estimatedCapex?: number | null;
  estimatedIncentiveAmount?: number | null;
  estimatedAnnualSavingsKbtu?: number | null;
  estimatedAnnualSavingsUsd?: number | null;
  estimatedSiteEuiReduction?: number | null;
  estimatedSourceEuiReduction?: number | null;
  estimatedBepsImprovementPct?: number | null;
  estimatedImplementationMonths?: number | null;
  confidenceBand?: RetrofitConfidenceBand;
  sourceArtifactId?: string | null;
  sourceMetadata?: Record<string, unknown>;
}

const ECM_PROJECT_MAP: Partial<Record<RetrofitProjectType, string>> = {
  LED_LIGHTING_RETROFIT: "ecm-led-retrofit",
  RETRO_COMMISSIONING: "ecm-rcx",
  BMS_UPGRADE: "ecm-bms-upgrade",
  VARIABLE_FREQUENCY_DRIVES: "ecm-vfd",
  LOW_FLOW_FIXTURES: "ecm-low-flow",
  HEAT_PUMP_CONVERSION: "ecm-heat-pump",
  ENVELOPE_AIR_SEALING: "ecm-envelope-air-sealing",
  WINDOW_REPLACEMENT: "ecm-window-replacement",
  ROOF_INSULATION_UPGRADE: "ecm-roof-insulation",
  ROOFTOP_SOLAR_PV: "ecm-solar-pv",
};

const IMPLEMENTATION_MONTH_DEFAULTS: Record<RetrofitProjectType, number> = {
  LED_LIGHTING_RETROFIT: 4,
  RETRO_COMMISSIONING: 3,
  BMS_UPGRADE: 6,
  VARIABLE_FREQUENCY_DRIVES: 5,
  LOW_FLOW_FIXTURES: 2,
  HEAT_PUMP_CONVERSION: 18,
  ENVELOPE_AIR_SEALING: 9,
  WINDOW_REPLACEMENT: 12,
  ROOF_INSULATION_UPGRADE: 10,
  ROOFTOP_SOLAR_PV: 8,
  CUSTOM: 12,
};

const ANOMALY_ALIGNMENT_MAP: Partial<Record<string, RetrofitProjectType[]>> = {
  ABNORMAL_BASELOAD: [
    "RETRO_COMMISSIONING",
    "BMS_UPGRADE",
    "VARIABLE_FREQUENCY_DRIVES",
  ],
  OFF_HOURS_SCHEDULE_DRIFT: [
    "RETRO_COMMISSIONING",
    "BMS_UPGRADE",
    "VARIABLE_FREQUENCY_DRIVES",
    "LED_LIGHTING_RETROFIT",
  ],
  UNUSUAL_CONSUMPTION_SPIKE: [
    "RETRO_COMMISSIONING",
    "BMS_UPGRADE",
    "HEAT_PUMP_CONVERSION",
    "ENVELOPE_AIR_SEALING",
  ],
  INCONSISTENT_METER_BEHAVIOR: [
    "RETRO_COMMISSIONING",
    "BMS_UPGRADE",
  ],
};

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getPriorityBand(priorityScore: number): RetrofitCandidateRanking["priorityBand"] {
  if (priorityScore >= 80) return "CRITICAL";
  if (priorityScore >= 60) return "HIGH";
  if (priorityScore >= 35) return "MEDIUM";
  return "LOW";
}

function dedupeReasonCodes(reasonCodes: RetrofitRankReasonCode[]) {
  return Array.from(new Set(reasonCodes));
}

function dedupeSourceRefs(sourceRefs: RetrofitRankingSourceRef[]) {
  const seen = new Set<string>();
  return sourceRefs.filter((sourceRef) => {
    const key = `${sourceRef.recordType}:${sourceRef.recordId}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function humanizeProjectType(projectType: RetrofitProjectType) {
  return projectType
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getCurrentPenaltyExposure(
  penaltySummary: RankingContext["penaltySummary"],
) {
  if (!penaltySummary) {
    return {
      amount: null,
      status: "INSUFFICIENT_CONTEXT" as const,
    };
  }

  if (penaltySummary.status === "NOT_APPLICABLE") {
    return {
      amount: 0,
      status: "NOT_APPLICABLE" as const,
    };
  }

  if (
    penaltySummary.status === "ESTIMATED" &&
    penaltySummary.currentEstimatedPenalty != null
  ) {
    return {
      amount: penaltySummary.currentEstimatedPenalty,
      status: "ESTIMATED" as const,
    };
  }

  return {
    amount: null,
    status: "INSUFFICIENT_CONTEXT" as const,
  };
}

function getProjectDefault(projectType: RetrofitProjectType) {
  const ecmId = ECM_PROJECT_MAP[projectType];
  if (!ecmId) {
    return null;
  }

  return getECMDatabase().find((ecm) => ecm.id === ecmId) ?? null;
}

function deriveCandidateDefaults(input: {
  projectType: RetrofitProjectType;
  building: {
    grossSquareFeet: number;
    propertyType: string;
    yearBuilt: number | null;
  };
  latestSnapshot: {
    siteEui: number | null;
    sourceEui: number | null;
  } | null;
}) {
  const ecm = getProjectDefault(input.projectType);
  if (!ecm) {
    return null;
  }

  const currentYear = new Date().getUTCFullYear();
  const buildingAge = input.building.yearBuilt != null
    ? currentYear - input.building.yearBuilt
    : 30;

  if (
    !ecm.applicablePropertyTypes.includes(input.building.propertyType) ||
    buildingAge < ecm.minBuildingAge
  ) {
    return null;
  }

  const currentSiteEui = input.latestSnapshot?.siteEui ?? null;
  const currentSourceEui = input.latestSnapshot?.sourceEui ?? null;
  const estimatedAnnualSavingsKbtu =
    currentSiteEui != null
      ? currentSiteEui *
        input.building.grossSquareFeet *
        (ecm.estimatedSavingsPct / 100)
      : null;

  return {
    name: ecm.name,
    description: ecm.description,
    estimatedCapex: round(ecm.costPerSqft * input.building.grossSquareFeet, 2),
    estimatedAnnualSavingsKbtu:
      estimatedAnnualSavingsKbtu != null ? round(estimatedAnnualSavingsKbtu, 2) : null,
    estimatedAnnualSavingsUsd:
      estimatedAnnualSavingsKbtu != null
        ? round(estimatedAnnualSavingsKbtu * KBTU_TO_SAVINGS_DOLLAR_PROXY, 2)
        : null,
    estimatedSiteEuiReduction:
      currentSiteEui != null
        ? round(currentSiteEui * (ecm.estimatedSavingsPct / 100), 4)
        : null,
    estimatedSourceEuiReduction:
      currentSourceEui != null
        ? round(currentSourceEui * (ecm.estimatedSavingsPct / 100), 4)
        : null,
    estimatedBepsImprovementPct: round(ecm.estimatedSavingsPct, 2),
    estimatedImplementationMonths: IMPLEMENTATION_MONTH_DEFAULTS[input.projectType],
    confidenceBand: "MEDIUM" as const,
    sourceMetadata: {
      defaultSource: "ECM_LIBRARY",
      ecmId: ecm.id,
      ecmCategory: ecm.category,
      estimatedSavingsPct: ecm.estimatedSavingsPct,
      simplePaybackYears: ecm.simplePaybackYears,
    },
  };
}

function resolveDeadlineDate(input: {
  latestComplianceContext: RankingContext["latestComplianceContext"];
  cycleContext: Awaited<ReturnType<typeof getActiveBepsCycleContext>>;
}) {
  const factorCycle = toRecord(input.cycleContext.factorConfig.cycle);
  const explicitDeadline = factorCycle["complianceDeadline"];
  if (typeof explicitDeadline === "string") {
    const parsed = new Date(explicitDeadline);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const filingYear =
    input.latestComplianceContext?.filingYear ??
    resolveGovernedFilingYear(
      input.cycleContext.registry.complianceCycle,
      input.cycleContext.ruleConfig,
      input.cycleContext.factorConfig,
      null,
    );

  return new Date(Date.UTC(filingYear, 11, 31));
}

async function tryGetActiveBepsCycleContext(cycle: ComplianceCycle) {
  try {
    return await getActiveBepsCycleContext(cycle);
  } catch {
    return null;
  }
}

function monthsUntilDate(now: Date, target: Date | null) {
  if (!target) {
    return null;
  }

  return Math.ceil((target.getTime() - now.getTime()) / (30 * DAY_MS));
}

function calculateEstimatedBepsImpactPct(input: {
  candidate: RetrofitCandidateRecord;
  latestSnapshot: RankingContext["latestSnapshot"];
  grossSquareFeet: number;
}) {
  if (input.candidate.estimatedBepsImprovementPct != null) {
    return clamp(input.candidate.estimatedBepsImprovementPct / 100, 0, 1);
  }

  if (
    input.candidate.estimatedSiteEuiReduction != null &&
    input.latestSnapshot?.siteEui != null &&
    input.latestSnapshot.siteEui > 0
  ) {
    return clamp(
      input.candidate.estimatedSiteEuiReduction / input.latestSnapshot.siteEui,
      0,
      1,
    );
  }

  if (
    input.candidate.estimatedSourceEuiReduction != null &&
    input.latestSnapshot?.sourceEui != null &&
    input.latestSnapshot.sourceEui > 0
  ) {
    return clamp(
      input.candidate.estimatedSourceEuiReduction / input.latestSnapshot.sourceEui,
      0,
      1,
    );
  }

  if (
    input.candidate.estimatedAnnualSavingsKbtu != null &&
    input.latestSnapshot?.siteEui != null &&
    input.latestSnapshot.siteEui > 0 &&
    input.grossSquareFeet > 0
  ) {
    const currentAnnualKbtu = input.latestSnapshot.siteEui * input.grossSquareFeet;
    return clamp(input.candidate.estimatedAnnualSavingsKbtu / currentAnnualKbtu, 0, 1);
  }

  return 0;
}

function calculateAnomalyContextScore(input: {
  candidate: RetrofitCandidateRecord;
  anomalies: RankingContext["anomalies"];
}) {
  const metadata = toRecord(input.candidate.sourceMetadata);
  const linkedAnomalyIds = new Set(
    toArray(metadata["sourceAnomalyIds"]).filter(
      (value): value is string => typeof value === "string",
    ),
  );
  const matchingAnomalies = input.anomalies.filter(
    (anomaly) =>
      linkedAnomalyIds.has(anomaly.id) ||
      (ANOMALY_ALIGNMENT_MAP[anomaly.anomalyType] ?? []).includes(input.candidate.projectType),
  );

  if (matchingAnomalies.length === 0) {
    return {
      score: 0,
      count: 0,
      sourceRefs: [] as RetrofitRankingSourceRef[],
      hasContext: false,
      estimatedEnergyImpactKbtu: null,
      estimatedPenaltyImpactUsd: null,
      reductionStatus: "NOT_APPLICABLE" as const,
      explanation:
        "No active anomaly signals are currently aligned with this retrofit opportunity.",
    };
  }

  const highSeverityCount = matchingAnomalies.filter(
    (anomaly) => anomaly.severity === "HIGH" || anomaly.severity === "CRITICAL",
  ).length;
  const score = clamp(4 + highSeverityCount * 2 + matchingAnomalies.length, 0, 10);
  const estimatedEnergyImpactKbtu = matchingAnomalies.reduce<number | null>(
    (sum, anomaly) =>
      anomaly.estimatedEnergyImpactKbtu == null
        ? sum
        : (sum ?? 0) + anomaly.estimatedEnergyImpactKbtu,
    null,
  );
  const estimatedPenaltyAnomalies = matchingAnomalies.filter(
    (anomaly) => anomaly.penaltyImpactStatus === "ESTIMATED",
  );
  const estimatedPenaltyImpactUsd =
    estimatedPenaltyAnomalies.length === 0
      ? null
      : round(
          estimatedPenaltyAnomalies.reduce(
            (sum, anomaly) => sum + (anomaly.estimatedPenaltyImpactUsd ?? 0),
            0,
          ),
          2,
        );
  const reductionStatus =
    estimatedPenaltyAnomalies.length > 0
      ? ("ESTIMATED" as const)
      : matchingAnomalies.every(
            (anomaly) => anomaly.penaltyImpactStatus === "NOT_APPLICABLE",
          )
        ? ("NOT_APPLICABLE" as const)
        : ("INSUFFICIENT_CONTEXT" as const);

  return {
    score,
    count: matchingAnomalies.length,
    hasContext: true,
    estimatedEnergyImpactKbtu,
    estimatedPenaltyImpactUsd,
    reductionStatus,
    explanation:
      reductionStatus === "ESTIMATED"
        ? "Operational risk reduction is estimated from the active anomaly impacts aligned to this retrofit opportunity."
        : reductionStatus === "NOT_APPLICABLE"
          ? "Aligned anomalies are present, but they do not currently imply additional penalty-linked operational risk."
          : "Aligned anomalies are present, but their penalty-linked operational risk cannot be quantified cleanly from current governed context.",
    sourceRefs: matchingAnomalies.map((anomaly) => ({
      recordType: "OPERATIONAL_ANOMALY" as const,
      recordId: anomaly.id,
      label: anomaly.title,
    })),
  };
}

function resolveCandidateDeadlineDate(
  candidate: RetrofitCandidateRecord,
  context: RankingContext,
) {
  if (candidate.targetFilingYear != null) {
    return new Date(Date.UTC(candidate.targetFilingYear, 11, 31));
  }

  return context.deadlineDate;
}

export function rankRetrofitCandidateData(input: {
  candidate: RetrofitCandidateRecord;
  context: RankingContext;
  now?: Date;
}): RetrofitCandidateRanking {
  const now = input.now ?? new Date();
  const currentPenaltyExposure = getCurrentPenaltyExposure(input.context.penaltySummary);
  const netProjectCost = Math.max(
    input.candidate.estimatedCapex - input.candidate.estimatedIncentiveAmount,
    0,
  );
  const annualSavingsUsd =
    input.candidate.estimatedAnnualSavingsUsd ??
    (input.candidate.estimatedAnnualSavingsKbtu != null
      ? round(input.candidate.estimatedAnnualSavingsKbtu * KBTU_TO_SAVINGS_DOLLAR_PROXY, 2)
      : null);
  const estimatedBepsImpactPct = calculateEstimatedBepsImpactPct({
    candidate: input.candidate,
    latestSnapshot: input.context.latestSnapshot,
    grossSquareFeet: input.context.building.grossSquareFeet,
  });
  const estimatedAvoidedPenalty =
    currentPenaltyExposure.status === "ESTIMATED" &&
    currentPenaltyExposure.amount != null &&
    currentPenaltyExposure.amount > 0
      ? round(currentPenaltyExposure.amount * estimatedBepsImpactPct, 2)
      : null;

  const currentAnnualKbtu =
    input.context.latestSnapshot?.siteEui != null
      ? input.context.latestSnapshot.siteEui * input.context.building.grossSquareFeet
      : null;
  const energyImpactFraction =
    input.candidate.estimatedAnnualSavingsKbtu != null &&
    currentAnnualKbtu != null &&
    currentAnnualKbtu > 0
      ? clamp(input.candidate.estimatedAnnualSavingsKbtu / currentAnnualKbtu, 0, 1)
      : estimatedBepsImpactPct;
  const paybackProxyYears =
    annualSavingsUsd != null && annualSavingsUsd > 0
      ? round(netProjectCost / annualSavingsUsd, 2)
      : null;
  const deadlineDate = resolveCandidateDeadlineDate(input.candidate, input.context);
  const monthsUntilDeadline = monthsUntilDate(now, deadlineDate);
  const implementationMonths = input.candidate.estimatedImplementationMonths;
  const timingFit =
    implementationMonths == null || monthsUntilDeadline == null
      ? 0.5
      : implementationMonths <= monthsUntilDeadline
        ? 1
        : implementationMonths <= monthsUntilDeadline + 6
          ? 0.4
          : 0.1;
  const cycleAligned =
    input.candidate.complianceCycle == null ||
    input.candidate.complianceCycle === input.context.building.complianceCycle;
  const benefitCostRatio =
    netProjectCost > 0
      ? ((estimatedAvoidedPenalty ?? 0) + (annualSavingsUsd ?? 0) * 3) / netProjectCost
      : 2;
  const confidenceScore =
    input.candidate.confidenceBand === "HIGH"
      ? 10
      : input.candidate.confidenceBand === "MEDIUM"
        ? 6
        : 2;
  const anomalyContext = calculateAnomalyContextScore({
    candidate: input.candidate,
    anomalies: input.context.anomalies,
  });

  const rankingBreakdown = {
    avoidedPenaltyScore:
      currentPenaltyExposure.status === "ESTIMATED" &&
      currentPenaltyExposure.amount != null &&
      currentPenaltyExposure.amount > 0 &&
      estimatedAvoidedPenalty != null
        ? round(
            clamp(
              (estimatedAvoidedPenalty / currentPenaltyExposure.amount) * 25,
              0,
              25,
            ),
            2,
          )
        : 0,
    complianceImpactScore: round(clamp(estimatedBepsImpactPct * 20, 0, 20), 2),
    energyImpactScore: round(clamp(energyImpactFraction * 15, 0, 15), 2),
    timingScore: round(timingFit * 15, 2),
    cycleImpactScore: cycleAligned ? 5 : 0,
    costEfficiencyScore: round(clamp(benefitCostRatio * 5, 0, 15), 2),
    confidenceScore,
    anomalyContextScore: anomalyContext.score,
  };

  const priorityScore = round(
    clamp(
      Object.values(rankingBreakdown).reduce((sum, value) => sum + value, 0),
      0,
      100,
    ),
    2,
  );

  const reasonCodes: RetrofitRankReasonCode[] = [];
  if (currentPenaltyExposure.status === "NOT_APPLICABLE") {
    reasonCodes.push(RETROFIT_RANK_REASON_CODES.noCurrentPenaltyExposure);
  } else if (
    currentPenaltyExposure.amount != null &&
    estimatedAvoidedPenalty != null &&
    (estimatedAvoidedPenalty >= currentPenaltyExposure.amount * 0.25 ||
      estimatedAvoidedPenalty >= 100000)
  ) {
    reasonCodes.push(RETROFIT_RANK_REASON_CODES.highAvoidedPenalty);
  } else if (estimatedAvoidedPenalty != null && estimatedAvoidedPenalty > 0) {
    reasonCodes.push(RETROFIT_RANK_REASON_CODES.moderateAvoidedPenalty);
  }

  if (benefitCostRatio >= 1 || (paybackProxyYears != null && paybackProxyYears <= 5)) {
    reasonCodes.push(RETROFIT_RANK_REASON_CODES.lowNetCostForBenefit);
  } else if (paybackProxyYears != null && paybackProxyYears >= 12) {
    reasonCodes.push(RETROFIT_RANK_REASON_CODES.longPayback);
  }

  if (timingFit >= 1) {
    reasonCodes.push(RETROFIT_RANK_REASON_CODES.implementableBeforeDeadline);
  } else {
    reasonCodes.push(RETROFIT_RANK_REASON_CODES.mayMissCycleDeadline);
  }

  if (cycleAligned) {
    reasonCodes.push(RETROFIT_RANK_REASON_CODES.activeCycleAlignment);
  } else {
    reasonCodes.push(RETROFIT_RANK_REASON_CODES.lowCycleAlignment);
  }

  if (input.candidate.confidenceBand === "HIGH") {
    reasonCodes.push(RETROFIT_RANK_REASON_CODES.highConfidenceEstimate);
  } else if (input.candidate.confidenceBand === "LOW") {
    reasonCodes.push(RETROFIT_RANK_REASON_CODES.lowConfidenceEstimate);
  }

  if (anomalyContext.hasContext) {
    reasonCodes.push(RETROFIT_RANK_REASON_CODES.anomalyContextPresent);
  }

  if (estimatedBepsImpactPct < 0.05) {
    reasonCodes.push(RETROFIT_RANK_REASON_CODES.limitedComplianceImpact);
  }

  const sourceRefs: RetrofitRankingSourceRef[] = [
    {
      recordType: "RETROFIT_CANDIDATE",
      recordId: input.candidate.id,
      label: input.candidate.name,
    },
    {
      recordType: "BUILDING",
      recordId: input.context.building.id,
      label: input.context.building.name,
    },
    ...(input.context.latestComplianceContext
      ? [
          {
            recordType: "FILING_RECORD" as const,
            recordId: input.context.latestComplianceContext.id,
            label: `BEPS filing ${input.context.latestComplianceContext.filingYear ?? "current"}`,
          },
          ...(input.context.latestComplianceContext.complianceRunId
            ? [
                {
                  recordType: "COMPLIANCE_RUN" as const,
                  recordId: input.context.latestComplianceContext.complianceRunId,
                  label: "BEPS compliance run",
                },
              ]
            : []),
        ]
      : []),
    ...anomalyContext.sourceRefs,
  ];

  return {
    candidateId: input.candidate.id,
    buildingId: input.candidate.buildingId,
    organizationId: input.candidate.organizationId,
    complianceCycle: input.candidate.complianceCycle,
    targetFilingYear: input.candidate.targetFilingYear,
    projectType: input.candidate.projectType,
    candidateSource: input.candidate.candidateSource,
    status: input.candidate.status,
    confidenceBand: input.candidate.confidenceBand,
    name: input.candidate.name,
    description: input.candidate.description,
    estimatedCapex: input.candidate.estimatedCapex,
    estimatedIncentiveAmount: input.candidate.estimatedIncentiveAmount,
    netProjectCost,
    estimatedAnnualSavingsKbtu: input.candidate.estimatedAnnualSavingsKbtu,
    estimatedAnnualSavingsUsd: annualSavingsUsd,
    estimatedSiteEuiReduction: input.candidate.estimatedSiteEuiReduction,
    estimatedSourceEuiReduction: input.candidate.estimatedSourceEuiReduction,
    estimatedBepsImpactPct: round(estimatedBepsImpactPct * 100, 2),
    estimatedAvoidedPenalty,
    estimatedAvoidedPenaltyStatus: currentPenaltyExposure.status,
    estimatedOperationalRiskReduction: {
      energyImpactKbtu: anomalyContext.estimatedEnergyImpactKbtu,
      penaltyImpactUsd: anomalyContext.estimatedPenaltyImpactUsd,
      status: anomalyContext.reductionStatus,
      explanation: anomalyContext.explanation,
    },
    paybackProxyYears,
    priorityScore,
    priorityBand: getPriorityBand(priorityScore),
    reasonCodes: dedupeReasonCodes(reasonCodes),
    basis: {
      summary:
        estimatedAvoidedPenalty != null
          ? "Prioritized from governed penalty exposure, explicit retrofit impact assumptions, and aligned anomaly risk."
          : "Prioritized from explicit energy, timing, and anomaly assumptions because governed avoided-penalty context is not currently available.",
      explanation:
        "Retrofit ranking is decision-support only. It uses the latest governed penalty summary when available, current compliance timing, explicit retrofit inputs, and aligned operational anomaly signals. It does not alter the compliance engine result.",
      assumptions: [
        estimatedAvoidedPenalty != null
          ? "Avoided penalty is estimated by scaling the latest governed penalty exposure by the retrofit's expected BEPS improvement share."
          : "Avoided penalty is omitted because no current governed penalty estimate is available.",
        annualSavingsUsd != null
          ? "Cost efficiency uses the stated annual savings together with avoided penalty when available."
          : "Cost efficiency uses available capital cost and compliance impact only because annual savings were not provided.",
        anomalyContext.hasContext
          ? anomalyContext.explanation
          : "No aligned operational anomalies are currently increasing this opportunity's risk-reduction value.",
      ],
    },
    rankingBreakdown,
    rationale: {
      currentPenaltyExposure:
        currentPenaltyExposure.amount != null
          ? round(currentPenaltyExposure.amount, 2)
          : null,
      deadlineDate: deadlineDate?.toISOString() ?? null,
      monthsUntilDeadline,
      anomalyContextCount: anomalyContext.count,
      anomalyEstimatedPenaltyRisk: anomalyContext.estimatedPenaltyImpactUsd,
      penaltyCalculatedAt: input.context.penaltySummary?.calculatedAt ?? null,
    },
    sourceRefs: dedupeSourceRefs(sourceRefs),
  };
}

async function buildRankingContexts(params: {
  organizationId: string;
  buildingIds: string[];
}) {
  if (params.buildingIds.length === 0) {
    return new Map<string, RankingContext>();
  }

  const [buildings, latestSnapshots, filingRecords, anomalies, penaltySummaries] =
    await Promise.all([
    prisma.building.findMany({
      where: {
        organizationId: params.organizationId,
        id: { in: params.buildingIds },
      },
      select: {
        id: true,
        organizationId: true,
        name: true,
        grossSquareFeet: true,
        propertyType: true,
        yearBuilt: true,
        complianceCycle: true,
        maxPenaltyExposure: true,
      },
    }),
    prisma.complianceSnapshot.findMany({
      where: {
        organizationId: params.organizationId,
        buildingId: { in: params.buildingIds },
      },
      orderBy: LATEST_SNAPSHOT_ORDER,
      select: {
        id: true,
        buildingId: true,
        siteEui: true,
        sourceEui: true,
      },
    }),
    prisma.filingRecord.findMany({
      where: {
        organizationId: params.organizationId,
        buildingId: { in: params.buildingIds },
        filingType: "BEPS_COMPLIANCE",
      },
      orderBy: [{ filingYear: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        buildingId: true,
        filingYear: true,
        complianceCycle: true,
        complianceRunId: true,
        filingPayload: true,
      },
    }),
    prisma.operationalAnomaly.findMany({
      where: {
        organizationId: params.organizationId,
        buildingId: { in: params.buildingIds },
        status: {
          in: ["ACTIVE", "ACKNOWLEDGED"],
        },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        buildingId: true,
        anomalyType: true,
        severity: true,
        title: true,
        estimatedEnergyImpactKbtu: true,
        estimatedPenaltyImpactUsd: true,
        penaltyImpactStatus: true,
      },
    }),
    listStoredPenaltySummaries({
      organizationId: params.organizationId,
      buildingIds: params.buildingIds,
    }),
  ]);

  const latestSnapshotByBuilding = new Map<string, (typeof latestSnapshots)[number]>();
  for (const snapshot of latestSnapshots) {
    if (!latestSnapshotByBuilding.has(snapshot.buildingId)) {
      latestSnapshotByBuilding.set(snapshot.buildingId, snapshot);
    }
  }

  const filingsByBuilding = new Map<string, (typeof filingRecords)>();
  for (const filing of filingRecords) {
    const existing = filingsByBuilding.get(filing.buildingId) ?? [];
    existing.push(filing);
    filingsByBuilding.set(filing.buildingId, existing);
  }

  const anomaliesByBuilding = new Map<string, RankingContext["anomalies"]>();
  for (const anomaly of anomalies) {
    const existing = anomaliesByBuilding.get(anomaly.buildingId) ?? [];
    existing.push({
      id: anomaly.id,
      anomalyType: anomaly.anomalyType,
      severity: anomaly.severity,
      title: anomaly.title,
      estimatedEnergyImpactKbtu: anomaly.estimatedEnergyImpactKbtu,
      estimatedPenaltyImpactUsd: anomaly.estimatedPenaltyImpactUsd,
      penaltyImpactStatus: anomaly.penaltyImpactStatus,
    });
    anomaliesByBuilding.set(anomaly.buildingId, existing);
  }
  const penaltyByBuilding = new Map(
    penaltySummaries.map((entry) => [entry.buildingId, entry.summary]),
  );

  const cycleContexts = new Map<
    ComplianceCycle,
    Awaited<ReturnType<typeof tryGetActiveBepsCycleContext>>
  >();
  for (const cycle of Array.from(new Set(buildings.map((building) => building.complianceCycle)))) {
    cycleContexts.set(cycle, await tryGetActiveBepsCycleContext(cycle));
  }

  const contexts = new Map<string, RankingContext>();
  for (const building of buildings) {
    const filingCandidates = filingsByBuilding.get(building.id) ?? [];
    const latestComplianceContext =
      filingCandidates.find((candidate) => candidate.complianceCycle === building.complianceCycle) ??
      filingCandidates[0] ??
      null;
    const cycleContext = cycleContexts.get(building.complianceCycle);

    contexts.set(building.id, {
      building,
      latestSnapshot: latestSnapshotByBuilding.get(building.id) ?? null,
      latestComplianceContext,
      penaltySummary:
        penaltyByBuilding.get(building.id) != null
          ? {
              status: penaltyByBuilding.get(building.id)!.status,
              currentEstimatedPenalty:
                penaltyByBuilding.get(building.id)!.currentEstimatedPenalty,
              calculatedAt: penaltyByBuilding.get(building.id)!.calculatedAt,
            }
          : null,
      anomalies: anomaliesByBuilding.get(building.id) ?? [],
      deadlineDate:
        cycleContext != null
          ? resolveDeadlineDate({
              latestComplianceContext,
              cycleContext,
            })
          : null,
    });
  }

  return contexts;
}

export async function listRetrofitCandidates(params: {
  organizationId: string;
  buildingId?: string;
  limit?: number;
  includeArchived?: boolean;
  statuses?: RetrofitCandidateStatus[];
}) {
  const statuses = params.statuses ??
    (params.includeArchived
      ? undefined
      : (["DRAFT", "ACTIVE", "DEFERRED"] satisfies RetrofitCandidateStatus[]));

  return prisma.retrofitCandidate.findMany({
    where: {
      organizationId: params.organizationId,
      ...(params.buildingId ? { buildingId: params.buildingId } : {}),
      ...(statuses ? { status: { in: statuses } } : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: params.limit ?? 100,
    select: retrofitCandidateListSelect,
  });
}

async function assertScopedSourceArtifact(input: {
  organizationId: string;
  buildingId: string;
  sourceArtifactId: string | null | undefined;
}) {
  if (!input.sourceArtifactId) {
    return;
  }

  const artifact = await prisma.sourceArtifact.findUnique({
    where: { id: input.sourceArtifactId },
    select: {
      id: true,
      organizationId: true,
      buildingId: true,
    },
  });

  if (!artifact || artifact.organizationId !== input.organizationId) {
    throw new Error("Source artifact not found for retrofit candidate");
  }

  if (artifact.buildingId && artifact.buildingId !== input.buildingId) {
    throw new Error("Source artifact not found for retrofit candidate building");
  }
}

export async function upsertRetrofitCandidateRecord(input: UpsertRetrofitCandidateInput) {
  const [building, latestSnapshot, existing] = await Promise.all([
    prisma.building.findFirst({
      where: {
        id: input.buildingId,
        organizationId: input.organizationId,
      },
      select: {
        id: true,
        organizationId: true,
        grossSquareFeet: true,
        propertyType: true,
        yearBuilt: true,
        complianceCycle: true,
      },
    }),
    getLatestComplianceSnapshot(prisma, {
      buildingId: input.buildingId,
      organizationId: input.organizationId,
      select: {
        siteEui: true,
        sourceEui: true,
      },
    }),
    input.candidateId
      ? prisma.retrofitCandidate.findFirst({
          where: {
            id: input.candidateId,
            organizationId: input.organizationId,
            buildingId: input.buildingId,
          },
        })
      : Promise.resolve(null),
  ]);

  if (!building) {
    throw new Error("Building not found for retrofit candidate");
  }

  if (input.candidateId && !existing) {
    throw new Error("Retrofit candidate not found");
  }

  const resolvedSourceArtifactId =
    input.sourceArtifactId !== undefined
      ? input.sourceArtifactId
      : existing?.sourceArtifactId ?? null;

  await assertScopedSourceArtifact({
    organizationId: input.organizationId,
    buildingId: input.buildingId,
    sourceArtifactId: resolvedSourceArtifactId,
  });

  const defaults = deriveCandidateDefaults({
    projectType: input.projectType,
    building,
    latestSnapshot,
  });
  const complianceCycle = input.complianceCycle ?? existing?.complianceCycle ?? building.complianceCycle;
  let targetFilingYear =
    input.targetFilingYear ?? existing?.targetFilingYear ?? null;
  if (targetFilingYear == null && complianceCycle != null) {
    const cycleContext = await tryGetActiveBepsCycleContext(complianceCycle);
    if (cycleContext) {
      targetFilingYear = resolveGovernedFilingYear(
        complianceCycle,
        cycleContext.ruleConfig,
        cycleContext.factorConfig,
        null,
      );
    }
  }

  const sourceMetadata = {
    ...(defaults?.sourceMetadata ?? {}),
    ...toRecord(existing?.sourceMetadata),
    ...(input.sourceMetadata ?? {}),
  } satisfies Record<string, unknown>;

  const data = {
    organizationId: input.organizationId,
    buildingId: input.buildingId,
    sourceArtifactId: resolvedSourceArtifactId,
    projectType: input.projectType,
    candidateSource:
      input.candidateSource ??
      existing?.candidateSource ??
      (defaults ? "ECM_LIBRARY" : "MANUAL"),
    status: input.status ?? existing?.status ?? "DRAFT",
    name:
      input.name ??
      existing?.name ??
      defaults?.name ??
      humanizeProjectType(input.projectType),
    description:
      input.description ??
      existing?.description ??
      defaults?.description ??
      null,
    complianceCycle,
    targetFilingYear,
    estimatedCapex:
      input.estimatedCapex ??
      existing?.estimatedCapex ??
      defaults?.estimatedCapex ??
      0,
    estimatedIncentiveAmount:
      input.estimatedIncentiveAmount ??
      existing?.estimatedIncentiveAmount ??
      0,
    estimatedAnnualSavingsKbtu:
      input.estimatedAnnualSavingsKbtu ??
      existing?.estimatedAnnualSavingsKbtu ??
      defaults?.estimatedAnnualSavingsKbtu ??
      null,
    estimatedAnnualSavingsUsd:
      input.estimatedAnnualSavingsUsd ??
      existing?.estimatedAnnualSavingsUsd ??
      defaults?.estimatedAnnualSavingsUsd ??
      null,
    estimatedSiteEuiReduction:
      input.estimatedSiteEuiReduction ??
      existing?.estimatedSiteEuiReduction ??
      defaults?.estimatedSiteEuiReduction ??
      null,
    estimatedSourceEuiReduction:
      input.estimatedSourceEuiReduction ??
      existing?.estimatedSourceEuiReduction ??
      defaults?.estimatedSourceEuiReduction ??
      null,
    estimatedBepsImprovementPct:
      input.estimatedBepsImprovementPct ??
      existing?.estimatedBepsImprovementPct ??
      defaults?.estimatedBepsImprovementPct ??
      null,
    estimatedImplementationMonths:
      input.estimatedImplementationMonths ??
      existing?.estimatedImplementationMonths ??
      defaults?.estimatedImplementationMonths ??
      IMPLEMENTATION_MONTH_DEFAULTS[input.projectType],
    confidenceBand:
      input.confidenceBand ??
      existing?.confidenceBand ??
      defaults?.confidenceBand ??
      "LOW",
    sourceMetadata: sourceMetadata as Prisma.InputJsonValue,
  } satisfies Prisma.RetrofitCandidateUncheckedCreateInput;

  if (existing) {
    return prisma.retrofitCandidate.update({
      where: { id: existing.id },
      data,
      select: retrofitCandidateListSelect,
    });
  }

  return prisma.retrofitCandidate.create({
    data,
    select: retrofitCandidateListSelect,
  });
}

export async function rankRetrofitCandidatesForBuilding(params: {
  organizationId: string;
  buildingId: string;
  includeArchived?: boolean;
  limit?: number;
  now?: Date;
}) {
  const [candidates, contexts] = await Promise.all([
    listRetrofitCandidates({
      organizationId: params.organizationId,
      buildingId: params.buildingId,
      includeArchived: params.includeArchived,
      limit: params.limit,
    }),
    buildRankingContexts({
      organizationId: params.organizationId,
      buildingIds: [params.buildingId],
    }),
  ]);

  const context = contexts.get(params.buildingId);
  if (!context) {
    return [];
  }

  return candidates
    .map((candidate) =>
      rankRetrofitCandidateData({
        candidate,
        context,
        now: params.now,
      }),
    )
    .sort((left, right) => {
      if (right.priorityScore !== left.priorityScore) {
        return right.priorityScore - left.priorityScore;
      }
      if ((right.estimatedAvoidedPenalty ?? 0) !== (left.estimatedAvoidedPenalty ?? 0)) {
        return (right.estimatedAvoidedPenalty ?? 0) - (left.estimatedAvoidedPenalty ?? 0);
      }
      return left.name.localeCompare(right.name);
    });
}

export async function rankRetrofitCandidatesAcrossPortfolio(params: {
  organizationId: string;
  buildingId?: string;
  includeArchived?: boolean;
  limit?: number;
  now?: Date;
}) {
  const candidates = await listRetrofitCandidates({
    organizationId: params.organizationId,
    buildingId: params.buildingId,
    includeArchived: params.includeArchived,
    limit: params.limit ? Math.max(params.limit * 4, 50) : 200,
  });
  const buildingIds = Array.from(new Set(candidates.map((candidate) => candidate.buildingId)));
  const contexts = await buildRankingContexts({
    organizationId: params.organizationId,
    buildingIds,
  });

  return candidates
    .map((candidate) => {
      const context = contexts.get(candidate.buildingId);
      if (!context) {
        return null;
      }

      return rankRetrofitCandidateData({
        candidate,
        context,
        now: params.now,
      });
    })
    .filter((entry): entry is RetrofitCandidateRanking => entry != null)
    .sort((left, right) => {
      if (right.priorityScore !== left.priorityScore) {
        return right.priorityScore - left.priorityScore;
      }
      if ((right.estimatedAvoidedPenalty ?? 0) !== (left.estimatedAvoidedPenalty ?? 0)) {
        return (right.estimatedAvoidedPenalty ?? 0) - (left.estimatedAvoidedPenalty ?? 0);
      }
      return left.candidateId.localeCompare(right.candidateId);
    })
    .slice(0, params.limit ?? 100);
}

function emptyRetrofitOpportunitySummary(): BuildingRetrofitOpportunitySummary {
  return {
    activeCount: 0,
    highestPriorityBand: null,
    topOpportunity: null,
    opportunities: [],
  };
}

export async function listBuildingRetrofitOpportunitySummaries(params: {
  organizationId: string;
  buildingIds: string[];
  topLimit?: number;
}) {
  const buildingIds = Array.from(new Set(params.buildingIds)).filter(Boolean);
  if (buildingIds.length === 0) {
    return new Map<string, BuildingRetrofitOpportunitySummary>();
  }

  const candidates = await prisma.retrofitCandidate.findMany({
    where: {
      organizationId: params.organizationId,
      buildingId: { in: buildingIds },
      status: "ACTIVE",
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: retrofitCandidateListSelect,
  });
  const contexts = await buildRankingContexts({
    organizationId: params.organizationId,
    buildingIds,
  });

  const rankingsByBuilding = new Map<string, RetrofitCandidateRanking[]>();
  for (const candidate of candidates) {
    const context = contexts.get(candidate.buildingId);
    if (!context) {
      continue;
    }

    const ranked = rankRetrofitCandidateData({ candidate, context });
    const existing = rankingsByBuilding.get(candidate.buildingId) ?? [];
    existing.push(ranked);
    rankingsByBuilding.set(candidate.buildingId, existing);
  }

  return new Map(
    buildingIds.map((buildingId) => {
      const rankings = (rankingsByBuilding.get(buildingId) ?? []).sort((left, right) => {
        if (right.priorityScore !== left.priorityScore) {
          return right.priorityScore - left.priorityScore;
        }
        return (right.estimatedAvoidedPenalty ?? 0) - (left.estimatedAvoidedPenalty ?? 0);
      });

      return [
        buildingId,
        rankings.length === 0
          ? emptyRetrofitOpportunitySummary()
          : {
              activeCount: rankings.length,
              highestPriorityBand: rankings[0]?.priorityBand ?? null,
              topOpportunity: rankings[0] ?? null,
              opportunities: rankings.slice(0, params.topLimit ?? 3),
            },
      ] satisfies [string, BuildingRetrofitOpportunitySummary];
    }),
  );
}

export async function getBuildingRetrofitOpportunitySummary(params: {
  organizationId: string;
  buildingId: string;
  topLimit?: number;
}) {
  const summaries = await listBuildingRetrofitOpportunitySummaries({
    organizationId: params.organizationId,
    buildingIds: [params.buildingId],
    topLimit: params.topLimit,
  });

  return summaries.get(params.buildingId) ?? emptyRetrofitOpportunitySummary();
}

export async function getRetrofitCandidateRankingDetail(params: {
  organizationId: string;
  candidateId: string;
  now?: Date;
}) {
  const candidate = await prisma.retrofitCandidate.findFirst({
    where: {
      id: params.candidateId,
      organizationId: params.organizationId,
    },
    select: retrofitCandidateListSelect,
  });

  if (!candidate) {
    return null;
  }

  const contexts = await buildRankingContexts({
    organizationId: params.organizationId,
    buildingIds: [candidate.buildingId],
  });
  const context = contexts.get(candidate.buildingId);
  if (!context) {
    return null;
  }

  return rankRetrofitCandidateData({
    candidate,
    context,
    now: params.now,
  });
}
