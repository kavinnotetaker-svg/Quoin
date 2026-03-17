import type {
  AlertSeverity,
  BenchmarkSubmissionStatus,
  ComplianceStatus,
  FilingPacketStatus,
  FilingStatus,
  OperationalAnomalyStatus,
  PortfolioManagerSyncStatus,
  RetrofitCandidateStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/server/lib/db";
import { LATEST_SNAPSHOT_ORDER } from "@/server/lib/compliance-snapshots";

export type WorkflowStageStatus =
  | "COMPLETE"
  | "NEEDS_ATTENTION"
  | "BLOCKED"
  | "NOT_STARTED";

export type WorkflowStageKey =
  | "DATA_CONNECTED"
  | "BENCHMARKING_READY"
  | "BEPS_EVALUATED"
  | "FILING_PREPARED"
  | "OPERATIONS_REVIEWED"
  | "RETROFIT_PLAN_AVAILABLE"
  | "FINANCING_CASE_READY";

export type WorkflowNextActionCode =
  | "CONNECT_DATA"
  | "REFRESH_PM_DATA"
  | "FIX_BENCHMARKING_BLOCKERS"
  | "RUN_BENCHMARKING_REVIEW"
  | "RUN_BEPS_EVALUATION"
  | "REGENERATE_FILING_PACKET"
  | "GENERATE_FILING_PACKET"
  | "REVIEW_OPERATIONAL_ISSUES"
  | "CREATE_RETROFIT_PLAN"
  | "GENERATE_FINANCING_CASE";

export interface WorkflowStageSummary {
  key: WorkflowStageKey;
  label: string;
  status: WorkflowStageStatus;
  reason: string;
  href: string;
}

export interface WorkflowNextAction {
  code: WorkflowNextActionCode;
  title: string;
  reason: string;
  href: string;
}

export interface BuildingWorkflowSummary {
  buildingId: string;
  latestComplianceStatus: ComplianceStatus | null;
  latestPenaltyExposure: number | null;
  stages: WorkflowStageSummary[];
  nextAction: WorkflowNextAction;
}

export interface PortfolioWorkflowSummary {
  items: Array<{
    buildingId: string;
    buildingName: string;
    latestComplianceStatus: ComplianceStatus | null;
    latestPenaltyExposure: number | null;
    nextAction: WorkflowNextAction;
    stages: WorkflowStageSummary[];
  }>;
  aggregate: {
    benchmarkingBlocked: number;
    needsBepsEvaluation: number;
    filingAttention: number;
    operationalAttention: number;
    retrofitReady: number;
    financingReady: number;
  };
}

interface WorkflowComputationInput {
  buildingId: string;
  readingsCount: number;
  hasEspmPropertyId: boolean;
  latestComplianceStatus: ComplianceStatus | null;
  latestPenaltyExposure: number | null;
  syncStatus: PortfolioManagerSyncStatus | null;
  syncErrorMessage: string | null;
  latestBenchmarkStatus: BenchmarkSubmissionStatus | null;
  latestBenchmarkSummary: Record<string, unknown> | null;
  latestBenchmarkReasonCodes: string[];
  latestBenchmarkFindingMessage: string | null;
  latestBepsFilingStatus: FilingStatus | null;
  latestBepsCycle: string | null;
  latestBepsHasRun: boolean;
  latestBepsPacketStatus: FilingPacketStatus | null;
  latestBepsPacketWarnings: string[];
  activeAnomalyCount: number;
  totalAnomalyCount: number;
  highestActiveAnomalySeverity: AlertSeverity | null;
  retrofitCandidateCount: number;
  activeRetrofitCandidateCount: number;
  financingCaseCount: number;
  latestFinancingPacketStatus: FilingPacketStatus | null;
}

function hrefFor(buildingId: string, hash: string) {
  return `/buildings/${buildingId}#${hash}`;
}

function firstWarningMessage(warnings: string[]) {
  return warnings[0] ?? null;
}

function firstBlockingMessage(
  summary: Record<string, unknown> | null,
  reasonCodes: string[],
  fallback: string | null,
) {
  const findings = Array.isArray(summary?.findings) ? summary?.findings : [];
  const failedFinding = findings.find(
    (finding) =>
      finding &&
      typeof finding === "object" &&
      !Array.isArray(finding) &&
      (finding as Record<string, unknown>).status === "FAIL",
  );

  if (failedFinding && typeof failedFinding === "object" && !Array.isArray(failedFinding)) {
    const message = (failedFinding as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  if (fallback) {
    return fallback;
  }

  if (reasonCodes.length > 0) {
    return `Blocking issues: ${reasonCodes.join(", ")}.`;
  }

  return "Benchmarking requirements are currently blocked.";
}

function createStage(
  key: WorkflowStageKey,
  label: string,
  status: WorkflowStageStatus,
  reason: string,
  href: string,
): WorkflowStageSummary {
  return { key, label, status, reason, href };
}

export function deriveBuildingWorkflowSummary(
  input: WorkflowComputationInput,
): BuildingWorkflowSummary {
  const dataHref = hrefFor(input.buildingId, "benchmarking");
  const bepsHref = hrefFor(input.buildingId, "beps");
  const operationsHref = hrefFor(input.buildingId, "operations");
  const retrofitHref = hrefFor(input.buildingId, "retrofit");
  const financingHref = hrefFor(input.buildingId, "financing");

  const stages: WorkflowStageSummary[] = [];

  if (!input.hasEspmPropertyId && input.readingsCount === 0) {
    stages.push(
      createStage(
        "DATA_CONNECTED",
        "Data Connected",
        "NOT_STARTED",
        "No Portfolio Manager property is linked and no local energy readings are on file.",
        dataHref,
      ),
    );
  } else if (input.syncStatus === "FAILED") {
    stages.push(
      createStage(
        "DATA_CONNECTED",
        "Data Connected",
        "BLOCKED",
        input.syncErrorMessage ??
          "Portfolio Manager sync failed before Quoin could refresh building data.",
        dataHref,
      ),
    );
  } else if (input.readingsCount > 0) {
    stages.push(
      createStage(
        "DATA_CONNECTED",
        "Data Connected",
        "COMPLETE",
        input.hasEspmPropertyId
          ? "Building has connected data and Quoin has utility readings available."
          : "Building has local utility readings available in Quoin.",
        dataHref,
      ),
    );
  } else {
    stages.push(
      createStage(
        "DATA_CONNECTED",
        "Data Connected",
        "NEEDS_ATTENTION",
        "A Portfolio Manager property is linked, but no imported utility readings are available yet.",
        dataHref,
      ),
    );
  }

  const benchmarkBlockingMessage = firstBlockingMessage(
    input.latestBenchmarkSummary,
    input.latestBenchmarkReasonCodes,
    input.latestBenchmarkFindingMessage,
  );
  if (input.latestBenchmarkStatus == null) {
    stages.push(
      createStage(
        "BENCHMARKING_READY",
        "Benchmarking Ready",
        input.readingsCount === 0 ? "BLOCKED" : "NOT_STARTED",
        input.readingsCount === 0
          ? "Benchmarking cannot run until the building has connected annual utility data."
          : "No governed benchmarking readiness check has been recorded yet.",
        dataHref,
      ),
    );
  } else if (
    input.latestBenchmarkStatus === "READY" ||
    input.latestBenchmarkStatus === "SUBMITTED" ||
    input.latestBenchmarkStatus === "ACCEPTED"
  ) {
    stages.push(
      createStage(
        "BENCHMARKING_READY",
        "Benchmarking Ready",
        "COMPLETE",
        input.latestBenchmarkStatus === "READY"
          ? "Benchmarking requirements are satisfied and the annual submission is ready."
          : "Benchmarking has already been prepared for filing.",
        dataHref,
      ),
    );
  } else if (input.latestBenchmarkStatus === "BLOCKED") {
    stages.push(
      createStage(
        "BENCHMARKING_READY",
        "Benchmarking Ready",
        "BLOCKED",
        benchmarkBlockingMessage,
        dataHref,
      ),
    );
  } else {
    stages.push(
      createStage(
        "BENCHMARKING_READY",
        "Benchmarking Ready",
        "NEEDS_ATTENTION",
        `Benchmarking is in ${input.latestBenchmarkStatus.toLowerCase().replaceAll("_", " ")} status and still needs operator follow-up.`,
        dataHref,
      ),
    );
  }

  if (!input.latestBepsHasRun) {
    stages.push(
      createStage(
        "BEPS_EVALUATED",
        "BEPS Evaluated",
        input.latestComplianceStatus === "PENDING_DATA" || input.latestComplianceStatus == null
          ? "BLOCKED"
          : "NOT_STARTED",
        input.latestComplianceStatus === "PENDING_DATA" || input.latestComplianceStatus == null
          ? "Quoin needs a usable compliance snapshot before it can run a governed BEPS evaluation."
          : "No governed BEPS evaluation has been recorded for this building yet.",
        bepsHref,
      ),
    );
  } else {
    stages.push(
      createStage(
        "BEPS_EVALUATED",
        "BEPS Evaluated",
        "COMPLETE",
        input.latestBepsCycle
          ? `Latest BEPS evaluation is recorded for ${input.latestBepsCycle.replaceAll("_", " ")}.`
          : "A governed BEPS evaluation is already on record.",
        bepsHref,
      ),
    );
  }

  if (!input.latestBepsHasRun) {
    stages.push(
      createStage(
        "FILING_PREPARED",
        "Filing Prepared",
        "BLOCKED",
        "A filing packet cannot be prepared until Quoin has a governed BEPS evaluation.",
        bepsHref,
      ),
    );
  } else if (!input.latestBepsPacketStatus) {
    stages.push(
      createStage(
        "FILING_PREPARED",
        "Filing Prepared",
        "NOT_STARTED",
        "No BEPS filing packet has been generated yet.",
        bepsHref,
      ),
    );
  } else if (input.latestBepsPacketStatus === "FINALIZED") {
    stages.push(
      createStage(
        "FILING_PREPARED",
        "Filing Prepared",
        "COMPLETE",
        "The latest BEPS filing packet is finalized and ready for filing review.",
        bepsHref,
      ),
    );
  } else if (input.latestBepsPacketStatus === "STALE") {
    stages.push(
      createStage(
        "FILING_PREPARED",
        "Filing Prepared",
        "NEEDS_ATTENTION",
        "The current BEPS filing packet is stale and should be regenerated.",
        bepsHref,
      ),
    );
  } else if (input.latestBepsPacketWarnings.length > 0) {
    stages.push(
      createStage(
        "FILING_PREPARED",
        "Filing Prepared",
        "NEEDS_ATTENTION",
        firstWarningMessage(input.latestBepsPacketWarnings) ??
          "The current filing packet still has warnings to review.",
        bepsHref,
      ),
    );
  } else {
    stages.push(
      createStage(
        "FILING_PREPARED",
        "Filing Prepared",
        "NEEDS_ATTENTION",
        "A filing packet exists but still needs operator review and finalization.",
        bepsHref,
      ),
    );
  }

  if (input.activeAnomalyCount > 0) {
    stages.push(
      createStage(
        "OPERATIONS_REVIEWED",
        "Operational Issues Reviewed",
        "NEEDS_ATTENTION",
        `${input.activeAnomalyCount} active operational issue${input.activeAnomalyCount === 1 ? "" : "s"} still need review${input.highestActiveAnomalySeverity ? ` (${input.highestActiveAnomalySeverity.toLowerCase()} severity highest).` : "."}`,
        operationsHref,
      ),
    );
  } else if (input.totalAnomalyCount > 0) {
    stages.push(
      createStage(
        "OPERATIONS_REVIEWED",
        "Operational Issues Reviewed",
        "COMPLETE",
        "Recorded operational anomalies have already been reviewed or dismissed.",
        operationsHref,
      ),
    );
  } else if (input.readingsCount === 0) {
    stages.push(
      createStage(
        "OPERATIONS_REVIEWED",
        "Operational Issues Reviewed",
        "BLOCKED",
        "Operational review needs utility readings before Quoin can refresh anomalies.",
        operationsHref,
      ),
    );
  } else {
    stages.push(
      createStage(
        "OPERATIONS_REVIEWED",
        "Operational Issues Reviewed",
        "NOT_STARTED",
        "No anomaly review has been recorded for this building yet.",
        operationsHref,
      ),
    );
  }

  if (input.activeRetrofitCandidateCount > 0) {
    stages.push(
      createStage(
        "RETROFIT_PLAN_AVAILABLE",
        "Retrofit Plan Available",
        "COMPLETE",
        `${input.activeRetrofitCandidateCount} active retrofit candidate${input.activeRetrofitCandidateCount === 1 ? "" : "s"} are already available for this building.`,
        retrofitHref,
      ),
    );
  } else if (
    input.latestComplianceStatus === "NON_COMPLIANT" ||
    input.latestComplianceStatus === "AT_RISK" ||
    input.activeAnomalyCount > 0
  ) {
    stages.push(
      createStage(
        "RETROFIT_PLAN_AVAILABLE",
        "Retrofit Plan Available",
        "NEEDS_ATTENTION",
        "This building has compliance or operational issues, but no active retrofit plan has been created yet.",
        retrofitHref,
      ),
    );
  } else if (input.retrofitCandidateCount > 0) {
    stages.push(
      createStage(
        "RETROFIT_PLAN_AVAILABLE",
        "Retrofit Plan Available",
        "NEEDS_ATTENTION",
        "Retrofit candidates exist, but none are currently active for planning work.",
        retrofitHref,
      ),
    );
  } else {
    stages.push(
      createStage(
        "RETROFIT_PLAN_AVAILABLE",
        "Retrofit Plan Available",
        "NOT_STARTED",
        "No retrofit candidates exist for this building yet.",
        retrofitHref,
      ),
    );
  }

  if (input.activeRetrofitCandidateCount === 0) {
    stages.push(
      createStage(
        "FINANCING_CASE_READY",
        "Financing Case Ready",
        "BLOCKED",
        "Financing work starts after Quoin has at least one active retrofit candidate.",
        financingHref,
      ),
    );
  } else if (input.financingCaseCount === 0) {
    stages.push(
      createStage(
        "FINANCING_CASE_READY",
        "Financing Case Ready",
        "NOT_STARTED",
        "No financing case has been assembled for the available retrofit plan.",
        financingHref,
      ),
    );
  } else if (input.latestFinancingPacketStatus === "FINALIZED" || input.latestFinancingPacketStatus === "GENERATED") {
    stages.push(
      createStage(
        "FINANCING_CASE_READY",
        "Financing Case Ready",
        "COMPLETE",
        "A financing case and packet are already available for review.",
        financingHref,
      ),
    );
  } else if (input.latestFinancingPacketStatus === "STALE") {
    stages.push(
      createStage(
        "FINANCING_CASE_READY",
        "Financing Case Ready",
        "NEEDS_ATTENTION",
        "The latest financing packet is stale and should be regenerated.",
        financingHref,
      ),
    );
  } else {
    stages.push(
      createStage(
        "FINANCING_CASE_READY",
        "Financing Case Ready",
        "NEEDS_ATTENTION",
        "A financing case exists, but the packet is not generated yet.",
        financingHref,
      ),
    );
  }

  const nextAction =
    stages.find((stage) => stage.key === "DATA_CONNECTED" && stage.status !== "COMPLETE")
      ? {
          code:
            stages[0]?.status === "BLOCKED" || stages[0]?.status === "NEEDS_ATTENTION"
              ? ("REFRESH_PM_DATA" as const)
              : ("CONNECT_DATA" as const),
          title:
            stages[0]?.status === "NOT_STARTED"
              ? "Connect building data"
              : "Refresh connected data",
          reason: stages[0]?.reason ?? "Building data is not ready yet.",
          href: dataHref,
        }
      : stages.find((stage) => stage.key === "BENCHMARKING_READY" && stage.status !== "COMPLETE")
        ? {
            code:
              stages[1]?.status === "BLOCKED"
                ? ("FIX_BENCHMARKING_BLOCKERS" as const)
                : ("RUN_BENCHMARKING_REVIEW" as const),
            title:
              stages[1]?.status === "BLOCKED"
                ? "Fix benchmarking blockers"
                : "Refresh benchmarking status",
            reason: stages[1]?.reason ?? "Benchmarking still needs operator action.",
            href: dataHref,
          }
        : stages.find((stage) => stage.key === "BEPS_EVALUATED" && stage.status !== "COMPLETE")
          ? {
              code: "RUN_BEPS_EVALUATION" as const,
              title: "Run BEPS evaluation",
              reason:
                stages.find((stage) => stage.key === "BEPS_EVALUATED")?.reason ??
                "A governed BEPS evaluation is still missing.",
              href: bepsHref,
            }
          : stages.find((stage) => stage.key === "FILING_PREPARED" && stage.status !== "COMPLETE")
            ? {
                code:
                  input.latestBepsPacketStatus === "STALE"
                    ? ("REGENERATE_FILING_PACKET" as const)
                    : ("GENERATE_FILING_PACKET" as const),
                title:
                  input.latestBepsPacketStatus === "STALE"
                    ? "Regenerate filing packet"
                    : "Prepare filing packet",
                reason:
                  stages.find((stage) => stage.key === "FILING_PREPARED")?.reason ??
                  "The BEPS filing packet still needs work.",
                href: bepsHref,
              }
            : stages.find((stage) => stage.key === "OPERATIONS_REVIEWED" && stage.status !== "COMPLETE")
              ? {
                  code: "REVIEW_OPERATIONAL_ISSUES" as const,
                  title: "Review operational issues",
                  reason:
                    stages.find((stage) => stage.key === "OPERATIONS_REVIEWED")?.reason ??
                    "Operational issues still need review.",
                  href: operationsHref,
                }
              : stages.find((stage) => stage.key === "RETROFIT_PLAN_AVAILABLE" && stage.status !== "COMPLETE")
                ? {
                    code: "CREATE_RETROFIT_PLAN" as const,
                    title: "Create retrofit plan",
                    reason:
                      stages.find((stage) => stage.key === "RETROFIT_PLAN_AVAILABLE")?.reason ??
                      "No active retrofit candidate exists yet.",
                    href: retrofitHref,
                  }
                : stages.find((stage) => stage.key === "FINANCING_CASE_READY" && stage.status !== "COMPLETE")
                  ? {
                      code: "GENERATE_FINANCING_CASE" as const,
                      title: "Prepare financing case",
                      reason:
                        stages.find((stage) => stage.key === "FINANCING_CASE_READY")?.reason ??
                        "Financing materials still need to be assembled.",
                      href: financingHref,
                    }
                  : {
                      code: "GENERATE_FINANCING_CASE" as const,
                      title: "Workflow complete",
                      reason: "This building has completed the current Quoin workflow stages on record.",
                      href: financingHref,
                    };

  return {
    buildingId: input.buildingId,
    latestComplianceStatus: input.latestComplianceStatus,
    latestPenaltyExposure: input.latestPenaltyExposure,
    stages,
    nextAction,
  };
}

export async function getBuildingWorkflowSummary(params: {
  organizationId: string;
  buildingId: string;
}): Promise<BuildingWorkflowSummary | null> {
  const [
    building,
    readingsCount,
    syncState,
    latestSubmission,
    latestFiling,
    activeAnomalyCount,
    totalAnomalyCount,
    highestActiveAnomaly,
    retrofitCandidates,
    financingCase,
  ] = await Promise.all([
    prisma.building.findFirst({
      where: {
        id: params.buildingId,
        organizationId: params.organizationId,
      },
      select: {
        id: true,
        espmPropertyId: true,
        complianceSnapshots: {
          orderBy: LATEST_SNAPSHOT_ORDER,
          take: 1,
          select: {
            complianceStatus: true,
            estimatedPenalty: true,
          },
        },
      },
    }),
    prisma.energyReading.count({
      where: {
        buildingId: params.buildingId,
        organizationId: params.organizationId,
      },
    }),
    prisma.portfolioManagerSyncState.findFirst({
      where: {
        buildingId: params.buildingId,
        organizationId: params.organizationId,
      },
      select: {
        status: true,
        lastErrorMetadata: true,
      },
    }),
    prisma.benchmarkSubmission.findFirst({
      where: {
        buildingId: params.buildingId,
        organizationId: params.organizationId,
      },
      orderBy: [{ reportingYear: "desc" }, { createdAt: "desc" }],
      select: {
        status: true,
        submissionPayload: true,
      },
    }),
    prisma.filingRecord.findFirst({
      where: {
        buildingId: params.buildingId,
        organizationId: params.organizationId,
        filingType: "BEPS_COMPLIANCE",
      },
      orderBy: [{ filingYear: "desc" }, { updatedAt: "desc" }],
      select: {
        status: true,
        complianceCycle: true,
        complianceRunId: true,
        packets: {
          orderBy: [{ generatedAt: "desc" }, { version: "desc" }],
          take: 1,
          select: {
            status: true,
            packetPayload: true,
          },
        },
      },
    }),
    prisma.operationalAnomaly.count({
      where: {
        buildingId: params.buildingId,
        organizationId: params.organizationId,
        status: "ACTIVE",
      },
    }),
    prisma.operationalAnomaly.count({
      where: {
        buildingId: params.buildingId,
        organizationId: params.organizationId,
      },
    }),
    prisma.operationalAnomaly.findFirst({
      where: {
        buildingId: params.buildingId,
        organizationId: params.organizationId,
        status: "ACTIVE",
      },
      orderBy: [
        { severity: "desc" },
        { updatedAt: "desc" },
      ],
      select: {
        severity: true,
      },
    }),
    prisma.retrofitCandidate.findMany({
      where: {
        buildingId: params.buildingId,
        organizationId: params.organizationId,
      },
      select: {
        status: true,
      },
    }),
    prisma.financingCase.findFirst({
      where: {
        buildingId: params.buildingId,
        organizationId: params.organizationId,
      },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        packets: {
          orderBy: [{ generatedAt: "desc" }, { version: "desc" }],
          take: 1,
          select: {
            status: true,
          },
        },
      },
    }),
  ]);

  if (!building) {
    return null;
  }

  const latestSnapshot = building.complianceSnapshots[0] ?? null;
  const benchmarkPayload =
    latestSubmission?.submissionPayload &&
    typeof latestSubmission.submissionPayload === "object" &&
    !Array.isArray(latestSubmission.submissionPayload)
      ? (latestSubmission.submissionPayload as Record<string, unknown>)
      : null;
  const benchmarkReadiness =
    benchmarkPayload?.readiness &&
    typeof benchmarkPayload.readiness === "object" &&
    !Array.isArray(benchmarkPayload.readiness)
      ? (benchmarkPayload.readiness as Record<string, unknown>)
      : null;
  const benchmarkReasonCodes = Array.isArray(benchmarkReadiness?.reasonCodes)
    ? benchmarkReadiness.reasonCodes.filter((value): value is string => typeof value === "string")
    : [];

  const syncErrorMetadata =
    syncState?.lastErrorMetadata &&
    typeof syncState.lastErrorMetadata === "object" &&
    !Array.isArray(syncState.lastErrorMetadata)
      ? (syncState.lastErrorMetadata as Record<string, unknown>)
      : null;

  const latestPacket = latestFiling?.packets[0] ?? null;
  const latestPacketPayload =
    latestPacket?.packetPayload &&
    typeof latestPacket.packetPayload === "object" &&
    !Array.isArray(latestPacket.packetPayload)
      ? (latestPacket.packetPayload as Record<string, unknown>)
      : null;
  const latestPacketWarnings = Array.isArray(latestPacketPayload?.warnings)
    ? latestPacketPayload.warnings
        .map((warning) => {
          if (typeof warning === "string") {
            return warning;
          }
          if (warning && typeof warning === "object" && !Array.isArray(warning)) {
            const message = (warning as Record<string, unknown>).message;
            return typeof message === "string" ? message : null;
          }
          return null;
        })
        .filter((warning): warning is string => Boolean(warning))
    : [];

  return deriveBuildingWorkflowSummary({
    buildingId: params.buildingId,
    readingsCount,
    hasEspmPropertyId: Boolean(building.espmPropertyId),
    latestComplianceStatus: latestSnapshot?.complianceStatus ?? null,
    latestPenaltyExposure: latestSnapshot?.estimatedPenalty ?? null,
    syncStatus: syncState?.status ?? null,
    syncErrorMessage:
      typeof syncErrorMetadata?.message === "string"
        ? syncErrorMetadata.message
        : typeof syncErrorMetadata?.property === "string"
          ? syncErrorMetadata.property
          : null,
    latestBenchmarkStatus: latestSubmission?.status ?? null,
    latestBenchmarkSummary: benchmarkReadiness,
    latestBenchmarkReasonCodes: benchmarkReasonCodes,
    latestBenchmarkFindingMessage: firstBlockingMessage(
      benchmarkReadiness,
      benchmarkReasonCodes,
      null,
    ),
    latestBepsFilingStatus: latestFiling?.status ?? null,
    latestBepsCycle: latestFiling?.complianceCycle ?? null,
    latestBepsHasRun: Boolean(latestFiling?.complianceRunId),
    latestBepsPacketStatus: latestPacket?.status ?? null,
    latestBepsPacketWarnings: latestPacketWarnings,
    activeAnomalyCount,
    totalAnomalyCount,
    highestActiveAnomalySeverity: highestActiveAnomaly?.severity ?? null,
    retrofitCandidateCount: retrofitCandidates.length,
    activeRetrofitCandidateCount: retrofitCandidates.filter(
      (candidate) => candidate.status !== "ARCHIVED" && candidate.status !== "COMPLETED",
    ).length,
    financingCaseCount: financingCase ? 1 : 0,
    latestFinancingPacketStatus: financingCase?.packets[0]?.status ?? null,
  });
}

export async function listPortfolioWorkflowSummaries(params: {
  organizationId: string;
  limit: number;
}): Promise<PortfolioWorkflowSummary> {
  const buildings = await prisma.building.findMany({
    where: {
      organizationId: params.organizationId,
    },
    orderBy: [{ updatedAt: "desc" }],
    take: params.limit,
    select: {
      id: true,
      name: true,
    },
  });

  const items = (
    await Promise.all(
      buildings.map(async (building) => {
        const summary = await getBuildingWorkflowSummary({
          organizationId: params.organizationId,
          buildingId: building.id,
        });

        if (!summary) {
          return null;
        }

        return {
          buildingId: building.id,
          buildingName: building.name,
          latestComplianceStatus: summary.latestComplianceStatus,
          latestPenaltyExposure: summary.latestPenaltyExposure,
          nextAction: summary.nextAction,
          stages: summary.stages,
        };
      }),
    )
  ).filter((item): item is NonNullable<typeof item> => item !== null);

  return {
    items,
    aggregate: {
      benchmarkingBlocked: items.filter(
        (item) =>
          item.stages.find((stage) => stage.key === "BENCHMARKING_READY")?.status ===
          "BLOCKED",
      ).length,
      needsBepsEvaluation: items.filter(
        (item) =>
          item.stages.find((stage) => stage.key === "BEPS_EVALUATED")?.status !==
          "COMPLETE",
      ).length,
      filingAttention: items.filter((item) => {
        const status = item.stages.find((stage) => stage.key === "FILING_PREPARED")?.status;
        return status === "NEEDS_ATTENTION" || status === "BLOCKED";
      }).length,
      operationalAttention: items.filter(
        (item) =>
          item.stages.find((stage) => stage.key === "OPERATIONS_REVIEWED")?.status ===
          "NEEDS_ATTENTION",
      ).length,
      retrofitReady: items.filter(
        (item) =>
          item.stages.find((stage) => stage.key === "RETROFIT_PLAN_AVAILABLE")?.status ===
          "COMPLETE",
      ).length,
      financingReady: items.filter(
        (item) =>
          item.stages.find((stage) => stage.key === "FINANCING_CASE_READY")?.status ===
          "COMPLETE",
      ).length,
    },
  };
}
