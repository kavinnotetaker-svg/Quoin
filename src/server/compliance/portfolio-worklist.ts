import { prisma } from "@/server/lib/db";
import { WorkflowStateError } from "@/server/lib/errors";
import { type BuildingReadinessState } from "@/server/compliance/data-issues";
import {
  listBuildingGovernedOperationalSummaries,
  type BuildingGovernedOperationalSummary,
} from "@/server/compliance/governed-operational-summary";
import { type BuildingIntegrationRuntimeSummary } from "@/server/compliance/integration-runtime";
import { type PenaltySummary } from "@/server/compliance/penalties";
import { type SubmissionWorkflowSummary } from "@/server/compliance/submission-workflows";

export type WorklistArtifactStatus =
  | "NOT_STARTED"
  | "GENERATED"
  | "STALE"
  | "FINALIZED";

export type PortfolioWorklistSort =
  | "PRIORITY"
  | "NAME"
  | "PENALTY"
  | "LAST_COMPLIANCE_EVALUATED";

export type PortfolioWorklistNextActionCode =
  | "RESOLVE_BLOCKING_ISSUES"
  | "REFRESH_INTEGRATION"
  | "REGENERATE_ARTIFACT"
  | "FINALIZE_ARTIFACT"
  | "REVIEW_COMPLIANCE_RESULT"
  | "SUBMIT_ARTIFACT"
  | "MONITOR_SUBMISSION";

export interface PortfolioWorklistArtifactSummary {
  status: WorklistArtifactStatus;
  sourceRecordId: string | null;
  generatedAt: string | null;
  finalizedAt: string | null;
}

export interface PortfolioWorklistSubmissionSummary {
  state: SubmissionWorkflowSummary["state"];
  workflowId: string | null;
  latestTransitionAt: string | null;
}

export interface PortfolioWorklistItem {
  buildingId: string;
  buildingName: string;
  address: string;
  propertyType: string;
  grossSquareFeet: number | null;
  readinessState: BuildingReadinessState;
  blockingIssueCount: number;
  warningIssueCount: number;
  nextAction: {
    code: PortfolioWorklistNextActionCode;
    title: string;
    reason: string;
  };
  complianceSummary: {
    primaryStatus: string;
    qaVerdict: string | null;
    reasonSummary: string;
  };
  penaltySummary: Pick<
    PenaltySummary,
    "id" | "status" | "currentEstimatedPenalty" | "calculatedAt"
  > | null;
  anomalySummary: {
    activeCount: number;
    highSeverityCount: number;
    totalEstimatedEnergyImpactKbtu: number | null;
    totalEstimatedPenaltyImpactUsd: number | null;
    penaltyImpactStatus: "ESTIMATED" | "INSUFFICIENT_CONTEXT" | "NOT_APPLICABLE";
    needsAttention: boolean;
  };
  artifacts: {
    benchmark: PortfolioWorklistArtifactSummary;
    beps: PortfolioWorklistArtifactSummary;
  };
  runtime: BuildingIntegrationRuntimeSummary;
  submission: {
    benchmark: PortfolioWorklistSubmissionSummary;
    beps: PortfolioWorklistSubmissionSummary;
  };
  timestamps: {
    lastReadinessEvaluatedAt: string | null;
    lastComplianceEvaluatedAt: string | null;
    lastPenaltyCalculatedAt: string | null;
    lastArtifactGeneratedAt: string | null;
    lastArtifactFinalizedAt: string | null;
    lastSubmissionTransitionAt: string | null;
  };
  flags: {
    blocked: boolean;
    readyForReview: boolean;
    readyToSubmit: boolean;
    submitted: boolean;
    hasPenaltyExposure: boolean;
    needsCorrection: boolean;
    needsSyncAttention: boolean;
    needsAnomalyAttention: boolean;
  };
}

export interface PortfolioWorklistAggregate {
  totalBuildings: number;
  blocked: number;
  readyForReview: number;
  readyToSubmit: number;
  submitted: number;
  needsCorrection: number;
  withPenaltyExposure: number;
  withSyncAttention: number;
  withOperationalRisk: number;
  withDraftArtifacts: number;
  finalizedAwaitingNextAction: number;
}

export interface PortfolioWorklistResult {
  items: PortfolioWorklistItem[];
  aggregate: PortfolioWorklistAggregate;
}

interface PortfolioWorklistParams {
  organizationId: string;
  search?: string;
  readinessState?: BuildingReadinessState;
  hasBlockingIssues?: boolean;
  hasPenaltyExposure?: boolean;
  artifactStatus?: WorklistArtifactStatus;
  nextAction?: PortfolioWorklistNextActionCode;
  sortBy?: PortfolioWorklistSort;
}

function toWorklistArtifactStatus(value: string | null | undefined): WorklistArtifactStatus {
  return value === "GENERATED" ||
    value === "STALE" ||
    value === "FINALIZED"
    ? value
    : "NOT_STARTED";
}

function deriveNextAction(
  summary: BuildingGovernedOperationalSummary,
): PortfolioWorklistItem["nextAction"] {
  const readiness = summary.readinessSummary;
  const benchmarkPacketStatus = toWorklistArtifactStatus(
    summary.artifactSummary.benchmark.latestArtifactStatus,
  );
  const bepsPacketStatus = toWorklistArtifactStatus(readiness.artifacts.bepsPacket?.status);
  const benchmarkWorkflow = summary.submissionSummary.benchmark;
  const bepsWorkflow = summary.submissionSummary.beps;

  if (
    benchmarkWorkflow?.state === "NEEDS_CORRECTION" ||
    bepsWorkflow?.state === "NEEDS_CORRECTION"
  ) {
    return {
      code: "REGENERATE_ARTIFACT",
      title: "Correct and regenerate the artifact",
      reason: "The latest submission workflow requires correction before it can proceed.",
    };
  }

  if (
    benchmarkWorkflow?.state === "APPROVED_FOR_SUBMISSION" ||
    bepsWorkflow?.state === "APPROVED_FOR_SUBMISSION"
  ) {
    return {
      code: "SUBMIT_ARTIFACT",
      title: "Record the governed submission",
      reason: "A finalized artifact has been approved and is ready for submission operations.",
    };
  }

  if (
    benchmarkWorkflow?.state === "SUBMITTED" ||
    benchmarkWorkflow?.state === "COMPLETED" ||
    bepsWorkflow?.state === "SUBMITTED" ||
    bepsWorkflow?.state === "COMPLETED"
  ) {
    return {
      code: "MONITOR_SUBMISSION",
      title: "Monitor submission outcome",
      reason: "Submission has already been recorded for the current governed artifact.",
    };
  }

  if (
    benchmarkWorkflow?.state === "READY_FOR_REVIEW" ||
    bepsWorkflow?.state === "READY_FOR_REVIEW"
  ) {
    return {
      code: "REVIEW_COMPLIANCE_RESULT",
      title: "Review the finalized artifact",
      reason: "A finalized governed artifact is ready for consultant review.",
    };
  }

  if (readiness.blockingIssueCount > 0) {
    return {
      code: "RESOLVE_BLOCKING_ISSUES",
      title: readiness.nextAction.title,
      reason: readiness.nextAction.reason,
    };
  }

  if (summary.runtimeSummary.nextAction) {
    return {
      code: "REFRESH_INTEGRATION",
      title: summary.runtimeSummary.nextAction.title,
      reason: summary.runtimeSummary.nextAction.reason,
    };
  }

  if (benchmarkPacketStatus === "STALE" || bepsPacketStatus === "STALE") {
    return {
      code: "REGENERATE_ARTIFACT",
      title: "Regenerate the governed artifact",
      reason: "An upstream change has made the latest artifact stale.",
    };
  }

  if (benchmarkPacketStatus === "GENERATED" || bepsPacketStatus === "GENERATED") {
    return {
      code: "FINALIZE_ARTIFACT",
      title: "Finalize the governed artifact",
      reason: "A generated artifact is ready for consultant review and lock.",
    };
  }

  switch (readiness.state) {
    case "READY_FOR_REVIEW":
      return {
        code: "REVIEW_COMPLIANCE_RESULT",
        title: readiness.nextAction.title,
        reason: readiness.nextAction.reason,
      };
    case "READY_TO_SUBMIT":
      return {
        code: "SUBMIT_ARTIFACT",
        title: readiness.nextAction.title,
        reason: readiness.nextAction.reason,
      };
    case "SUBMITTED":
      return {
        code: "MONITOR_SUBMISSION",
        title: readiness.nextAction.title,
        reason: readiness.nextAction.reason,
      };
    default:
      return {
        code: "RESOLVE_BLOCKING_ISSUES",
        title: readiness.nextAction.title,
        reason: readiness.nextAction.reason,
      };
  }
}

function priorityRank(item: PortfolioWorklistItem) {
  if (item.flags.blocked) {
    return 0;
  }
  if (item.nextAction.code === "REGENERATE_ARTIFACT") {
    return 1;
  }
  if (item.nextAction.code === "FINALIZE_ARTIFACT") {
    return 2;
  }
  if (item.flags.readyForReview) {
    return 3;
  }
  if (item.flags.readyToSubmit) {
    return 4;
  }
  if (item.flags.submitted) {
    return 5;
  }
  return 6;
}

function sortItems(items: PortfolioWorklistItem[], sortBy: PortfolioWorklistSort) {
  return [...items].sort((left, right) => {
    switch (sortBy) {
      case "NAME":
        return left.buildingName.localeCompare(right.buildingName);
      case "PENALTY":
        return (
          (right.penaltySummary?.currentEstimatedPenalty ?? -1) -
          (left.penaltySummary?.currentEstimatedPenalty ?? -1)
        );
      case "LAST_COMPLIANCE_EVALUATED":
        return (right.timestamps.lastComplianceEvaluatedAt ?? "").localeCompare(
          left.timestamps.lastComplianceEvaluatedAt ?? "",
        );
      default: {
        const rankDelta = priorityRank(left) - priorityRank(right);
        if (rankDelta !== 0) {
          return rankDelta;
        }

        const blockingDelta = right.blockingIssueCount - left.blockingIssueCount;
        if (blockingDelta !== 0) {
          return blockingDelta;
        }

        const penaltyDelta =
          (right.penaltySummary?.currentEstimatedPenalty ?? -1) -
          (left.penaltySummary?.currentEstimatedPenalty ?? -1);
        if (penaltyDelta !== 0) {
          return penaltyDelta;
        }

        return left.buildingName.localeCompare(right.buildingName);
      }
    }
  });
}

function matchesArtifactStatus(
  item: PortfolioWorklistItem,
  artifactStatus: WorklistArtifactStatus,
) {
  return (
    item.artifacts.benchmark.status === artifactStatus ||
    item.artifacts.beps.status === artifactStatus
  );
}

function toAggregate(items: PortfolioWorklistItem[]): PortfolioWorklistAggregate {
  return items.reduce<PortfolioWorklistAggregate>(
    (acc, item) => {
      acc.totalBuildings += 1;
      if (item.flags.blocked) {
        acc.blocked += 1;
      }
      if (item.flags.readyForReview) {
        acc.readyForReview += 1;
      }
      if (item.flags.readyToSubmit) {
        acc.readyToSubmit += 1;
      }
      if (item.flags.submitted) {
        acc.submitted += 1;
      }
      if (item.flags.needsCorrection) {
        acc.needsCorrection += 1;
      }
      if (item.flags.hasPenaltyExposure) {
        acc.withPenaltyExposure += 1;
      }
      if (item.flags.needsSyncAttention) {
        acc.withSyncAttention += 1;
      }
      if (item.flags.needsAnomalyAttention) {
        acc.withOperationalRisk += 1;
      }
      if (
        item.artifacts.benchmark.status === "GENERATED" ||
        item.artifacts.benchmark.status === "STALE" ||
        item.artifacts.beps.status === "GENERATED" ||
        item.artifacts.beps.status === "STALE"
      ) {
        acc.withDraftArtifacts += 1;
      }
      if (
        !item.flags.submitted &&
        ((item.artifacts.benchmark.status === "FINALIZED" &&
          item.submission.benchmark.state !== "COMPLETED") ||
          (item.artifacts.beps.status === "FINALIZED" &&
            item.submission.beps.state !== "COMPLETED"))
      ) {
        acc.finalizedAwaitingNextAction += 1;
      }
      return acc;
    },
    {
      totalBuildings: 0,
      blocked: 0,
      readyForReview: 0,
      readyToSubmit: 0,
      submitted: 0,
      needsCorrection: 0,
      withPenaltyExposure: 0,
      withSyncAttention: 0,
      withOperationalRisk: 0,
      withDraftArtifacts: 0,
      finalizedAwaitingNextAction: 0,
    },
  );
}

export async function getPortfolioWorklist(
  params: PortfolioWorklistParams,
): Promise<PortfolioWorklistResult> {
  const buildings = await prisma.building.findMany({
    where: {
      organizationId: params.organizationId,
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: "insensitive" } },
              { address: { contains: params.search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      address: true,
      propertyType: true,
      grossSquareFeet: true,
    },
  });

  const buildingIds = buildings.map((building) => building.id);
  const governedSummaries = await listBuildingGovernedOperationalSummaries({
    organizationId: params.organizationId,
    buildingIds,
  });

  const items = buildings.map<PortfolioWorklistItem>((building) => {
    const governedSummary = governedSummaries.get(building.id);
    if (!governedSummary) {
      throw new WorkflowStateError(
        "Portfolio worklist requires an operational state for every building.",
      );
    }

    const readiness = governedSummary.readinessSummary;
    const penaltySummary = governedSummary.penaltySummary;
    const nextAction = deriveNextAction(governedSummary);
    const benchmarkArtifact: PortfolioWorklistArtifactSummary = {
      status: toWorklistArtifactStatus(
        governedSummary.artifactSummary.benchmark.latestArtifactStatus,
      ),
      sourceRecordId: governedSummary.artifactSummary.benchmark.sourceRecordId,
      generatedAt: governedSummary.artifactSummary.benchmark.lastGeneratedAt,
      finalizedAt: governedSummary.artifactSummary.benchmark.lastFinalizedAt,
    };
    const bepsArtifact: PortfolioWorklistArtifactSummary = {
      status: toWorklistArtifactStatus(
        governedSummary.artifactSummary.beps.latestArtifactStatus,
      ),
      sourceRecordId: governedSummary.artifactSummary.beps.sourceRecordId,
      generatedAt: governedSummary.artifactSummary.beps.lastGeneratedAt,
      finalizedAt: governedSummary.artifactSummary.beps.lastFinalizedAt,
    };

    return {
      buildingId: building.id,
      buildingName: building.name,
      address: building.address,
      propertyType: building.propertyType,
      grossSquareFeet: building.grossSquareFeet ?? null,
      readinessState: readiness.state,
      blockingIssueCount: readiness.blockingIssueCount,
      warningIssueCount: readiness.warningIssueCount,
      nextAction,
      complianceSummary: {
        primaryStatus: governedSummary.complianceSummary.primaryStatus,
        qaVerdict: governedSummary.complianceSummary.qaVerdict,
        reasonSummary: governedSummary.complianceSummary.reasonSummary,
      },
      penaltySummary: penaltySummary
        ? {
            id: penaltySummary.id,
            status: penaltySummary.status,
            currentEstimatedPenalty: penaltySummary.currentEstimatedPenalty,
            calculatedAt: penaltySummary.calculatedAt,
          }
        : null,
      anomalySummary: {
        activeCount: governedSummary.anomalySummary.activeCount,
        highSeverityCount: governedSummary.anomalySummary.highSeverityCount,
        totalEstimatedEnergyImpactKbtu:
          governedSummary.anomalySummary.totalEstimatedEnergyImpactKbtu,
        totalEstimatedPenaltyImpactUsd:
          governedSummary.anomalySummary.totalEstimatedPenaltyImpactUsd,
        penaltyImpactStatus: governedSummary.anomalySummary.penaltyImpactStatus,
        needsAttention: governedSummary.anomalySummary.needsAttention,
      },
      artifacts: {
        benchmark: benchmarkArtifact,
        beps: bepsArtifact,
      },
      runtime: governedSummary.runtimeSummary,
      submission: {
        benchmark: {
          state: governedSummary.submissionSummary.benchmark?.state ?? "NOT_STARTED",
          workflowId: governedSummary.submissionSummary.benchmark?.id ?? null,
          latestTransitionAt:
            governedSummary.submissionSummary.benchmark?.latestTransitionAt ?? null,
        },
        beps: {
          state: governedSummary.submissionSummary.beps?.state ?? "NOT_STARTED",
          workflowId: governedSummary.submissionSummary.beps?.id ?? null,
          latestTransitionAt:
            governedSummary.submissionSummary.beps?.latestTransitionAt ?? null,
        },
      },
      timestamps: {
        lastReadinessEvaluatedAt: governedSummary.timestamps.lastReadinessEvaluatedAt,
        lastComplianceEvaluatedAt: governedSummary.timestamps.lastComplianceEvaluatedAt,
        lastPenaltyCalculatedAt: governedSummary.timestamps.lastPenaltyCalculatedAt,
        lastArtifactGeneratedAt: governedSummary.timestamps.lastArtifactGeneratedAt,
        lastArtifactFinalizedAt: governedSummary.timestamps.lastArtifactFinalizedAt,
        lastSubmissionTransitionAt: governedSummary.timestamps.lastSubmissionTransitionAt,
      },
      flags: {
        blocked: readiness.state === "DATA_INCOMPLETE",
        readyForReview: readiness.state === "READY_FOR_REVIEW",
        readyToSubmit: readiness.state === "READY_TO_SUBMIT",
        submitted: readiness.state === "SUBMITTED",
        hasPenaltyExposure:
          penaltySummary?.status === "ESTIMATED" &&
          (penaltySummary.currentEstimatedPenalty ?? 0) > 0,
        needsCorrection:
          governedSummary.submissionSummary.benchmark?.state === "NEEDS_CORRECTION" ||
          governedSummary.submissionSummary.beps?.state === "NEEDS_CORRECTION",
        needsSyncAttention: governedSummary.runtimeSummary.needsAttention,
        needsAnomalyAttention: governedSummary.anomalySummary.needsAttention,
      },
    };
  });

  const filteredItems = items.filter((item) => {
    if (params.readinessState && item.readinessState !== params.readinessState) {
      return false;
    }
    if (
      params.hasBlockingIssues != null &&
      (item.blockingIssueCount > 0) !== params.hasBlockingIssues
    ) {
      return false;
    }
    if (
      params.hasPenaltyExposure != null &&
      item.flags.hasPenaltyExposure !== params.hasPenaltyExposure
    ) {
      return false;
    }
    if (
      params.artifactStatus &&
      !matchesArtifactStatus(item, params.artifactStatus)
    ) {
      return false;
    }
    if (params.nextAction && item.nextAction.code !== params.nextAction) {
      return false;
    }
    return true;
  });

  return {
    items: sortItems(filteredItems, params.sortBy ?? "PRIORITY"),
    aggregate: toAggregate(items),
  };
}
