import { NotFoundError } from "@/server/lib/errors";
import {
  listBuildingOperationalStates,
  type BuildingIssueSummary,
  type BuildingOperationalState,
  type BuildingReadinessSummary,
} from "@/server/compliance/data-issues";
import {
  listStoredPenaltySummaries,
  type PenaltySummary,
} from "@/server/compliance/penalties";
import {
  listSubmissionWorkflowSummariesForArtifacts,
  type SubmissionWorkflowSummary,
} from "@/server/compliance/submission-workflows";
import {
  listBuildingSourceReconciliationOverviews,
  type BuildingSourceReconciliationOverview,
} from "@/server/compliance/source-reconciliation";
import {
  listBuildingIntegrationRuntimeSummaries,
  type BuildingIntegrationRuntimeSummary,
} from "@/server/compliance/integration-runtime";
import {
  listBuildingOperationalAnomalySummaries,
  type BuildingOperationalAnomalySummary,
} from "@/server/compliance/operations-anomalies";

export type GovernedArtifactStatus =
  | "NOT_STARTED"
  | "DRAFT"
  | "GENERATED"
  | "STALE"
  | "FINALIZED";

export interface GovernedArtifactSummary {
  scope: "BENCHMARKING" | "BEPS";
  sourceRecordId: string | null;
  sourceRecordStatus: string | null;
  latestArtifactId: string | null;
  latestArtifactStatus: GovernedArtifactStatus;
  reportingYear: number | null;
  filingYear: number | null;
  complianceCycle: string | null;
  lastGeneratedAt: string | null;
  lastFinalizedAt: string | null;
}

export interface GovernedComplianceSummary {
  primaryStatus: BuildingReadinessSummary["primaryStatus"];
  qaVerdict: string | null;
  reasonCodes: string[];
  reasonSummary: string;
  benchmark: BuildingReadinessSummary["evaluations"]["benchmark"];
  beps: BuildingReadinessSummary["evaluations"]["beps"];
}

export interface GovernedOperationalTimestamps {
  lastReadinessEvaluatedAt: string | null;
  lastComplianceEvaluatedAt: string | null;
  lastPenaltyCalculatedAt: string | null;
  lastArtifactGeneratedAt: string | null;
  lastArtifactFinalizedAt: string | null;
  lastSubmissionTransitionAt: string | null;
}

export interface GovernedSubmissionWorkflowSummary {
  benchmark: SubmissionWorkflowSummary | null;
  beps: SubmissionWorkflowSummary | null;
}

export interface BuildingGovernedOperationalSummary {
  buildingId: string;
  readinessSummary: BuildingReadinessSummary;
  issueSummary: {
    openIssues: BuildingIssueSummary["openIssues"];
  };
  activeIssueCounts: BuildingOperationalState["activeIssueCounts"];
  complianceSummary: GovernedComplianceSummary;
  penaltySummary: PenaltySummary | null;
  artifactSummary: {
    benchmark: GovernedArtifactSummary;
    beps: GovernedArtifactSummary;
  };
  reconciliationSummary: BuildingSourceReconciliationOverview;
  runtimeSummary: BuildingIntegrationRuntimeSummary;
  anomalySummary: BuildingOperationalAnomalySummary;
  submissionSummary: GovernedSubmissionWorkflowSummary;
  timestamps: GovernedOperationalTimestamps;
}

const EMPTY_RECONCILIATION_SUMMARY: BuildingSourceReconciliationOverview = {
  id: null,
  status: null,
  canonicalSource: null,
  referenceYear: null,
  conflictCount: 0,
  incompleteCount: 0,
  lastReconciledAt: null,
};

const EMPTY_RUNTIME_SUMMARY: BuildingIntegrationRuntimeSummary = {
  portfolioManager: {
    system: "PORTFOLIO_MANAGER",
    currentState: "NOT_CONNECTED",
    connectionStatus: null,
    lastAttemptedAt: null,
    lastSucceededAt: null,
    lastFailedAt: null,
    lastWebhookReceivedAt: null,
    attemptCount: 0,
    retryCount: 0,
    latestJobId: null,
    latestErrorCode: null,
    latestErrorMessage: null,
    isStale: false,
    needsAttention: false,
    attentionReason: null,
    staleReason: null,
    sourceRecordId: null,
  },
  greenButton: {
    system: "GREEN_BUTTON",
    currentState: "NOT_CONNECTED",
    connectionStatus: null,
    lastAttemptedAt: null,
    lastSucceededAt: null,
    lastFailedAt: null,
    lastWebhookReceivedAt: null,
    attemptCount: 0,
    retryCount: 0,
    latestJobId: null,
    latestErrorCode: null,
    latestErrorMessage: null,
    isStale: false,
    needsAttention: false,
    attentionReason: null,
    staleReason: null,
    sourceRecordId: null,
  },
  needsAttention: false,
  attentionCount: 0,
  nextAction: null,
};

function toArtifactStatus(value: string | null | undefined): GovernedArtifactStatus {
  return value === "DRAFT" ||
    value === "GENERATED" ||
    value === "STALE" ||
    value === "FINALIZED"
    ? value
    : "NOT_STARTED";
}

function maxIsoTimestamp(...values: Array<string | null | undefined>) {
  const timestamps = values.filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  if (timestamps.length === 0) {
    return null;
  }

  return timestamps.sort()[timestamps.length - 1] ?? null;
}

function buildArtifactSummary(
  readiness: BuildingReadinessSummary,
  scope: "BENCHMARKING" | "BEPS",
): GovernedArtifactSummary {
  if (scope === "BENCHMARKING") {
    return {
      scope,
      sourceRecordId: readiness.artifacts.benchmarkSubmission?.id ?? null,
      sourceRecordStatus: readiness.artifacts.benchmarkSubmission?.status ?? null,
      latestArtifactId: readiness.artifacts.benchmarkPacket?.id ?? null,
      latestArtifactStatus: toArtifactStatus(readiness.artifacts.benchmarkPacket?.status),
      reportingYear:
        readiness.artifacts.benchmarkSubmission?.reportingYear ??
        readiness.evaluations.benchmark?.reportingYear ??
        null,
      filingYear: null,
      complianceCycle: null,
      lastGeneratedAt: readiness.artifacts.benchmarkPacket?.generatedAt ?? null,
      lastFinalizedAt: readiness.artifacts.benchmarkPacket?.finalizedAt ?? null,
    };
  }

  return {
    scope,
    sourceRecordId: readiness.artifacts.bepsFiling?.id ?? null,
    sourceRecordStatus: readiness.artifacts.bepsFiling?.status ?? null,
    latestArtifactId: readiness.artifacts.bepsPacket?.id ?? null,
    latestArtifactStatus: toArtifactStatus(readiness.artifacts.bepsPacket?.status),
    reportingYear: null,
    filingYear:
      readiness.artifacts.bepsFiling?.filingYear ??
      readiness.evaluations.beps?.filingYear ??
      null,
    complianceCycle:
      readiness.artifacts.bepsFiling?.complianceCycle ??
      readiness.evaluations.beps?.complianceCycle ??
      null,
    lastGeneratedAt: readiness.artifacts.bepsPacket?.generatedAt ?? null,
    lastFinalizedAt: readiness.artifacts.bepsPacket?.finalizedAt ?? null,
  };
}

function buildGovernedOperationalSummary(input: {
  operationalState: BuildingOperationalState;
  penaltySummary: PenaltySummary | null;
  benchmarkWorkflow: SubmissionWorkflowSummary | null;
  bepsWorkflow: SubmissionWorkflowSummary | null;
  reconciliationSummary: BuildingSourceReconciliationOverview;
  runtimeSummary: BuildingIntegrationRuntimeSummary;
  anomalySummary: BuildingOperationalAnomalySummary;
}): BuildingGovernedOperationalSummary {
  const readiness = input.operationalState.readinessSummary;
  const benchmarkArtifact = buildArtifactSummary(readiness, "BENCHMARKING");
  const bepsArtifact = buildArtifactSummary(readiness, "BEPS");

  return {
    buildingId: input.operationalState.buildingId,
    readinessSummary: readiness,
    issueSummary: input.operationalState.issueSummary,
    activeIssueCounts: input.operationalState.activeIssueCounts,
    complianceSummary: {
      primaryStatus: readiness.primaryStatus,
      qaVerdict: readiness.qaVerdict,
      reasonCodes: readiness.reasonCodes,
      reasonSummary: readiness.reasonSummary,
      benchmark: readiness.evaluations.benchmark,
      beps: readiness.evaluations.beps,
    },
    penaltySummary: input.penaltySummary,
    artifactSummary: {
      benchmark: benchmarkArtifact,
      beps: bepsArtifact,
    },
    reconciliationSummary: input.reconciliationSummary,
    runtimeSummary: input.runtimeSummary,
    anomalySummary: input.anomalySummary,
    submissionSummary: {
      benchmark: input.benchmarkWorkflow,
      beps: input.bepsWorkflow,
    },
    timestamps: {
      lastReadinessEvaluatedAt: readiness.lastReadinessEvaluatedAt,
      lastComplianceEvaluatedAt: readiness.lastComplianceEvaluatedAt,
      lastPenaltyCalculatedAt: input.penaltySummary?.calculatedAt ?? null,
      lastArtifactGeneratedAt: maxIsoTimestamp(
        benchmarkArtifact.lastGeneratedAt,
        bepsArtifact.lastGeneratedAt,
      ),
      lastArtifactFinalizedAt: maxIsoTimestamp(
        benchmarkArtifact.lastFinalizedAt,
        bepsArtifact.lastFinalizedAt,
      ),
      lastSubmissionTransitionAt: maxIsoTimestamp(
        input.benchmarkWorkflow?.latestTransitionAt ?? null,
        input.bepsWorkflow?.latestTransitionAt ?? null,
      ),
    },
  };
}

export async function listBuildingGovernedOperationalSummaries(params: {
  organizationId: string;
  buildingIds: string[];
}) {
  const buildingIds = Array.from(new Set(params.buildingIds)).filter(Boolean);

  if (buildingIds.length === 0) {
    return new Map<string, BuildingGovernedOperationalSummary>();
  }

  const [operationalStates, penaltySummaries, runtimeSummaries, anomalySummaries] =
    await Promise.all([
      listBuildingOperationalStates({
        organizationId: params.organizationId,
        buildingIds,
      }),
      listStoredPenaltySummaries({
        organizationId: params.organizationId,
        buildingIds,
      }),
      listBuildingIntegrationRuntimeSummaries({
        organizationId: params.organizationId,
        buildingIds,
      }),
      listBuildingOperationalAnomalySummaries({
        organizationId: params.organizationId,
        buildingIds,
      }),
    ]);
  const reconciliationSummaries = await listBuildingSourceReconciliationOverviews({
    organizationId: params.organizationId,
    buildingIds,
  });

  const penaltyByBuildingId = new Map(
    penaltySummaries.map((entry) => [entry.buildingId, entry.summary]),
  );
  const workflowSummaries = await listSubmissionWorkflowSummariesForArtifacts({
    organizationId: params.organizationId,
    benchmarkPacketIds: Array.from(
      new Set(
        Array.from(operationalStates.values())
          .map((state) => state.readinessSummary.artifacts.benchmarkPacket?.id ?? null)
          .filter((value): value is string => value != null),
      ),
    ),
    filingPacketIds: Array.from(
      new Set(
        Array.from(operationalStates.values())
          .map((state) => state.readinessSummary.artifacts.bepsPacket?.id ?? null)
          .filter((value): value is string => value != null),
      ),
    ),
  });

  const summaries = new Map<string, BuildingGovernedOperationalSummary>();
  for (const buildingId of buildingIds) {
    const operationalState = operationalStates.get(buildingId);
    if (!operationalState) {
      continue;
    }

    summaries.set(
      buildingId,
      buildGovernedOperationalSummary({
        operationalState,
        penaltySummary: penaltyByBuildingId.get(buildingId) ?? null,
        benchmarkWorkflow: operationalState.readinessSummary.artifacts.benchmarkPacket?.id
          ? workflowSummaries.benchmarkByPacketId.get(
              operationalState.readinessSummary.artifacts.benchmarkPacket.id,
            ) ?? null
          : null,
        bepsWorkflow: operationalState.readinessSummary.artifacts.bepsPacket?.id
          ? workflowSummaries.bepsByPacketId.get(
              operationalState.readinessSummary.artifacts.bepsPacket.id,
            ) ?? null
          : null,
        reconciliationSummary:
          reconciliationSummaries.get(buildingId) ?? EMPTY_RECONCILIATION_SUMMARY,
        runtimeSummary: runtimeSummaries.get(buildingId) ?? EMPTY_RUNTIME_SUMMARY,
        anomalySummary: anomalySummaries.get(buildingId) ?? {
          activeCount: 0,
          highSeverityCount: 0,
          totalEstimatedEnergyImpactKbtu: null,
          totalEstimatedPenaltyImpactUsd: null,
          penaltyImpactStatus: "INSUFFICIENT_CONTEXT",
          highestPriority: null,
          latestDetectedAt: null,
          needsAttention: false,
          topAnomalies: [],
        },
      }),
    );
  }

  return summaries;
}

export async function getBuildingGovernedOperationalSummary(params: {
  organizationId: string;
  buildingId: string;
}) {
  const summaries = await listBuildingGovernedOperationalSummaries({
    organizationId: params.organizationId,
    buildingIds: [params.buildingId],
  });

  const summary = summaries.get(params.buildingId);
  if (!summary) {
    throw new NotFoundError("Building not found");
  }

  return summary;
}
