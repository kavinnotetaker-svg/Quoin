import type {
  BenchmarkSubmissionStatus,
  ComplianceCycle,
  FilingPacketStatus,
  FilingStatus,
  PortfolioManagerSyncStatus,
  Prisma,
} from "@/generated/prisma/client";
import { prisma } from "@/server/lib/db";

export const PORTFOLIO_RISK_REASON_CODES = {
  benchmarkingSubmissionMissing: "BENCHMARKING_SUBMISSION_MISSING",
  benchmarkingBlocked: "BENCHMARKING_BLOCKED",
  benchmarkingOverdue: "BENCHMARKING_OVERDUE",
  benchmarkingEvidenceMissing: "BENCHMARKING_EVIDENCE_MISSING",
  pmSyncMissing: "PM_SYNC_MISSING",
  pmSyncFailed: "PM_SYNC_FAILED",
  pmSyncPartial: "PM_SYNC_PARTIAL",
  pmSyncStale: "PM_SYNC_STALE",
  pmPropertyLinkageIssue: "PM_PROPERTY_LINKAGE_ISSUE",
  pmCoverageIssue: "PM_COVERAGE_ISSUE",
  pmSharingIssue: "PM_SHARING_ISSUE",
  bepsEvaluationMissing: "BEPS_EVALUATION_MISSING",
  bepsNonCompliant: "BEPS_NON_COMPLIANT",
  bepsPendingData: "BEPS_PENDING_DATA",
  likelyAcpExposure: "LIKELY_ACP_EXPOSURE",
  maxPenaltyOverride: "MAX_PENALTY_OVERRIDE_RISK",
  filingEvidenceMissing: "FILING_EVIDENCE_MISSING",
  filingPacketMissing: "FILING_PACKET_MISSING",
  filingPacketStale: "FILING_PACKET_STALE",
  filingPacketNotFinalized: "FILING_PACKET_NOT_FINALIZED",
  filingRejected: "FILING_REJECTED",
  bepsFilingDue: "BEPS_FILING_DUE",
} as const;

export type PortfolioRiskReasonCode =
  (typeof PORTFOLIO_RISK_REASON_CODES)[keyof typeof PORTFOLIO_RISK_REASON_CODES];

export type PortfolioRiskCategory =
  | "BENCHMARKING"
  | "BEPS"
  | "SYNC"
  | "EVIDENCE"
  | "FILING"
  | "OPERATIONS";

export type PortfolioRiskUrgencyLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface PortfolioRiskSourceRef {
  recordType:
    | "BUILDING"
    | "BENCHMARK_SUBMISSION"
    | "COMPLIANCE_RUN"
    | "FILING_RECORD"
    | "FILING_PACKET"
    | "PORTFOLIO_MANAGER_SYNC_STATE";
  recordId: string;
  label: string;
}

export interface PortfolioRiskContribution {
  code: PortfolioRiskReasonCode;
  riskCategory: PortfolioRiskCategory;
  riskScore: number;
  urgencyLevel: PortfolioRiskUrgencyLevel;
  blocking: boolean;
  message: string;
  recommendedNextAction: string;
  estimatedExposure: number | null;
  sourceRefs: PortfolioRiskSourceRef[];
}

export interface BuildingPortfolioRiskSummary {
  buildingId: string;
  organizationId: string;
  complianceCycle: ComplianceCycle | null;
  riskCategory: PortfolioRiskCategory;
  riskScore: number;
  urgencyLevel: PortfolioRiskUrgencyLevel;
  estimatedExposure: number | null;
  blockingReasons: PortfolioRiskReasonCode[];
  recommendedNextAction: string;
  sourceRefs: PortfolioRiskSourceRef[];
  riskBreakdown: Record<PortfolioRiskCategory, number>;
  contributions: PortfolioRiskContribution[];
  sourceSummary: {
    benchmarkSubmissionId: string | null;
    filingRecordId: string | null;
    filingPacketId: string | null;
    complianceRunId: string | null;
    portfolioManagerSyncStateId: string | null;
  };
}

export interface PortfolioRiskActionItem {
  buildingId: string;
  organizationId: string;
  complianceCycle: ComplianceCycle | null;
  riskCategory: PortfolioRiskCategory;
  riskScore: number;
  urgencyLevel: PortfolioRiskUrgencyLevel;
  estimatedExposure: number | null;
  reasonCode: PortfolioRiskReasonCode;
  message: string;
  recommendedNextAction: string;
  sourceRefs: PortfolioRiskSourceRef[];
}

export interface PortfolioRiskAggregateSummary {
  organizationId: string;
  evaluatedAt: string;
  totals: {
    buildingsReady: number;
    buildingsBlocked: number;
    buildingsAtHighRisk: number;
    buildingsWithStaleSyncData: number;
    buildingsWithLikelyAcpExposure: number;
    buildingsNeedingVerificationEvidenceFinalization: number;
    totalEstimatedExposure: number;
  };
}

type BuildingRiskContext = {
  building: {
    id: string;
    organizationId: string;
    name: string;
    complianceCycle: ComplianceCycle;
    espmPropertyId: bigint | null;
    espmShareStatus: string;
    maxPenaltyExposure: number;
  };
  benchmarkSubmission: null | {
    id: string;
    reportingYear: number;
    status: BenchmarkSubmissionStatus;
    submissionPayload: unknown;
    complianceRunId: string | null;
  };
  filingRecord: null | {
    id: string;
    filingYear: number | null;
    complianceCycle: ComplianceCycle | null;
    status: FilingStatus;
    filingPayload: unknown;
    complianceRunId: string | null;
    evidenceArtifacts: Array<{ id: string }>;
    packets: Array<{
      id: string;
      status: FilingPacketStatus;
      packetPayload: unknown;
      version: number;
      finalizedAt: Date | null;
    }>;
  };
  syncState: null | {
    id: string;
    status: PortfolioManagerSyncStatus;
    lastSuccessfulSyncAt: Date | null;
    qaPayload: unknown;
  };
};

const CATEGORY_PRIORITY: PortfolioRiskCategory[] = [
  "BEPS",
  "BENCHMARKING",
  "SYNC",
  "EVIDENCE",
  "FILING",
  "OPERATIONS",
];

const STALE_SYNC_REASON_CODES = new Set<PortfolioRiskReasonCode>([
  PORTFOLIO_RISK_REASON_CODES.pmSyncMissing,
  PORTFOLIO_RISK_REASON_CODES.pmSyncFailed,
  PORTFOLIO_RISK_REASON_CODES.pmSyncPartial,
  PORTFOLIO_RISK_REASON_CODES.pmSyncStale,
]);

const URGENCY_RANK: Record<PortfolioRiskUrgencyLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getStringArray(value: unknown): string[] {
  return toArray(value).filter((entry): entry is string => typeof entry === "string");
}

function getNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getPacketWarnings(packetPayload: unknown) {
  return toArray(toRecord(packetPayload)["warnings"]).map((warning) => toRecord(warning));
}

function getBenchmarkReadiness(submissionPayload: unknown) {
  return toRecord(toRecord(submissionPayload)["readiness"]);
}

function getBepsEvaluation(filingPayload: unknown) {
  return toRecord(toRecord(filingPayload)["bepsEvaluation"]);
}

function getQaFailures(qaPayload: unknown) {
  return toArray(toRecord(qaPayload)["findings"])
    .map((finding) => toRecord(finding))
    .filter((finding) => finding["status"] === "FAIL");
}

function dedupeSourceRefs(sourceRefs: PortfolioRiskSourceRef[]) {
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

function maxUrgency(
  left: PortfolioRiskUrgencyLevel,
  right: PortfolioRiskUrgencyLevel,
): PortfolioRiskUrgencyLevel {
  return URGENCY_RANK[left] >= URGENCY_RANK[right] ? left : right;
}

function buildDeadlineUrgency(targetYear: number | null | undefined, now: Date) {
  if (targetYear == null) {
    return "LOW" as PortfolioRiskUrgencyLevel;
  }

  const currentYear = now.getUTCFullYear();
  if (targetYear < currentYear) return "CRITICAL";
  if (targetYear === currentYear) return "HIGH";
  if (targetYear === currentYear + 1) return "MEDIUM";
  return "LOW";
}

function createContribution(input: {
  code: PortfolioRiskReasonCode;
  riskCategory: PortfolioRiskCategory;
  riskScore: number;
  urgencyLevel: PortfolioRiskUrgencyLevel;
  blocking: boolean;
  message: string;
  recommendedNextAction: string;
  estimatedExposure?: number | null;
  sourceRefs: PortfolioRiskSourceRef[];
}): PortfolioRiskContribution {
  return {
    code: input.code,
    riskCategory: input.riskCategory,
    riskScore: input.riskScore,
    urgencyLevel: input.urgencyLevel,
    blocking: input.blocking,
    message: input.message,
    recommendedNextAction: input.recommendedNextAction,
    estimatedExposure: input.estimatedExposure ?? null,
    sourceRefs: dedupeSourceRefs(input.sourceRefs),
  };
}

export function buildBuildingPortfolioRisk(
  context: BuildingRiskContext,
  now = new Date(),
): BuildingPortfolioRiskSummary {
  const baseBuildingRef: PortfolioRiskSourceRef = {
    recordType: "BUILDING",
    recordId: context.building.id,
    label: "Building",
  };
  const contributions: PortfolioRiskContribution[] = [];
  const benchmarkRef = context.benchmarkSubmission
    ? [
        {
          recordType: "BENCHMARK_SUBMISSION" as const,
          recordId: context.benchmarkSubmission.id,
          label: `Benchmark submission ${context.benchmarkSubmission.reportingYear}`,
        },
        ...(context.benchmarkSubmission.complianceRunId
          ? [
              {
                recordType: "COMPLIANCE_RUN" as const,
                recordId: context.benchmarkSubmission.complianceRunId,
                label: "Benchmark compliance run",
              },
            ]
          : []),
      ]
    : [];
  const filingRef = context.filingRecord
    ? [
        {
          recordType: "FILING_RECORD" as const,
          recordId: context.filingRecord.id,
          label: `BEPS filing ${context.filingRecord.filingYear ?? "current"}`,
        },
        ...(context.filingRecord.complianceRunId
          ? [
              {
                recordType: "COMPLIANCE_RUN" as const,
                recordId: context.filingRecord.complianceRunId,
                label: "BEPS compliance run",
              },
            ]
          : []),
      ]
    : [];
  const syncRef = context.syncState
    ? [
        {
          recordType: "PORTFOLIO_MANAGER_SYNC_STATE" as const,
          recordId: context.syncState.id,
          label: "Portfolio Manager sync state",
        },
      ]
    : [];
  const packetRef =
    context.filingRecord?.packets[0] != null
      ? [
          {
            recordType: "FILING_PACKET" as const,
            recordId: context.filingRecord.packets[0].id,
            label: `BEPS filing packet v${context.filingRecord.packets[0].version}`,
          },
        ]
      : [];

  if (!context.syncState) {
    contributions.push(
      createContribution({
        code: PORTFOLIO_RISK_REASON_CODES.pmSyncMissing,
        riskCategory: "SYNC",
        riskScore: 18,
        urgencyLevel: context.building.espmPropertyId ? "HIGH" : "MEDIUM",
        blocking: context.building.espmPropertyId != null,
        message: "No Portfolio Manager sync state exists for this building.",
        recommendedNextAction:
          context.building.espmPropertyId != null
            ? "Run a Portfolio Manager sync and inspect linkage/QA results."
            : "Link the building to Portfolio Manager before enabling benchmarking autopilot.",
        sourceRefs: [baseBuildingRef],
      }),
    );
  } else {
    if (context.syncState.status === "FAILED") {
      contributions.push(
        createContribution({
          code: PORTFOLIO_RISK_REASON_CODES.pmSyncFailed,
          riskCategory: "SYNC",
          riskScore: 24,
          urgencyLevel: "HIGH",
          blocking: true,
          message: "The latest Portfolio Manager sync failed.",
          recommendedNextAction:
            "Inspect the persisted sync error metadata and rerun the Portfolio Manager sync.",
          sourceRefs: [...syncRef, baseBuildingRef],
        }),
      );
    } else if (context.syncState.status === "PARTIAL") {
      contributions.push(
        createContribution({
          code: PORTFOLIO_RISK_REASON_CODES.pmSyncPartial,
          riskCategory: "SYNC",
          riskScore: 14,
          urgencyLevel: "MEDIUM",
          blocking: true,
          message: "The latest Portfolio Manager sync only partially completed.",
          recommendedNextAction:
            "Review failed sync steps and rerun the Portfolio Manager refresh.",
          sourceRefs: [...syncRef, baseBuildingRef],
        }),
      );
    }

    const qaFailures = getQaFailures(context.syncState.qaPayload);
    const staleFinding = qaFailures.find((finding) => finding["code"] === "STALE_PM_DATA");
    if (
      staleFinding ||
      (context.syncState.lastSuccessfulSyncAt &&
        context.syncState.lastSuccessfulSyncAt.getTime() <
          now.getTime() - 30 * 24 * 60 * 60 * 1000)
    ) {
      contributions.push(
        createContribution({
          code: PORTFOLIO_RISK_REASON_CODES.pmSyncStale,
          riskCategory: "SYNC",
          riskScore: 18,
          urgencyLevel: "HIGH",
          blocking: true,
          message: "Portfolio Manager sync data is stale relative to operational readiness checks.",
          recommendedNextAction:
            "Refresh Portfolio Manager property, meter, consumption, and metrics data.",
          sourceRefs: [...syncRef, baseBuildingRef],
        }),
      );
    }

    const linkageOrSharingFailure = qaFailures.some((finding) =>
      ["PROPERTY_LINKAGE_MISSING", "PROPERTY_LINKAGE_MISMATCH"].includes(
        String(finding["code"]),
      ),
    );
    if (linkageOrSharingFailure || context.building.espmPropertyId == null) {
      contributions.push(
        createContribution({
          code: PORTFOLIO_RISK_REASON_CODES.pmPropertyLinkageIssue,
          riskCategory: "SYNC",
          riskScore: 16,
          urgencyLevel: "HIGH",
          blocking: true,
          message: "Portfolio Manager property linkage is missing or mismatched.",
          recommendedNextAction:
            "Repair the Portfolio Manager property linkage and rerun sync QA.",
          sourceRefs: [...syncRef, baseBuildingRef],
        }),
      );
    }

    if (
      qaFailures.some((finding) => String(finding["code"]) === "MISSING_PM_SHARING_STATE") ||
      context.building.espmShareStatus !== "LINKED"
    ) {
      contributions.push(
        createContribution({
          code: PORTFOLIO_RISK_REASON_CODES.pmSharingIssue,
          riskCategory: "SYNC",
          riskScore: 14,
          urgencyLevel: "HIGH",
          blocking: true,
          message: "Portfolio Manager sharing/exchange state is not ready.",
          recommendedNextAction:
            "Restore Portfolio Manager sharing or exchange permissions for this property.",
          sourceRefs: [...syncRef, baseBuildingRef],
        }),
      );
    }

    if (
      qaFailures.some((finding) =>
        ["MISSING_COVERAGE", "OVERLAPPING_PERIODS", "MISSING_REQUIRED_METERS"].includes(
          String(finding["code"]),
        ),
      )
    ) {
      contributions.push(
        createContribution({
          code: PORTFOLIO_RISK_REASON_CODES.pmCoverageIssue,
          riskCategory: "SYNC",
          riskScore: 15,
          urgencyLevel: "HIGH",
          blocking: true,
          message: "Portfolio Manager QA found meter, coverage, or overlap issues.",
          recommendedNextAction:
            "Resolve missing meters or consumption-period issues before relying on readiness automation.",
          sourceRefs: [...syncRef, baseBuildingRef],
        }),
      );
    }
  }

  if (!context.benchmarkSubmission) {
    contributions.push(
      createContribution({
        code: PORTFOLIO_RISK_REASON_CODES.benchmarkingSubmissionMissing,
        riskCategory: "BENCHMARKING",
        riskScore: 20,
        urgencyLevel: "HIGH",
        blocking: true,
        message: "No governed benchmarking submission record exists for the current reporting year.",
        recommendedNextAction:
          "Run benchmarking readiness evaluation and create the canonical annual submission record.",
        sourceRefs: [baseBuildingRef, ...syncRef],
      }),
    );
  } else {
    const readiness = getBenchmarkReadiness(context.benchmarkSubmission.submissionPayload);
    const readinessReasonCodes = getStringArray(readiness["reasonCodes"]);
    const reportingYear = context.benchmarkSubmission.reportingYear;

    if (context.benchmarkSubmission.status === "BLOCKED") {
      contributions.push(
        createContribution({
          code: PORTFOLIO_RISK_REASON_CODES.benchmarkingBlocked,
          riskCategory: "BENCHMARKING",
          riskScore: 28,
          urgencyLevel: buildDeadlineUrgency(reportingYear + 1, now),
          blocking: true,
          message: "Benchmarking readiness is currently blocked.",
          recommendedNextAction:
            "Resolve the blocking readiness findings and rerun the benchmarking workflow.",
          sourceRefs: [...benchmarkRef, ...syncRef, baseBuildingRef],
        }),
      );
    }

    if (
      !["SUBMITTED", "ACCEPTED"].includes(context.benchmarkSubmission.status) &&
      reportingYear <= now.getUTCFullYear() - 1
    ) {
      contributions.push(
        createContribution({
          code: PORTFOLIO_RISK_REASON_CODES.benchmarkingOverdue,
          riskCategory: "BENCHMARKING",
          riskScore: 16,
          urgencyLevel: buildDeadlineUrgency(reportingYear + 1, now),
          blocking: true,
          message: "Benchmarking work remains open for a reporting year that is already due.",
          recommendedNextAction:
            "Submit or advance the benchmarking filing for the current reporting year.",
          sourceRefs: [...benchmarkRef, baseBuildingRef],
        }),
      );
    }

    if (
      readinessReasonCodes.some((code) =>
        ["VERIFICATION_EVIDENCE_MISSING", "GFA_EVIDENCE_MISSING"].includes(code),
      )
    ) {
      contributions.push(
        createContribution({
          code: PORTFOLIO_RISK_REASON_CODES.benchmarkingEvidenceMissing,
          riskCategory: "EVIDENCE",
          riskScore: 18,
          urgencyLevel: "HIGH",
          blocking: true,
          message:
            "Benchmarking evidence requirements are not satisfied for verification or GFA correction.",
          recommendedNextAction:
            "Attach the missing verification or GFA evidence to the annual benchmarking record.",
          sourceRefs: [...benchmarkRef, baseBuildingRef],
        }),
      );
    }
  }

  if (!context.filingRecord) {
    contributions.push(
      createContribution({
        code: PORTFOLIO_RISK_REASON_CODES.bepsEvaluationMissing,
        riskCategory: "BEPS",
        riskScore: 16,
        urgencyLevel:
          context.building.complianceCycle === "CYCLE_1" ||
          context.building.complianceCycle === "CYCLE_2"
            ? "MEDIUM"
            : "LOW",
        blocking: false,
        message: "No governed BEPS filing/evaluation record exists for the active cycle.",
        recommendedNextAction:
          "Run a governed BEPS evaluation for the building’s active compliance cycle.",
        sourceRefs: [baseBuildingRef],
      }),
    );
  } else {
    const evaluation = getBepsEvaluation(context.filingRecord.filingPayload);
    const overallStatus =
      typeof evaluation["overallStatus"] === "string"
        ? evaluation["overallStatus"]
        : null;
    const reasonCodes = getStringArray(evaluation["reasonCodes"]);
    const alternativeCompliance = toRecord(evaluation["alternativeCompliance"]);
    const recommendedAlternativeCompliance = toRecord(
      alternativeCompliance["recommended"],
    );
    const amountDue = getNumber(recommendedAlternativeCompliance["amountDue"]);

    if (overallStatus === "NON_COMPLIANT") {
      contributions.push(
        createContribution({
          code: PORTFOLIO_RISK_REASON_CODES.bepsNonCompliant,
          riskCategory: "BEPS",
          riskScore: 32,
          urgencyLevel: buildDeadlineUrgency(context.filingRecord.filingYear, now),
          blocking: true,
          estimatedExposure: amountDue ?? context.building.maxPenaltyExposure ?? null,
          message: "The latest governed BEPS evaluation is non-compliant.",
          recommendedNextAction:
            "Review the governed BEPS result, select the compliance pathway action, and advance the filing workflow.",
          sourceRefs: [...filingRef, baseBuildingRef],
        }),
      );
    } else if (overallStatus === "PENDING_DATA") {
      contributions.push(
        createContribution({
          code: PORTFOLIO_RISK_REASON_CODES.bepsPendingData,
          riskCategory: "BEPS",
          riskScore: 20,
          urgencyLevel: "HIGH",
          blocking: true,
          estimatedExposure: amountDue,
          message: "The latest governed BEPS evaluation is still pending required data.",
          recommendedNextAction:
            "Complete the missing canonical BEPS inputs and rerun the evaluation.",
          sourceRefs: [...filingRef, baseBuildingRef],
        }),
      );
    }

    if (
      amountDue != null &&
      amountDue > 0 &&
      (overallStatus === "NON_COMPLIANT" || reasonCodes.includes("ACP_AGREEMENT_REQUIRED"))
    ) {
      contributions.push(
        createContribution({
          code: PORTFOLIO_RISK_REASON_CODES.likelyAcpExposure,
          riskCategory: "BEPS",
          riskScore: 22,
          urgencyLevel: "HIGH",
          blocking: true,
          estimatedExposure: amountDue,
          message: "The current BEPS result indicates likely alternative-compliance or penalty exposure.",
          recommendedNextAction:
            "Review ACP/noncompliance exposure and decide whether to remediate, document, or file with support evidence.",
          sourceRefs: [...filingRef, baseBuildingRef],
        }),
      );
    }

    if (reasonCodes.includes("MAX_PENALTY_OVERRIDE_APPLIED")) {
      contributions.push(
        createContribution({
          code: PORTFOLIO_RISK_REASON_CODES.maxPenaltyOverride,
          riskCategory: "BEPS",
          riskScore: 40,
          urgencyLevel: "CRITICAL",
          blocking: true,
          estimatedExposure: amountDue ?? context.building.maxPenaltyExposure ?? null,
          message: "A max-penalty override condition is present in the governed BEPS result.",
          recommendedNextAction:
            "Escalate the filing immediately and resolve the override condition before submission.",
          sourceRefs: [...filingRef, baseBuildingRef],
        }),
      );
    }

    if (context.filingRecord.status === "REJECTED") {
      contributions.push(
        createContribution({
          code: PORTFOLIO_RISK_REASON_CODES.filingRejected,
          riskCategory: "FILING",
          riskScore: 26,
          urgencyLevel: "CRITICAL",
          blocking: true,
          estimatedExposure: amountDue,
          message: "The BEPS filing workflow is currently in a rejected state.",
          recommendedNextAction:
            "Resolve the rejection, refresh the governed filing output, and regenerate the packet.",
          sourceRefs: [...filingRef, ...packetRef, baseBuildingRef],
        }),
      );
    }

    if (
      context.filingRecord.filingYear != null &&
      !["FILED", "ACCEPTED"].includes(context.filingRecord.status)
    ) {
      const filingUrgency = buildDeadlineUrgency(context.filingRecord.filingYear, now);
      if (filingUrgency !== "LOW") {
        contributions.push(
          createContribution({
            code: PORTFOLIO_RISK_REASON_CODES.bepsFilingDue,
            riskCategory: "FILING",
            riskScore: filingUrgency === "CRITICAL" ? 18 : 12,
            urgencyLevel: filingUrgency,
            blocking: true,
            estimatedExposure: amountDue,
            message: "The BEPS filing year is current or past due while the filing remains unfinished.",
            recommendedNextAction:
              "Advance the BEPS filing to filed or accepted status before the governed deadline window closes.",
            sourceRefs: [...filingRef, baseBuildingRef],
          }),
        );
      }
    }

    const latestPacket = context.filingRecord.packets[0] ?? null;
    if (!latestPacket) {
      contributions.push(
        createContribution({
          code: PORTFOLIO_RISK_REASON_CODES.filingPacketMissing,
          riskCategory: "FILING",
          riskScore: 12,
          urgencyLevel: "MEDIUM",
          blocking: false,
          estimatedExposure: amountDue,
          message: "No deterministic filing packet exists for the current BEPS filing.",
          recommendedNextAction:
            "Generate a deterministic filing packet from the governed filing record.",
          sourceRefs: [...filingRef, baseBuildingRef],
        }),
      );
    } else {
      if (latestPacket.status === "STALE") {
        contributions.push(
          createContribution({
            code: PORTFOLIO_RISK_REASON_CODES.filingPacketStale,
            riskCategory: "FILING",
            riskScore: 18,
            urgencyLevel: "HIGH",
            blocking: true,
            estimatedExposure: amountDue,
            message: "The latest filing packet is stale relative to upstream filing or evidence changes.",
            recommendedNextAction:
              "Regenerate the BEPS filing packet from the latest governed records.",
            sourceRefs: [...packetRef, ...filingRef, baseBuildingRef],
          }),
        );
      } else if (latestPacket.status === "GENERATED" && latestPacket.finalizedAt == null) {
        contributions.push(
          createContribution({
            code: PORTFOLIO_RISK_REASON_CODES.filingPacketNotFinalized,
            riskCategory: "FILING",
            riskScore: 10,
            urgencyLevel: "MEDIUM",
            blocking: false,
            estimatedExposure: amountDue,
            message: "A filing packet exists but has not been finalized for operator review.",
            recommendedNextAction:
              "Review and finalize the current BEPS filing packet.",
            sourceRefs: [...packetRef, ...filingRef, baseBuildingRef],
          }),
        );
      }

      if (
        context.filingRecord.evidenceArtifacts.length === 0 ||
        getPacketWarnings(latestPacket.packetPayload).length > 0
      ) {
        contributions.push(
          createContribution({
            code: PORTFOLIO_RISK_REASON_CODES.filingEvidenceMissing,
            riskCategory: "EVIDENCE",
            riskScore: 16,
            urgencyLevel: "HIGH",
            blocking: true,
            estimatedExposure: amountDue,
            message: "The BEPS filing has missing evidence or packet warnings that still need operator attention.",
            recommendedNextAction:
              "Attach the missing support evidence and regenerate the packet to clear warnings.",
            sourceRefs: [...packetRef, ...filingRef, baseBuildingRef],
          }),
        );
      }
    }
  }

  contributions.sort((left, right) => {
    if (right.riskScore !== left.riskScore) {
      return right.riskScore - left.riskScore;
    }
    if (URGENCY_RANK[right.urgencyLevel] !== URGENCY_RANK[left.urgencyLevel]) {
      return URGENCY_RANK[right.urgencyLevel] - URGENCY_RANK[left.urgencyLevel];
    }
    return left.code.localeCompare(right.code);
  });

  const riskBreakdown: Record<PortfolioRiskCategory, number> = {
    BENCHMARKING: 0,
    BEPS: 0,
    SYNC: 0,
    EVIDENCE: 0,
    FILING: 0,
    OPERATIONS: 0,
  };
  let totalScore = 0;
  let estimatedExposure: number | null = null;
  let urgencyLevel: PortfolioRiskUrgencyLevel = "LOW";

  for (const contribution of contributions) {
    riskBreakdown[contribution.riskCategory] += contribution.riskScore;
    totalScore += contribution.riskScore;
    urgencyLevel = maxUrgency(urgencyLevel, contribution.urgencyLevel);
    if (contribution.estimatedExposure != null) {
      estimatedExposure =
        estimatedExposure == null
          ? contribution.estimatedExposure
          : Math.max(estimatedExposure, contribution.estimatedExposure);
    }
  }

  const topCategory =
    CATEGORY_PRIORITY.find(
      (category) => riskBreakdown[category] === Math.max(...Object.values(riskBreakdown)),
    ) ?? "OPERATIONS";
  const blockingReasons = Array.from(
    new Set(contributions.filter((contribution) => contribution.blocking).map((c) => c.code)),
  );
  const sourceRefs = dedupeSourceRefs(
    contributions.flatMap((contribution) => contribution.sourceRefs),
  );

  if (contributions.length === 0) {
    return {
      buildingId: context.building.id,
      organizationId: context.building.organizationId,
      complianceCycle: context.filingRecord?.complianceCycle ?? context.building.complianceCycle,
      riskCategory: "OPERATIONS",
      riskScore: 0,
      urgencyLevel: "LOW",
      estimatedExposure: null,
      blockingReasons: [],
      recommendedNextAction: "Continue monitoring sync, benchmarking, and filing workflows.",
      sourceRefs: [baseBuildingRef],
      riskBreakdown,
      contributions: [],
      sourceSummary: {
        benchmarkSubmissionId: context.benchmarkSubmission?.id ?? null,
        filingRecordId: context.filingRecord?.id ?? null,
        filingPacketId: context.filingRecord?.packets[0]?.id ?? null,
        complianceRunId:
          context.filingRecord?.complianceRunId ??
          context.benchmarkSubmission?.complianceRunId ??
          null,
        portfolioManagerSyncStateId: context.syncState?.id ?? null,
      },
    };
  }

  if (totalScore >= 80) {
    urgencyLevel = "CRITICAL";
  } else if (totalScore >= 60) {
    urgencyLevel = maxUrgency(urgencyLevel, "HIGH");
  } else if (totalScore >= 30) {
    urgencyLevel = maxUrgency(urgencyLevel, "MEDIUM");
  }

  return {
    buildingId: context.building.id,
    organizationId: context.building.organizationId,
    complianceCycle: context.filingRecord?.complianceCycle ?? context.building.complianceCycle,
    riskCategory: topCategory,
    riskScore: Math.min(100, totalScore),
    urgencyLevel,
    estimatedExposure,
    blockingReasons,
    recommendedNextAction:
      contributions[0]?.recommendedNextAction ??
      "Continue monitoring governed compliance records.",
    sourceRefs,
    riskBreakdown,
    contributions,
    sourceSummary: {
      benchmarkSubmissionId: context.benchmarkSubmission?.id ?? null,
      filingRecordId: context.filingRecord?.id ?? null,
      filingPacketId: context.filingRecord?.packets[0]?.id ?? null,
      complianceRunId:
        context.filingRecord?.complianceRunId ??
        context.benchmarkSubmission?.complianceRunId ??
        null,
      portfolioManagerSyncStateId: context.syncState?.id ?? null,
    },
  };
}

function buildPortfolioAggregate(
  organizationId: string,
  buildingRisks: BuildingPortfolioRiskSummary[],
  now: Date,
): PortfolioRiskAggregateSummary {
  const evidenceAttentionReasons = new Set<PortfolioRiskReasonCode>([
    PORTFOLIO_RISK_REASON_CODES.benchmarkingEvidenceMissing,
    PORTFOLIO_RISK_REASON_CODES.filingEvidenceMissing,
    PORTFOLIO_RISK_REASON_CODES.filingPacketNotFinalized,
    PORTFOLIO_RISK_REASON_CODES.filingPacketStale,
  ]);

  return {
    organizationId,
    evaluatedAt: now.toISOString(),
    totals: {
      buildingsReady: buildingRisks.filter((risk) => risk.blockingReasons.length === 0).length,
      buildingsBlocked: buildingRisks.filter((risk) => risk.blockingReasons.length > 0).length,
      buildingsAtHighRisk: buildingRisks.filter(
        (risk) => risk.riskScore >= 70 || risk.urgencyLevel === "CRITICAL",
      ).length,
      buildingsWithStaleSyncData: buildingRisks.filter((risk) =>
        risk.blockingReasons.some((reason) => STALE_SYNC_REASON_CODES.has(reason)),
      ).length,
      buildingsWithLikelyAcpExposure: buildingRisks.filter((risk) =>
        risk.blockingReasons.includes(PORTFOLIO_RISK_REASON_CODES.likelyAcpExposure),
      ).length,
      buildingsNeedingVerificationEvidenceFinalization: buildingRisks.filter((risk) =>
        risk.blockingReasons.some((reason) => evidenceAttentionReasons.has(reason)),
      ).length,
      totalEstimatedExposure: buildingRisks.reduce(
        (sum, risk) => sum + (risk.estimatedExposure ?? 0),
        0,
      ),
    },
  };
}

function toActionItems(
  buildingRisks: BuildingPortfolioRiskSummary[],
  limit: number,
): PortfolioRiskActionItem[] {
  return buildingRisks
    .flatMap((risk) =>
      risk.contributions.map((contribution) => ({
        buildingId: risk.buildingId,
        organizationId: risk.organizationId,
        complianceCycle: risk.complianceCycle,
        riskCategory: contribution.riskCategory,
        riskScore: contribution.riskScore,
        urgencyLevel: contribution.urgencyLevel,
        estimatedExposure: contribution.estimatedExposure,
        reasonCode: contribution.code,
        message: contribution.message,
        recommendedNextAction: contribution.recommendedNextAction,
        sourceRefs: contribution.sourceRefs,
      })),
    )
    .sort((left, right) => {
      if (URGENCY_RANK[right.urgencyLevel] !== URGENCY_RANK[left.urgencyLevel]) {
        return URGENCY_RANK[right.urgencyLevel] - URGENCY_RANK[left.urgencyLevel];
      }
      if (right.riskScore !== left.riskScore) {
        return right.riskScore - left.riskScore;
      }
      if ((right.estimatedExposure ?? 0) !== (left.estimatedExposure ?? 0)) {
        return (right.estimatedExposure ?? 0) - (left.estimatedExposure ?? 0);
      }
      if (left.buildingId !== right.buildingId) {
        return left.buildingId.localeCompare(right.buildingId);
      }
      return left.reasonCode.localeCompare(right.reasonCode);
    })
    .slice(0, limit);
}

const filingRiskInclude = {
  evidenceArtifacts: {
    select: {
      id: true,
    },
  },
  packets: {
    orderBy: [{ version: "desc" }],
    take: 1,
    select: {
      id: true,
      status: true,
      packetPayload: true,
      version: true,
      finalizedAt: true,
    },
  },
} satisfies Prisma.FilingRecordInclude;

export async function listPortfolioRisk(params: {
  organizationId: string;
  buildingId?: string;
  limit?: number;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const buildings = await prisma.building.findMany({
    where: {
      organizationId: params.organizationId,
      ...(params.buildingId ? { id: params.buildingId } : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: params.limit,
    select: {
      id: true,
      organizationId: true,
      name: true,
      complianceCycle: true,
      espmPropertyId: true,
      espmShareStatus: true,
      maxPenaltyExposure: true,
    },
  });

  const buildingIds = buildings.map((building) => building.id);
  if (buildingIds.length === 0) {
    return {
      aggregate: buildPortfolioAggregate(params.organizationId, [], now),
      buildingRisks: [],
      actionItems: [],
    };
  }

  const [benchmarkSubmissions, filingRecords, syncStates] = await Promise.all([
    prisma.benchmarkSubmission.findMany({
      where: {
        organizationId: params.organizationId,
        buildingId: { in: buildingIds },
      },
      orderBy: [{ reportingYear: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        buildingId: true,
        reportingYear: true,
        status: true,
        submissionPayload: true,
        complianceRunId: true,
      },
    }),
    prisma.filingRecord.findMany({
      where: {
        organizationId: params.organizationId,
        buildingId: { in: buildingIds },
        filingType: "BEPS_COMPLIANCE",
      },
      orderBy: [{ filingYear: "desc" }, { updatedAt: "desc" }],
      include: filingRiskInclude,
    }),
    prisma.portfolioManagerSyncState.findMany({
      where: {
        organizationId: params.organizationId,
        buildingId: { in: buildingIds },
      },
      select: {
        id: true,
        buildingId: true,
        status: true,
        lastSuccessfulSyncAt: true,
        qaPayload: true,
      },
    }),
  ]);

  const latestBenchmarkByBuilding = new Map<string, (typeof benchmarkSubmissions)[number]>();
  for (const submission of benchmarkSubmissions) {
    if (!latestBenchmarkByBuilding.has(submission.buildingId)) {
      latestBenchmarkByBuilding.set(submission.buildingId, submission);
    }
  }

  const filingCandidatesByBuilding = new Map<string, (typeof filingRecords)[number][]>();
  for (const filingRecord of filingRecords) {
    const existing = filingCandidatesByBuilding.get(filingRecord.buildingId) ?? [];
    existing.push(filingRecord);
    filingCandidatesByBuilding.set(filingRecord.buildingId, existing);
  }

  const syncStateByBuilding = new Map(syncStates.map((state) => [state.buildingId, state]));

  const buildingRisks = buildings.map((building) => {
    const filingCandidates = filingCandidatesByBuilding.get(building.id) ?? [];
    const filingRecord =
      filingCandidates.find(
        (candidate) => candidate.complianceCycle === building.complianceCycle,
      ) ?? filingCandidates[0] ?? null;

    return buildBuildingPortfolioRisk(
      {
        building,
        benchmarkSubmission: latestBenchmarkByBuilding.get(building.id) ?? null,
        filingRecord,
        syncState: syncStateByBuilding.get(building.id) ?? null,
      },
      now,
    );
  });

  buildingRisks.sort((left, right) => {
    if (URGENCY_RANK[right.urgencyLevel] !== URGENCY_RANK[left.urgencyLevel]) {
      return URGENCY_RANK[right.urgencyLevel] - URGENCY_RANK[left.urgencyLevel];
    }
    if (right.riskScore !== left.riskScore) {
      return right.riskScore - left.riskScore;
    }
    return left.buildingId.localeCompare(right.buildingId);
  });

  return {
    aggregate: buildPortfolioAggregate(params.organizationId, buildingRisks, now),
    buildingRisks,
    actionItems: toActionItems(buildingRisks, params.limit ?? 25),
  };
}

export async function getBuildingPortfolioRiskSummary(params: {
  organizationId: string;
  buildingId: string;
  now?: Date;
}) {
  const result = await listPortfolioRisk({
    organizationId: params.organizationId,
    buildingId: params.buildingId,
    limit: 1,
    now: params.now,
  });

  return result.buildingRisks[0] ?? null;
}

export async function listHighestPriorityPortfolioActions(params: {
  organizationId: string;
  limit: number;
  now?: Date;
}) {
  const result = await listPortfolioRisk({
    organizationId: params.organizationId,
    limit: 200,
    now: params.now,
  });

  return toActionItems(result.buildingRisks, params.limit);
}

export async function getPortfolioRiskTrace(params: {
  organizationId: string;
  buildingId: string;
  now?: Date;
}) {
  const buildingRisk = await getBuildingPortfolioRiskSummary(params);

  if (!buildingRisk) {
    return null;
  }

  return {
    buildingRisk,
    contributions: buildingRisk.contributions,
  };
}
