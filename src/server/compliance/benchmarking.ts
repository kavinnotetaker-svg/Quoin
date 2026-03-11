import type {
  ActorType,
  BenchmarkSubmissionStatus,
  EspmShareStatus,
  EvidenceArtifactType,
} from "@/generated/prisma/client";
import { prisma } from "@/server/lib/db";
import {
  BOOTSTRAP_FACTOR_SET_KEY,
  BOOTSTRAP_RULE_PACKAGE_KEYS,
  type EvidenceArtifactDraft,
  getActiveFactorSetVersion,
  getActiveRuleVersion,
  recordComplianceEvaluation,
  upsertBenchmarkSubmissionRecord,
} from "./provenance";

export const BENCHMARK_FINDING_CODES = {
  missingPropertyId: "MISSING_PROPERTY_ID",
  missingCoverage: "MISSING_COVERAGE",
  overlappingBills: "OVERLAPPING_BILLS",
  pmNotShared: "PM_NOT_SHARED",
  dqcStale: "DQC_STALE",
  verificationRequired: "VERIFICATION_REQUIRED",
  verificationEvidenceMissing: "VERIFICATION_EVIDENCE_MISSING",
  gfaEvidenceMissing: "GFA_EVIDENCE_MISSING",
} as const;

export type BenchmarkFindingCode =
  (typeof BENCHMARK_FINDING_CODES)[keyof typeof BENCHMARK_FINDING_CODES];

export interface BenchmarkReadingInput {
  meterId?: string | null;
  meterType: string;
  source: string;
  periodStart: Date;
  periodEnd: Date;
}

export interface BenchmarkBuildingInput {
  id: string;
  organizationId: string;
  grossSquareFeet: number;
  doeeBuildingId: string | null;
  espmPropertyId: bigint | number | null;
  espmShareStatus: EspmShareStatus;
}

export interface BenchmarkEvidenceInput {
  id: string;
  artifactType: EvidenceArtifactType;
  name: string;
  artifactRef: string | null;
  createdAt: Date;
  metadata: Record<string, unknown> | null;
  benchmarkSubmission: {
    id: string;
    reportingYear: number;
  } | null;
}

export interface BenchmarkRuleConfig {
  propertyIdPattern?: string | null;
  dqcFreshnessDays?: number | null;
  verification?: {
    minimumGrossSquareFeet?: number | null;
    requiredReportingYears?: number[] | null;
    evidenceKind?: string | null;
  } | null;
  gfaCorrection?: {
    evidenceKind?: string | null;
  } | null;
}

export interface BenchmarkFactorConfig {
  dqcFreshnessDays?: number | null;
}

export interface BenchmarkSubmissionContext {
  id?: string;
  status?: string;
  gfaCorrectionRequired?: boolean;
}

export interface BenchmarkFinding {
  code: BenchmarkFindingCode;
  status: "PASS" | "FAIL";
  severity: "INFO" | "ERROR";
  message: string;
  metadata?: Record<string, unknown>;
}

export interface BenchmarkReadinessResult {
  reportingYear: number;
  evaluatedAt: string;
  status: "READY" | "BLOCKED";
  blocking: boolean;
  reasonCodes: BenchmarkFindingCode[];
  findings: BenchmarkFinding[];
  summary: {
    coverageComplete: boolean;
    missingCoverageStreams: string[];
    overlapStreams: string[];
    propertyIdState: "PRESENT" | "MISSING" | "INVALID";
    pmShareState: "READY" | "NOT_READY";
    dqcFreshnessState: "FRESH" | "STALE" | "MISSING";
    verificationRequired: boolean;
    verificationEvidencePresent: boolean;
    gfaEvidenceRequired: boolean;
    gfaEvidencePresent: boolean;
  };
}

interface CoverageIssue {
  streamKey: string;
  start: string;
  end: string;
  days: number;
}

interface CoverageSummary {
  coverageComplete: boolean;
  missingCoverageStreams: string[];
  overlapStreams: string[];
  gapDetails: CoverageIssue[];
  overlapDetails: CoverageIssue[];
  streamCoverage: Array<{
    streamKey: string;
    firstStart: string | null;
    lastEnd: string | null;
    readingCount: number;
  }>;
}

function toUtcDateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function daysBetweenInclusive(start: Date, end: Date) {
  return Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

function buildStreamKey(reading: BenchmarkReadingInput) {
  return reading.meterId ? `meter:${reading.meterId}` : `meterType:${reading.meterType}`;
}

function getNestedObject(value: Record<string, unknown> | null | undefined, key: string) {
  const nested = value?.[key];
  if (!nested || typeof nested !== "object" || Array.isArray(nested)) {
    return null;
  }

  return nested as Record<string, unknown>;
}

function normalizeRuleConfig(config: Record<string, unknown>): BenchmarkRuleConfig {
  const requirements = getNestedObject(config, "requirements");
  return (requirements ?? config) as BenchmarkRuleConfig;
}

function normalizeFactorConfig(config: Record<string, unknown>): BenchmarkFactorConfig {
  const benchmarking = getNestedObject(config, "benchmarking");
  return (benchmarking ?? config) as BenchmarkFactorConfig;
}

function extractBenchmarkingMetadata(metadata: Record<string, unknown> | null | undefined) {
  const benchmarking = getNestedObject(metadata, "benchmarking");
  return benchmarking ?? metadata ?? {};
}

function extractEvidenceKind(evidence: BenchmarkEvidenceInput) {
  const metadata = extractBenchmarkingMetadata(evidence.metadata);
  const rawKind = metadata["kind"];
  return typeof rawKind === "string" ? rawKind : null;
}

function extractEvidenceReportingYear(evidence: BenchmarkEvidenceInput) {
  if (evidence.benchmarkSubmission?.reportingYear != null) {
    return evidence.benchmarkSubmission.reportingYear;
  }

  const metadata = extractBenchmarkingMetadata(evidence.metadata);
  const rawYear = metadata["reportingYear"];
  return typeof rawYear === "number" ? rawYear : null;
}

function extractEvidenceTimestamp(evidence: BenchmarkEvidenceInput) {
  const metadata = extractBenchmarkingMetadata(evidence.metadata);
  const rawCheckedAt = metadata["checkedAt"];
  if (typeof rawCheckedAt === "string") {
    const parsed = new Date(rawCheckedAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return evidence.createdAt;
}

function summarizeCoverage(readings: BenchmarkReadingInput[], reportingYear: number): CoverageSummary {
  const yearStart = new Date(Date.UTC(reportingYear, 0, 1));
  const yearEnd = new Date(Date.UTC(reportingYear, 11, 31));

  if (readings.length === 0) {
    return {
      coverageComplete: false,
      missingCoverageStreams: ["all"],
      overlapStreams: [],
      gapDetails: [
        {
          streamKey: "all",
          start: yearStart.toISOString(),
          end: yearEnd.toISOString(),
          days: daysBetweenInclusive(yearStart, yearEnd),
        },
      ],
      overlapDetails: [],
      streamCoverage: [],
    };
  }

  const grouped = new Map<string, BenchmarkReadingInput[]>();
  for (const reading of readings) {
    const streamKey = buildStreamKey(reading);
    const existing = grouped.get(streamKey) ?? [];
    existing.push(reading);
    grouped.set(streamKey, existing);
  }

  const missingCoverageStreams = new Set<string>();
  const overlapStreams = new Set<string>();
  const gapDetails: CoverageIssue[] = [];
  const overlapDetails: CoverageIssue[] = [];
  const streamCoverage: CoverageSummary["streamCoverage"] = [];

  for (const [streamKey, streamReadings] of Array.from(grouped.entries())) {
    const sorted = [...streamReadings].sort(
      (a, b) => a.periodStart.getTime() - b.periodStart.getTime(),
    );

    let cursor = yearStart;
    for (const reading of sorted) {
      const rawStart = toUtcDateOnly(reading.periodStart);
      const rawEnd = toUtcDateOnly(reading.periodEnd);
      const start = rawStart < yearStart ? yearStart : rawStart;
      const end = rawEnd > yearEnd ? yearEnd : rawEnd;

      if (start > cursor) {
        missingCoverageStreams.add(streamKey);
        gapDetails.push({
          streamKey,
          start: cursor.toISOString(),
          end: addUtcDays(start, -1).toISOString(),
          days: daysBetweenInclusive(cursor, addUtcDays(start, -1)),
        });
      }

      if (start <= addUtcDays(cursor, -1)) {
        overlapStreams.add(streamKey);
        overlapDetails.push({
          streamKey,
          start: start.toISOString(),
          end: end.toISOString(),
          days: daysBetweenInclusive(start, end),
        });
      }

      const nextCursor = addUtcDays(end, 1);
      if (nextCursor > cursor) {
        cursor = nextCursor;
      }
    }

    if (cursor <= yearEnd) {
      missingCoverageStreams.add(streamKey);
      gapDetails.push({
        streamKey,
        start: cursor.toISOString(),
        end: yearEnd.toISOString(),
        days: daysBetweenInclusive(cursor, yearEnd),
      });
    }

    streamCoverage.push({
      streamKey,
      firstStart: sorted[0] ? toUtcDateOnly(sorted[0].periodStart).toISOString() : null,
      lastEnd: sorted.at(-1) ? toUtcDateOnly(sorted.at(-1)!.periodEnd).toISOString() : null,
      readingCount: sorted.length,
    });
  }

  return {
    coverageComplete: missingCoverageStreams.size === 0 && overlapStreams.size === 0,
    missingCoverageStreams: Array.from(missingCoverageStreams),
    overlapStreams: Array.from(overlapStreams),
    gapDetails,
    overlapDetails,
    streamCoverage,
  };
}

function evaluatePropertyId(
  building: BenchmarkBuildingInput,
  ruleConfig: BenchmarkRuleConfig,
): {
  state: "PRESENT" | "MISSING" | "INVALID";
  finding: BenchmarkFinding;
} {
  const propertyId = building.doeeBuildingId?.trim() ?? "";
  const pattern = ruleConfig.propertyIdPattern ? new RegExp(ruleConfig.propertyIdPattern) : null;

  if (!propertyId) {
    return {
      state: "MISSING",
      finding: {
        code: BENCHMARK_FINDING_CODES.missingPropertyId,
        status: "FAIL",
        severity: "ERROR",
        message: "DC Real Property Unique ID is missing.",
      },
    };
  }

  if (pattern && !pattern.test(propertyId)) {
    return {
      state: "INVALID",
      finding: {
        code: BENCHMARK_FINDING_CODES.missingPropertyId,
        status: "FAIL",
        severity: "ERROR",
        message: "DC Real Property Unique ID is present but does not match the configured format.",
        metadata: {
          propertyId,
          pattern: ruleConfig.propertyIdPattern,
        },
      },
    };
  }

  return {
    state: "PRESENT",
    finding: {
      code: BENCHMARK_FINDING_CODES.missingPropertyId,
      status: "PASS",
      severity: "INFO",
      message: "DC Real Property Unique ID is present.",
      metadata: {
        propertyId,
      },
    },
  };
}

function evaluatePmShare(building: BenchmarkBuildingInput): {
  state: "READY" | "NOT_READY";
  finding: BenchmarkFinding;
} {
  if (!building.espmPropertyId || building.espmShareStatus !== "LINKED") {
    return {
      state: "NOT_READY",
      finding: {
        code: BENCHMARK_FINDING_CODES.pmNotShared,
        status: "FAIL",
        severity: "ERROR",
        message: "ENERGY STAR Portfolio Manager sharing/exchange is not ready.",
        metadata: {
          espmPropertyId: building.espmPropertyId ? String(building.espmPropertyId) : null,
          espmShareStatus: building.espmShareStatus,
        },
      },
    };
  }

  return {
    state: "READY",
    finding: {
      code: BENCHMARK_FINDING_CODES.pmNotShared,
      status: "PASS",
      severity: "INFO",
      message: "ENERGY STAR Portfolio Manager sharing/exchange is ready.",
      metadata: {
        espmPropertyId: String(building.espmPropertyId),
        espmShareStatus: building.espmShareStatus,
      },
    },
  };
}

function determineVerificationRequirement(
  building: BenchmarkBuildingInput,
  reportingYear: number,
  ruleConfig: BenchmarkRuleConfig,
) {
  const minimumGrossSquareFeet = ruleConfig.verification?.minimumGrossSquareFeet ?? 0;
  const requiredReportingYears = ruleConfig.verification?.requiredReportingYears ?? [];

  return (
    requiredReportingYears.includes(reportingYear) &&
    building.grossSquareFeet >= minimumGrossSquareFeet
  );
}

function findEvidenceForYear(
  evidenceArtifacts: BenchmarkEvidenceInput[],
  reportingYear: number,
  kind: string,
) {
  return evidenceArtifacts.filter((artifact) => {
    return (
      extractEvidenceKind(artifact) === kind &&
      extractEvidenceReportingYear(artifact) === reportingYear
    );
  });
}

export function evaluateBenchmarkReadinessData(input: {
  building: BenchmarkBuildingInput;
  readings: BenchmarkReadingInput[];
  evidenceArtifacts: BenchmarkEvidenceInput[];
  reportingYear: number;
  ruleConfig?: BenchmarkRuleConfig;
  factorConfig?: BenchmarkFactorConfig;
  submissionContext?: BenchmarkSubmissionContext | null;
  evaluatedAt?: Date;
}): BenchmarkReadinessResult {
  const evaluatedAt = input.evaluatedAt ?? new Date();
  const ruleConfig = input.ruleConfig ?? {};
  const factorConfig = input.factorConfig ?? {};
  const coverage = summarizeCoverage(input.readings, input.reportingYear);
  const propertyId = evaluatePropertyId(input.building, ruleConfig);
  const pmShare = evaluatePmShare(input.building);
  const dqcFreshnessDays = factorConfig.dqcFreshnessDays ?? ruleConfig.dqcFreshnessDays ?? 30;
  const dqcArtifacts = findEvidenceForYear(input.evidenceArtifacts, input.reportingYear, "DQC_REPORT");
  const freshestDqc = dqcArtifacts
    .map((artifact) => extractEvidenceTimestamp(artifact))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const dqcState =
    !freshestDqc
      ? "MISSING"
      : addUtcDays(freshestDqc, dqcFreshnessDays) < evaluatedAt
        ? "STALE"
        : "FRESH";
  const verificationRequired = determineVerificationRequirement(
    input.building,
    input.reportingYear,
    ruleConfig,
  );
  const verificationEvidenceKind = ruleConfig.verification?.evidenceKind ?? "VERIFICATION";
  const verificationArtifacts = findEvidenceForYear(
    input.evidenceArtifacts,
    input.reportingYear,
    verificationEvidenceKind,
  );
  const verificationEvidencePresent = verificationArtifacts.length > 0;
  const gfaEvidenceKind = ruleConfig.gfaCorrection?.evidenceKind ?? "GFA_CORRECTION";
  const gfaCorrectionRequired = input.submissionContext?.gfaCorrectionRequired ?? false;
  const gfaArtifacts = findEvidenceForYear(input.evidenceArtifacts, input.reportingYear, gfaEvidenceKind);
  const gfaEvidencePresent = gfaArtifacts.length > 0;

  const findings: BenchmarkFinding[] = [];

  findings.push(propertyId.finding);

  if (coverage.missingCoverageStreams.length > 0) {
    findings.push({
      code: BENCHMARK_FINDING_CODES.missingCoverage,
      status: "FAIL",
      severity: "ERROR",
      message: "Utility data does not fully cover the reporting year without gaps.",
      metadata: {
        missingCoverageStreams: coverage.missingCoverageStreams,
        gapDetails: coverage.gapDetails,
      },
    });
  } else {
    findings.push({
      code: BENCHMARK_FINDING_CODES.missingCoverage,
      status: "PASS",
      severity: "INFO",
      message: "Utility data covers the full reporting year.",
      metadata: {
        streamCoverage: coverage.streamCoverage,
      },
    });
  }

  if (coverage.overlapStreams.length > 0) {
    findings.push({
      code: BENCHMARK_FINDING_CODES.overlappingBills,
      status: "FAIL",
      severity: "ERROR",
      message: "Overlapping billing periods were detected in utility data.",
      metadata: {
        overlapStreams: coverage.overlapStreams,
        overlapDetails: coverage.overlapDetails,
      },
    });
  } else {
    findings.push({
      code: BENCHMARK_FINDING_CODES.overlappingBills,
      status: "PASS",
      severity: "INFO",
      message: "No overlapping billing periods were detected.",
    });
  }

  findings.push(pmShare.finding);

  if (dqcState === "FRESH") {
    findings.push({
      code: BENCHMARK_FINDING_CODES.dqcStale,
      status: "PASS",
      severity: "INFO",
      message: "Data Quality Checker evidence is fresh enough for submission.",
      metadata: {
        checkedAt: freshestDqc?.toISOString() ?? null,
        freshnessDays: dqcFreshnessDays,
      },
    });
  } else {
    findings.push({
      code: BENCHMARK_FINDING_CODES.dqcStale,
      status: "FAIL",
      severity: "ERROR",
      message:
        dqcState === "MISSING"
          ? "Data Quality Checker evidence is missing."
          : "Data Quality Checker evidence is stale.",
      metadata: {
        checkedAt: freshestDqc?.toISOString() ?? null,
        freshnessDays: dqcFreshnessDays,
      },
    });
  }

  findings.push({
    code: BENCHMARK_FINDING_CODES.verificationRequired,
    status: "PASS",
    severity: "INFO",
    message: verificationRequired
      ? "Third-party verification is required for this building/year."
      : "Third-party verification is not required for this building/year.",
    metadata: {
      reportingYear: input.reportingYear,
      grossSquareFeet: input.building.grossSquareFeet,
      minimumGrossSquareFeet: ruleConfig.verification?.minimumGrossSquareFeet ?? null,
      requiredReportingYears: ruleConfig.verification?.requiredReportingYears ?? [],
    },
  });

  if (verificationRequired && !verificationEvidencePresent) {
    findings.push({
      code: BENCHMARK_FINDING_CODES.verificationEvidenceMissing,
      status: "FAIL",
      severity: "ERROR",
      message: "Required third-party verification evidence is missing.",
      metadata: {
        evidenceKind: verificationEvidenceKind,
      },
    });
  } else {
    findings.push({
      code: BENCHMARK_FINDING_CODES.verificationEvidenceMissing,
      status: "PASS",
      severity: "INFO",
      message: verificationRequired
        ? "Required verification evidence is present."
        : "Verification evidence is not required.",
      metadata: {
        evidenceKind: verificationEvidenceKind,
      },
    });
  }

  if (gfaCorrectionRequired && !gfaEvidencePresent) {
    findings.push({
      code: BENCHMARK_FINDING_CODES.gfaEvidenceMissing,
      status: "FAIL",
      severity: "ERROR",
      message: "Gross floor area correction evidence is required but missing.",
      metadata: {
        evidenceKind: gfaEvidenceKind,
      },
    });
  } else {
    findings.push({
      code: BENCHMARK_FINDING_CODES.gfaEvidenceMissing,
      status: "PASS",
      severity: "INFO",
      message: gfaCorrectionRequired
        ? "Gross floor area correction evidence is present."
        : "Gross floor area correction evidence is not required.",
      metadata: {
        evidenceKind: gfaEvidenceKind,
      },
    });
  }

  const blockingFindings = findings.filter((finding) => finding.status === "FAIL");
  const reasonCodes = blockingFindings.map((finding) => finding.code);

  return {
    reportingYear: input.reportingYear,
    evaluatedAt: evaluatedAt.toISOString(),
    status: blockingFindings.length > 0 ? "BLOCKED" : "READY",
    blocking: blockingFindings.length > 0,
    reasonCodes,
    findings,
    summary: {
      coverageComplete: coverage.coverageComplete,
      missingCoverageStreams: coverage.missingCoverageStreams,
      overlapStreams: coverage.overlapStreams,
      propertyIdState: propertyId.state,
      pmShareState: pmShare.state,
      dqcFreshnessState: dqcState,
      verificationRequired,
      verificationEvidencePresent,
      gfaEvidenceRequired: gfaCorrectionRequired,
      gfaEvidencePresent,
    },
  };
}

function toJsonObject(value: unknown): Record<string, unknown> {
  return (value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}) as Record<string, unknown>;
}

export async function evaluateBenchmarkingReadiness(params: {
  organizationId: string;
  buildingId: string;
  reportingYear: number;
  submissionContext?: BenchmarkSubmissionContext | null;
  producedByType: ActorType;
  producedById?: string | null;
}) {
  const [building, readings, evidenceArtifacts, activeRuleVersion, activeFactorSetVersion] =
    await Promise.all([
      prisma.building.findFirst({
        where: {
          id: params.buildingId,
          organizationId: params.organizationId,
        },
        select: {
          id: true,
          organizationId: true,
          grossSquareFeet: true,
          doeeBuildingId: true,
          espmPropertyId: true,
          espmShareStatus: true,
        },
      }),
      prisma.energyReading.findMany({
        where: {
          buildingId: params.buildingId,
          organizationId: params.organizationId,
          periodEnd: {
            gte: new Date(Date.UTC(params.reportingYear, 0, 1)),
          },
          periodStart: {
            lte: new Date(Date.UTC(params.reportingYear, 11, 31)),
          },
        },
        orderBy: [{ periodStart: "asc" }, { periodEnd: "asc" }],
        select: {
          meterId: true,
          meterType: true,
          source: true,
          periodStart: true,
          periodEnd: true,
        },
      }),
      prisma.evidenceArtifact.findMany({
        where: {
          organizationId: params.organizationId,
          buildingId: params.buildingId,
        },
        include: {
          benchmarkSubmission: {
            select: {
              id: true,
              reportingYear: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      getActiveRuleVersion(BOOTSTRAP_RULE_PACKAGE_KEYS.benchmarking2025),
      getActiveFactorSetVersion(BOOTSTRAP_FACTOR_SET_KEY),
    ]);

  if (!building) {
    throw new Error("Building not found for benchmarking readiness");
  }

  const ruleConfig = normalizeRuleConfig(toJsonObject(activeRuleVersion.configJson));
  const factorConfig = normalizeFactorConfig(toJsonObject(activeFactorSetVersion.factorsJson));
  const readiness = evaluateBenchmarkReadinessData({
    building,
    readings,
    evidenceArtifacts: evidenceArtifacts.map((artifact) => ({
      id: artifact.id,
      artifactType: artifact.artifactType,
      name: artifact.name,
      artifactRef: artifact.artifactRef,
      createdAt: artifact.createdAt,
      metadata: toJsonObject(artifact.metadata),
      benchmarkSubmission: artifact.benchmarkSubmission,
    })),
    reportingYear: params.reportingYear,
    ruleConfig,
    factorConfig,
    submissionContext: params.submissionContext ?? null,
  });

  const provenance = await recordComplianceEvaluation({
    organizationId: params.organizationId,
    buildingId: params.buildingId,
    ruleVersionId: activeRuleVersion.id,
    factorSetVersionId: activeFactorSetVersion.id,
    runType: "BENCHMARKING_EVALUATION",
    status: "SUCCEEDED",
    inputSnapshotRef: `benchmarking:${params.reportingYear}`,
    inputSnapshotPayload: {
      reportingYear: params.reportingYear,
      building,
      submissionContext: params.submissionContext ?? null,
      readings,
      evidenceArtifactIds: evidenceArtifacts.map((artifact) => artifact.id),
    },
    resultPayload: {
      readiness,
    },
    producedByType: params.producedByType,
    producedById: params.producedById ?? null,
    manifest: {
      implementationKey: "benchmarking/readiness-v1",
      payload: {
        rulePackageKey: BOOTSTRAP_RULE_PACKAGE_KEYS.benchmarking2025,
        factorSetKey: BOOTSTRAP_FACTOR_SET_KEY,
        reportingYear: params.reportingYear,
      },
    },
    evidenceArtifacts: [
      {
        artifactType: "CALCULATION_OUTPUT",
        name: `Benchmark readiness result ${params.reportingYear}`,
        artifactRef: `benchmarking_readiness:${params.reportingYear}`,
        metadata: {
          benchmarking: {
            kind: "READINESS_RESULT",
            reportingYear: params.reportingYear,
            status: readiness.status,
            reasonCodes: readiness.reasonCodes,
          },
        },
      },
    ],
  });

  return {
    readiness,
    provenance,
    ruleVersion: activeRuleVersion,
    factorSetVersion: activeFactorSetVersion,
  };
}

export async function evaluateAndUpsertBenchmarkSubmission(params: {
  organizationId: string;
  buildingId: string;
  reportingYear: number;
  submissionContext?: BenchmarkSubmissionContext | null;
  explicitStatus?: BenchmarkSubmissionStatus | null;
  submittedAt?: Date | null;
  producedByType: ActorType;
  producedById?: string | null;
  additionalSubmissionPayload?: Record<string, unknown>;
  evidenceArtifacts?: EvidenceArtifactDraft[];
}) {
  const evaluation = await evaluateBenchmarkingReadiness({
    organizationId: params.organizationId,
    buildingId: params.buildingId,
    reportingYear: params.reportingYear,
    submissionContext: params.submissionContext ?? null,
    producedByType: params.producedByType,
    producedById: params.producedById ?? null,
  });

  const derivedStatus = evaluation.readiness.status === "READY" ? "READY" : "BLOCKED";
  const status = params.explicitStatus ?? derivedStatus;
  const submissionPayload = {
    readiness: evaluation.readiness,
    ...(params.additionalSubmissionPayload ?? {}),
    ...(params.submissionContext?.gfaCorrectionRequired !== undefined
      ? {
          benchmarkingContext: {
            gfaCorrectionRequired: params.submissionContext.gfaCorrectionRequired,
          },
        }
      : {}),
  };

  const benchmarkSubmission = await upsertBenchmarkSubmissionRecord({
    organizationId: params.organizationId,
    buildingId: params.buildingId,
    reportingYear: params.reportingYear,
    ruleVersionId: evaluation.ruleVersion.id,
    factorSetVersionId: evaluation.factorSetVersion.id,
    complianceRunId: evaluation.provenance.complianceRun.id,
    status,
    readinessEvaluatedAt: new Date(evaluation.readiness.evaluatedAt),
    submissionPayload,
    submittedAt: params.submittedAt ?? null,
    createdByType: params.producedByType,
    createdById: params.producedById ?? null,
    evidenceArtifacts: params.evidenceArtifacts,
  });

  return {
    benchmarkSubmission,
    readiness: evaluation.readiness,
    provenance: evaluation.provenance,
  };
}
