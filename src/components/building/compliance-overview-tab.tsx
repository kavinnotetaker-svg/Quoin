"use client";

import React from "react";
import { trpc } from "@/lib/trpc";
import { ArtifactWorkspacePanel } from "./artifact-workspace-panel";
import {
  Panel,
  formatDate,
  formatMoney,
} from "@/components/internal/admin-primitives";
import {
  StatusBadge,
  getDataIssueSeverityDisplay,
  getDataIssueStatusDisplay,
  getOperationalAnomalyConfidenceDisplay,
  getOperationalAnomalyPenaltyImpactDisplay,
  getPrimaryComplianceStatusDisplay,
  getRuntimeStatusDisplay,
  getSourceReconciliationStatusDisplay,
  getSubmissionReadinessDisplay,
  getVerificationStatusDisplay,
} from "@/components/internal/status-helpers";

function metricLabel(metric: string | null) {
  return metric ? metric.replaceAll("_", " ") : "Not recorded";
}

function decisionLabel(input: {
  status: string | null;
  meetsStandard: boolean | null;
  blocked: boolean;
}) {
  if (input.blocked || input.status === "BLOCKED") {
    return "Blocked by data or workflow issues";
  }

  if (input.meetsStandard === true) {
    return "Meets current standard";
  }

  if (input.meetsStandard === false) {
    return "Does not meet current standard";
  }

  return "Decision not recorded";
}

function getPenaltyStatusDisplay(status: string) {
  switch (status) {
    case "ESTIMATED":
      return { label: "Estimated", tone: "warning" as const };
    case "NOT_APPLICABLE":
      return { label: "Not applicable", tone: "muted" as const };
    default:
      return { label: "Insufficient context", tone: "muted" as const };
  }
}

function sourceLabel(value: string | null) {
  return value ? value.replaceAll("_", " ") : "Not selected";
}

function sourceRecordStateLabel(value: string) {
  switch (value) {
    case "AVAILABLE":
      return "Available";
    case "INCOMPLETE":
      return "Incomplete";
    default:
      return "Unavailable";
  }
}

function anomalyTypeLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

type PenaltySummaryShape = {
  id: string;
  calculationMode: string;
  calculatedAt: string;
  status: string;
  currentEstimatedPenalty: number | null;
  currency: string;
  basis: {
    code: string;
    label: string;
    explanation: string;
  };
  governingContext: {
    filingYear: number | null;
    basisPathway: string | null;
    ruleVersion: string | null;
  };
  timestamps: {
    lastReadinessEvaluatedAt: string | null;
    lastComplianceEvaluatedAt: string | null;
    lastPacketGeneratedAt: string | null;
  };
  keyDrivers: Array<{
    code: string;
    label: string;
    value: string;
  }>;
  scenarios: Array<{
    code: string;
    label: string;
    description: string;
    estimatedPenalty: number;
    deltaFromCurrent: number;
    metricChange: {
      label: string;
      from: number;
      to: number;
    } | null;
  }>;
};

export function ComplianceOverviewTab({
  building,
  verificationChecklist,
}: {
  building: {
    id: string;
    complianceCycle: string;
    operatorAccess: {
      canManage: boolean;
      appRole: string;
    };
    governedSummary: {
      penaltySummary: PenaltySummaryShape | null;
      timestamps: {
        lastSubmissionTransitionAt: string | null;
      };
      anomalySummary: {
        activeCount: number;
        highSeverityCount: number;
        totalEstimatedEnergyImpactKbtu: number | null;
        totalEstimatedPenaltyImpactUsd: number | null;
        penaltyImpactStatus: string;
        highestPriority: string | null;
        latestDetectedAt: string | null;
        needsAttention: boolean;
        topAnomalies: Array<{
          id: string;
          anomalyType: string;
          severity: string;
          confidenceBand: string;
          title: string;
          explanation: string;
          estimatedEnergyImpactKbtu: number | null;
          estimatedPenaltyImpactUsd: number | null;
          penaltyImpactStatus: string;
        }>;
      };
      retrofitSummary: {
        activeCount: number;
        highestPriorityBand: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
        topOpportunity: {
          candidateId: string;
          name: string;
          projectType: string;
          priorityScore: number;
          priorityBand: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
          estimatedAvoidedPenalty: number | null;
          estimatedAvoidedPenaltyStatus: string;
          estimatedAnnualSavingsKbtu: number | null;
          netProjectCost: number;
          estimatedOperationalRiskReduction: {
            energyImpactKbtu: number | null;
            penaltyImpactUsd: number | null;
            status: string;
            explanation: string;
          };
          basis: {
            summary: string;
            explanation: string;
            assumptions: string[];
          };
          reasonCodes: string[];
          rationale: {
            deadlineDate: string | null;
            monthsUntilDeadline: number | null;
            anomalyContextCount: number;
          };
        } | null;
        opportunities: Array<{
          candidateId: string;
          name: string;
          projectType: string;
          priorityScore: number;
          priorityBand: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
          estimatedAvoidedPenalty: number | null;
          estimatedAvoidedPenaltyStatus: string;
          netProjectCost: number;
          estimatedOperationalRiskReduction: {
            energyImpactKbtu: number | null;
            penaltyImpactUsd: number | null;
            status: string;
            explanation: string;
          };
          basis: {
            summary: string;
            explanation: string;
            assumptions: string[];
          };
          reasonCodes: string[];
          rationale: {
            deadlineDate: string | null;
            monthsUntilDeadline: number | null;
            anomalyContextCount: number;
          };
        }>;
      };
      runtimeSummary: {
        needsAttention: boolean;
        attentionCount: number;
        nextAction: {
          title: string;
          reason: string;
        } | null;
        portfolioManager: {
          currentState: string;
          lastAttemptedAt: string | null;
          lastSucceededAt: string | null;
          lastFailedAt: string | null;
          attemptCount: number;
          retryCount: number;
          latestErrorCode: string | null;
          latestErrorMessage: string | null;
          isStale: boolean;
          attentionReason: string | null;
        };
        greenButton: {
          currentState: string;
          connectionStatus: string | null;
          lastWebhookReceivedAt: string | null;
          lastAttemptedAt: string | null;
          lastSucceededAt: string | null;
          lastFailedAt: string | null;
          attemptCount: number;
          retryCount: number;
          latestErrorCode: string | null;
          latestErrorMessage: string | null;
          isStale: boolean;
          attentionReason: string | null;
        };
      };
    };
    readinessSummary: {
      state: string;
      blockingIssueCount: number;
      warningIssueCount: number;
      primaryStatus: string;
      qaVerdict: string | null;
      reasonSummary: string;
      lastReadinessEvaluatedAt: string | null;
      lastComplianceEvaluatedAt: string | null;
      lastPacketGeneratedAt: string | null;
      lastPacketFinalizedAt: string | null;
      nextAction: {
        title: string;
        reason: string;
      };
      evaluations: {
        benchmark: {
          reportingYear: number | null;
          ruleVersion: string | null;
          metricUsed: string | null;
          status: string | null;
          reasonSummary: string;
          decision: {
            meetsStandard: boolean | null;
            blocked: boolean;
          };
          lastComplianceEvaluatedAt: string | null;
        } | null;
        beps: {
          filingYear: number | null;
          complianceCycle: string | null;
          ruleVersion: string | null;
          metricUsed: string | null;
          status: string | null;
          reasonSummary: string;
          decision: {
            meetsStandard: boolean | null;
            blocked: boolean;
          };
          lastComplianceEvaluatedAt: string | null;
        } | null;
      };
      artifacts: {
        benchmarkSubmission: {
          status: string;
          reportingYear: number;
          lastReadinessEvaluatedAt: string | null;
          lastComplianceEvaluatedAt: string | null;
        } | null;
        benchmarkPacket: {
          status: string;
          generatedAt: string;
          finalizedAt: string | null;
        } | null;
        bepsFiling: {
          status: string;
          filingYear: number | null;
          complianceCycle: string | null;
          lastComplianceEvaluatedAt: string | null;
        } | null;
        bepsPacket: {
          status: string;
          generatedAt: string;
          finalizedAt: string | null;
        } | null;
      };
    };
    issueSummary: {
      openIssues: Array<{
        id: string;
        reportingYear: number | null;
        issueType: string;
        severity: string;
        status: string;
        title: string;
        description: string;
        requiredAction: string;
        source: string;
      }>;
    };
    recentAuditLogs: Array<{
      id: string;
      timestamp: string | Date;
      action: string;
      errorCode: string | null;
      requestId: string | null;
    }>;
    sourceReconciliation: {
      id: string | null;
      status: string | null;
      canonicalSource: string | null;
      referenceYear: number | null;
      conflictCount: number;
      incompleteCount: number;
      lastReconciledAt: string | null;
      sourceRecords: Array<{
        sourceSystem: string;
        state: string;
        linkedRecordId: string | null;
        externalRecordId: string | null;
        readingCount: number;
        coverageMonthCount: number;
        coverageMonths: string[];
        totalConsumptionKbtu: number | null;
        latestIngestedAt: string | null;
      }>;
      conflicts: Array<{
        code: string;
        severity: string;
        message: string;
        sourceSystems: string[];
        meterId: string | null;
        meterName: string | null;
      }>;
      meters: Array<{
        meterId: string;
        meterName: string;
        meterType: string;
        unit: string;
        status: string;
        canonicalSource: string | null;
        coverageMonthCount: number;
        sourceRecords: Array<{
          sourceSystem: string;
          state: string;
          externalRecordId: string | null;
          readingCount: number;
          coverageMonthCount: number;
          totalConsumptionKbtu: number | null;
          latestIngestedAt: string | null;
        }>;
        conflicts: Array<{
          code: string;
          severity: string;
          message: string;
        }>;
      }>;
    } | null;
    operationalAnomalies: Array<{
      id: string;
      anomalyType: string;
      severity: string;
      status: string;
      confidenceBand: string;
      confidenceScore: number | null;
      title: string;
      summary: string;
      explanation: string;
      causeHypothesis: string | null;
      detectionWindowEnd: string;
      estimatedEnergyImpactKbtu: number | null;
      estimatedPenaltyImpactUsd: number | null;
      penaltyImpactStatus: string;
      attribution: {
        penaltyImpactExplanation: string;
      };
      meter: {
        id: string;
        name: string;
        meterType: string;
      } | null;
    }>;
  };
  verificationChecklist:
    | {
        summary: {
          passedCount: number;
          failedCount: number;
          needsReviewCount: number;
        };
        items: Array<{
          key: string;
          status: string;
          explanation: string;
          evidenceRefs: string[];
        }>;
      }
    | null
    | undefined;
}) {
  const utils = trpc.useUtils();
  const [operatorFeedback, setOperatorFeedback] = React.useState<string | null>(null);
  const readiness = building.readinessSummary;
  const penaltySummary = building.governedSummary.penaltySummary;
  const anomalySummary = building.governedSummary.anomalySummary;
  const retrofitSummary = building.governedSummary.retrofitSummary;
  const runtimeSummary = building.governedSummary.runtimeSummary;
  const operationalAnomalies = building.operationalAnomalies;
  const benchmarkReportingYear = readiness.evaluations.benchmark?.reportingYear ?? null;
  const canManageOperatorControls = building.operatorAccess.canManage;

  const invalidateOperationalViews = async () => {
    await Promise.all([
      utils.building.get.invalidate({ id: building.id }),
      utils.building.list.invalidate(),
      utils.building.portfolioWorklist.invalidate(),
      utils.building.getArtifactWorkspace.invalidate({ buildingId: building.id }),
      benchmarkReportingYear
        ? utils.benchmarking.getVerificationChecklist.invalidate({
            buildingId: building.id,
            reportingYear: benchmarkReportingYear,
          })
        : Promise.resolve(),
    ]);
  };

  const updateIssueStatus = trpc.building.updateIssueStatus.useMutation({
    onSuccess: invalidateOperationalViews,
  });
  const retryPortfolioManagerSync = trpc.building.retryPortfolioManagerSync.useMutation({
    onSuccess: invalidateOperationalViews,
  });
  const reenqueueGreenButtonIngestion = trpc.building.reenqueueGreenButtonIngestion.useMutation({
    onSuccess: invalidateOperationalViews,
  });
  const rerunSourceReconciliation = trpc.building.rerunSourceReconciliation.useMutation({
    onSuccess: invalidateOperationalViews,
  });
  const refreshPenaltySummary = trpc.building.refreshPenaltySummary.useMutation({
    onSuccess: invalidateOperationalViews,
  });
  const activeIssues = building.issueSummary.openIssues.filter(
    (issue) => issue.status === "OPEN" || issue.status === "IN_PROGRESS",
  );
  const reconciliation = building.sourceReconciliation;
  const primaryDisplay = getPrimaryComplianceStatusDisplay(readiness.primaryStatus);
  const readinessDisplay = getSubmissionReadinessDisplay(readiness.state);
  const qaDisplay = getVerificationStatusDisplay(readiness.qaVerdict ?? "FAIL");
  const reconciliationDisplay = getSourceReconciliationStatusDisplay(
    reconciliation?.status,
  );

  async function runOperatorAction(
    action: () => Promise<{ message?: string | null }>,
  ) {
    setOperatorFeedback(null);

    try {
      const result = await action();
      setOperatorFeedback(result.message ?? "Operator action completed.");
    } catch (error) {
      setOperatorFeedback(
        error instanceof Error ? error.message : "Operator action failed.",
      );
    }
  }

  return (
    <div className="space-y-6">
      <Panel
        title="Compliance decision"
        subtitle="This summary is taken from the latest persisted compliance-engine results for benchmarking and BEPS."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Submission readiness
            </div>
            <div className="mt-2">
              <StatusBadge label={readinessDisplay.label} tone={readinessDisplay.tone} />
            </div>
            <div className="mt-2 text-sm text-zinc-600">
              {readiness.nextAction.reason}
            </div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              QA verdict
            </div>
            <div className="mt-2">
              <StatusBadge label={qaDisplay.label} tone={qaDisplay.tone} />
            </div>
            <div className="mt-2 text-sm text-zinc-600">
              {verificationChecklist
                ? `${verificationChecklist.summary.failedCount} failed, ${verificationChecklist.summary.needsReviewCount} needs review`
                : "No verification checklist has been recorded yet."}
            </div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Compliance result
            </div>
            <div className="mt-2">
              <StatusBadge label={primaryDisplay.label} tone={primaryDisplay.tone} />
            </div>
            <div className="mt-2 text-sm text-zinc-600">
              {readiness.blockingIssueCount > 0
                ? `${readiness.blockingIssueCount} blocking issue(s) must be resolved before the compliance result is submission-ready.`
                : "The latest governed compliance result is available below."}
            </div>
          </div>
        </div>
      </Panel>

      <Panel
        title="Open data issues"
        subtitle="These are the persistent issues currently blocking or slowing this building's path to review and submission."
      >
        {activeIssues.length === 0 ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            No open data issues remain. This building is ready to move through review based on the latest records.
          </div>
        ) : (
          <div className="space-y-3">
            {activeIssues.map((issue) => {
              const severity = getDataIssueSeverityDisplay(issue.severity);
              const status = getDataIssueStatusDisplay(issue.status);
              const isBlocking = issue.severity === "BLOCKING";
              const isBusy =
                updateIssueStatus.isPending &&
                updateIssueStatus.variables?.issueId === issue.id;

              return (
                <div
                  key={issue.id}
                  className="rounded-lg border border-zinc-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-zinc-900">{issue.title}</div>
                      <div className="mt-1 text-sm text-zinc-500">
                        {issue.reportingYear
                          ? `Reporting year ${issue.reportingYear}`
                          : "Current building state"}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge label={severity.label} tone={severity.tone} />
                      <StatusBadge label={status.label} tone={status.tone} />
                    </div>
                  </div>
                  <div className="mt-3 text-sm text-zinc-600">{issue.description}</div>
                  <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                    <span className="font-semibold text-zinc-900">Required action:</span>{" "}
                    {issue.requiredAction}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {issue.status === "OPEN" ? (
                      <button
                        type="button"
                        onClick={() =>
                          updateIssueStatus.mutate({
                            buildingId: building.id,
                            issueId: issue.id,
                            nextStatus: "IN_PROGRESS",
                          })
                        }
                        disabled={isBusy}
                        className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900 disabled:opacity-50"
                      >
                        Mark in progress
                      </button>
                    ) : null}
                    {!isBlocking ? (
                      <>
                        {issue.status !== "RESOLVED" ? (
                          <button
                            type="button"
                            onClick={() =>
                              updateIssueStatus.mutate({
                                buildingId: building.id,
                                issueId: issue.id,
                                nextStatus: "RESOLVED",
                              })
                            }
                            disabled={isBusy}
                            className="rounded-md border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:border-emerald-400 hover:text-emerald-800 disabled:opacity-50"
                          >
                            Mark resolved
                          </button>
                        ) : null}
                        {issue.status !== "DISMISSED" ? (
                          <button
                            type="button"
                            onClick={() =>
                              updateIssueStatus.mutate({
                                buildingId: building.id,
                                issueId: issue.id,
                                nextStatus: "DISMISSED",
                              })
                            }
                            disabled={isBusy}
                            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900 disabled:opacity-50"
                          >
                            Dismiss warning
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <ArtifactWorkspacePanel
        buildingId={building.id}
        canManageSubmissionWorkflows={canManageOperatorControls}
      />

      <Panel
        title="Canonical source reconciliation"
        subtitle="This shows how Quoin selected the current canonical source state across Portfolio Manager, Green Button, uploads, and manual corrections."
      >
        {!reconciliation ? (
          <div className="text-sm text-zinc-500">
            No persisted reconciliation summary is available yet.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Reconciliation state
                </div>
                <div className="mt-2">
                  <StatusBadge
                    label={reconciliationDisplay.label}
                    tone={reconciliationDisplay.tone}
                  />
                </div>
              </div>
              <SummaryItem
                label="Canonical source"
                value={sourceLabel(reconciliation.canonicalSource)}
              />
              <SummaryItem
                label="Reference year"
                value={String(reconciliation.referenceYear ?? "Not recorded")}
              />
              <SummaryItem
                label="Last reconciled"
                value={formatDate(reconciliation.lastReconciledAt)}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <SummaryItem
                label="Blocking conflicts"
                value={String(reconciliation.conflictCount)}
              />
              <SummaryItem
                label="Incomplete linkages"
                value={String(reconciliation.incompleteCount)}
              />
              <SummaryItem
                label="Meter summaries"
                value={String(reconciliation.meters.length)}
              />
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Source records
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {reconciliation.sourceRecords.map((record) => (
                  <div
                    key={record.sourceSystem}
                    className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm"
                  >
                    <div className="font-medium text-zinc-900">
                      {sourceLabel(record.sourceSystem)}
                    </div>
                    <div className="mt-1 text-zinc-600">
                      {sourceRecordStateLabel(record.state)} · {record.readingCount} readings ·{" "}
                      {record.coverageMonthCount} month(s)
                    </div>
                    <div className="mt-1 text-zinc-500">
                      External record {record.externalRecordId ?? "not recorded"}
                    </div>
                    <div className="mt-1 text-zinc-500">
                      Latest ingest {formatDate(record.latestIngestedAt)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Conflicts requiring review
              </div>
              {reconciliation.conflicts.length === 0 ? (
                <div className="mt-3 text-sm text-zinc-500">
                  No reconciliation conflicts are currently recorded.
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {reconciliation.conflicts.map((conflict, index) => (
                    <div
                      key={`${conflict.code}-${conflict.meterId ?? "building"}-${index}`}
                      className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm"
                    >
                      <div className="font-medium text-zinc-900">{conflict.message}</div>
                      <div className="mt-1 text-zinc-500">
                        {conflict.code.replaceAll("_", " ")}
                        {conflict.meterName ? ` · ${conflict.meterName}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Meter linkage and coverage
              </div>
              <div className="mt-3 space-y-3">
                {reconciliation.meters.map((meter) => {
                  const meterDisplay = getSourceReconciliationStatusDisplay(meter.status);
                  return (
                    <div
                      key={meter.meterId}
                      className="rounded-lg border border-zinc-200 bg-zinc-50 p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-zinc-900">{meter.meterName}</div>
                          <div className="mt-1 text-sm text-zinc-500">
                            {meter.meterType.replaceAll("_", " ")} · {meter.unit}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <StatusBadge label={meterDisplay.label} tone={meterDisplay.tone} />
                          <StatusBadge
                            label={`Canonical ${sourceLabel(meter.canonicalSource)}`}
                            tone="muted"
                          />
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4 text-sm text-zinc-600">
                        {meter.sourceRecords.map((record) => (
                          <div key={`${meter.meterId}-${record.sourceSystem}`}>
                            <div className="font-medium text-zinc-900">
                              {sourceLabel(record.sourceSystem)}
                            </div>
                            <div className="mt-1">
                              {sourceRecordStateLabel(record.state)} · {record.readingCount} readings
                            </div>
                            <div className="mt-1">
                              {record.coverageMonthCount} month(s) ·{" "}
                              {record.totalConsumptionKbtu != null
                                ? `${Math.round(record.totalConsumptionKbtu).toLocaleString()} kBtu`
                                : "No total"}
                            </div>
                          </div>
                        ))}
                      </div>
                      {meter.conflicts.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {meter.conflicts.map((conflict, index) => (
                            <div
                              key={`${meter.meterId}-${conflict.code}-${index}`}
                              className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900"
                            >
                              {conflict.message}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Panel>

      <Panel
        title="Integration runtime health"
        subtitle="These statuses are persisted from the current Portfolio Manager and Green Button runtime records."
      >
        <div className="grid gap-4 xl:grid-cols-2">
          {[
            {
              key: "pm",
              title: "Portfolio Manager",
              summary: runtimeSummary.portfolioManager,
              extra: null,
            },
            {
              key: "gb",
              title: "Green Button",
              summary: runtimeSummary.greenButton,
              extra: runtimeSummary.greenButton.lastWebhookReceivedAt
                ? `Last webhook ${formatDate(runtimeSummary.greenButton.lastWebhookReceivedAt)}`
                : null,
            },
          ].map((entry) => {
            const status = getRuntimeStatusDisplay(entry.summary.currentState);
            return (
              <div
                key={entry.key}
                className="rounded-lg border border-zinc-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-zinc-900">{entry.title}</div>
                    <div className="mt-1 text-sm text-zinc-500">
                      {entry.summary.attentionReason ?? "No runtime follow-up is currently required."}
                    </div>
                  </div>
                  <StatusBadge label={status.label} tone={status.tone} />
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 text-sm text-zinc-600">
                  <SummaryItem
                    label="Last success"
                    value={formatDate(entry.summary.lastSucceededAt)}
                  />
                  <SummaryItem
                    label="Last failure"
                    value={formatDate(entry.summary.lastFailedAt)}
                  />
                  <SummaryItem
                    label="Last attempt"
                    value={formatDate(entry.summary.lastAttemptedAt)}
                  />
                  <SummaryItem
                    label="Attempts / retries"
                    value={`${entry.summary.attemptCount} / ${entry.summary.retryCount}`}
                  />
                </div>
                {entry.extra ? (
                  <div className="mt-3 text-sm text-zinc-500">{entry.extra}</div>
                ) : null}
                {entry.summary.latestErrorMessage ? (
                  <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                    <span className="font-semibold text-zinc-900">Latest error:</span>{" "}
                    {entry.summary.latestErrorMessage}
                    {entry.summary.latestErrorCode
                      ? ` (${entry.summary.latestErrorCode})`
                      : ""}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Panel>

      {canManageOperatorControls ? (
        <Panel
          title="Operator controls"
          subtitle="These controls reuse the governed sync, reconciliation, and penalty services. They are available only to manager and admin roles."
        >
          <div className="space-y-4">
            {operatorFeedback ? (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                {operatorFeedback}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() =>
                  runOperatorAction(() =>
                    retryPortfolioManagerSync.mutateAsync({
                      buildingId: building.id,
                      reportingYear: benchmarkReportingYear ?? undefined,
                    }),
                  )
                }
                disabled={retryPortfolioManagerSync.isPending}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900 disabled:opacity-50"
              >
                {retryPortfolioManagerSync.isPending
                  ? "Retrying PM sync..."
                  : "Retry Portfolio Manager sync"}
              </button>
              <button
                type="button"
                onClick={() =>
                  runOperatorAction(() =>
                    reenqueueGreenButtonIngestion.mutateAsync({
                      buildingId: building.id,
                    }),
                  )
                }
                disabled={
                  reenqueueGreenButtonIngestion.isPending ||
                  runtimeSummary.greenButton.connectionStatus !== "ACTIVE"
                }
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900 disabled:opacity-50"
              >
                {reenqueueGreenButtonIngestion.isPending
                  ? "Re-enqueueing Green Button..."
                  : "Re-enqueue Green Button ingestion"}
              </button>
              <button
                type="button"
                onClick={() =>
                  runOperatorAction(() =>
                    rerunSourceReconciliation.mutateAsync({
                      buildingId: building.id,
                    }),
                  )
                }
                disabled={rerunSourceReconciliation.isPending}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900 disabled:opacity-50"
              >
                {rerunSourceReconciliation.isPending
                  ? "Refreshing reconciliation..."
                  : "Rerun source reconciliation"}
              </button>
              <button
                type="button"
                onClick={() =>
                  runOperatorAction(() =>
                    refreshPenaltySummary.mutateAsync({
                      buildingId: building.id,
                    }),
                  )
                }
                disabled={refreshPenaltySummary.isPending}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900 disabled:opacity-50"
              >
                {refreshPenaltySummary.isPending
                  ? "Refreshing penalty..."
                  : "Refresh governed penalty summary"}
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 text-sm text-zinc-600">
              <SummaryItem
                label="Latest submission transition"
                value={formatDate(
                  building.governedSummary.timestamps.lastSubmissionTransitionAt,
                )}
              />
              <SummaryItem
                label="Latest publication status"
                value="Governed publication status is available on the Reports surface."
              />
            </div>
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Benchmarking engine result"
          subtitle="Latest persisted benchmarking computation and QA gate."
        >
          {!readiness.evaluations.benchmark ? (
            <div className="text-sm text-zinc-500">
              No benchmarking engine result has been recorded yet.
            </div>
          ) : (
            <div className="space-y-4 text-sm text-zinc-700">
              <div className="grid gap-4 md:grid-cols-2">
                <SummaryItem
                  label="Reporting year"
                  value={String(readiness.evaluations.benchmark.reportingYear ?? "Not recorded")}
                />
                <SummaryItem
                  label="Rule version"
                  value={readiness.evaluations.benchmark.ruleVersion ?? "Not recorded"}
                />
                <SummaryItem
                  label="Metric used"
                  value={metricLabel(readiness.evaluations.benchmark.metricUsed)}
                />
                <SummaryItem
                  label="Decision"
                  value={decisionLabel({
                    status: readiness.evaluations.benchmark.status,
                    meetsStandard: readiness.evaluations.benchmark.decision.meetsStandard,
                    blocked: readiness.evaluations.benchmark.decision.blocked,
                  })}
                />
                <SummaryItem
                  label="Reason codes"
                  value={readiness.evaluations.benchmark.reasonSummary}
                />
                <SummaryItem
                  label="Last readiness evaluation"
                  value={formatDate(
                    readiness.artifacts.benchmarkSubmission?.lastReadinessEvaluatedAt,
                  )}
                />
                <SummaryItem
                  label="Last compliance evaluation"
                  value={formatDate(readiness.evaluations.benchmark.lastComplianceEvaluatedAt)}
                />
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Input snapshot summary
                </div>
                <div className="mt-2 text-sm text-zinc-600">
                  Submission status{" "}
                  {readiness.artifacts.benchmarkSubmission?.status
                    .toLowerCase()
                    .replaceAll("_", " ") ?? "not recorded"}
                  . Latest readiness check recorded on{" "}
                  {formatDate(readiness.artifacts.benchmarkSubmission?.lastReadinessEvaluatedAt)}.
                  {readiness.artifacts.benchmarkPacket ? (
                    <>
                      {" "}Verification packet{" "}
                      {readiness.artifacts.benchmarkPacket.status
                        .toLowerCase()
                        .replaceAll("_", " ")}.
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </Panel>

        <Panel
          title="BEPS engine result"
          subtitle="Latest persisted BEPS evaluation and governed decision path."
        >
          {!readiness.evaluations.beps ? (
            <div className="text-sm text-zinc-500">
              No BEPS engine result has been recorded yet.
            </div>
          ) : (
            <div className="space-y-4 text-sm text-zinc-700">
              <div className="grid gap-4 md:grid-cols-2">
                <SummaryItem
                  label="Cycle / filing year"
                  value={`${readiness.evaluations.beps.complianceCycle ?? building.complianceCycle} / ${readiness.evaluations.beps.filingYear ?? "Not recorded"}`}
                />
                <SummaryItem
                  label="Rule version"
                  value={readiness.evaluations.beps.ruleVersion ?? "Not recorded"}
                />
                <SummaryItem
                  label="Metric used"
                  value={metricLabel(readiness.evaluations.beps.metricUsed)}
                />
                <SummaryItem
                  label="Decision"
                  value={decisionLabel({
                    status: readiness.evaluations.beps.status,
                    meetsStandard: readiness.evaluations.beps.decision.meetsStandard,
                    blocked: readiness.evaluations.beps.decision.blocked,
                  })}
                />
                <SummaryItem
                  label="Reason codes"
                  value={readiness.evaluations.beps.reasonSummary}
                />
                <SummaryItem
                  label="Last compliance evaluation"
                  value={formatDate(readiness.evaluations.beps.lastComplianceEvaluatedAt)}
                />
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Input snapshot summary
                </div>
                <div className="mt-2 text-sm text-zinc-600">
                  Filing status{" "}
                  {readiness.artifacts.bepsFiling?.status
                    .toLowerCase()
                    .replaceAll("_", " ") ?? "not recorded"}
                  . Packet{" "}
                  {readiness.artifacts.bepsPacket?.status
                    .toLowerCase()
                    .replaceAll("_", " ") ?? "not started"}
                  .
                  {readiness.artifacts.bepsPacket?.generatedAt ? (
                    <> Last packet generated on {formatDate(readiness.artifacts.bepsPacket.generatedAt)}.</>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="Penalty estimate"
        subtitle="This estimate is taken from the latest governed BEPS compliance context and persisted as a penalty run."
      >
        {!penaltySummary ? (
          <div className="text-sm text-zinc-500">
            Penalty estimate is unavailable right now.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Current penalty estimate
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
                  {formatMoney(penaltySummary.currentEstimatedPenalty)}
                </div>
                <div className="mt-2">
                  <StatusBadge
                    label={getPenaltyStatusDisplay(penaltySummary.status).label}
                    tone={getPenaltyStatusDisplay(penaltySummary.status).tone}
                  />
                </div>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Penalty basis
                </div>
                <div className="mt-2 text-sm font-medium text-zinc-900">
                  {penaltySummary.basis.label}
                </div>
                <div className="mt-2 text-sm text-zinc-600">
                  {penaltySummary.basis.explanation}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Governing context
                </div>
                <div className="mt-2 text-sm text-zinc-700">
                  Filing year {penaltySummary.governingContext.filingYear ?? "Not recorded"}
                  {" | "}
                  {penaltySummary.governingContext.basisPathway
                    ? penaltySummary.governingContext.basisPathway.replaceAll("_", " ")
                    : "No pathway basis"}
                </div>
                <div className="mt-2 text-sm text-zinc-600">
                  Rule version {penaltySummary.governingContext.ruleVersion ?? "Not recorded"}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-zinc-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Key drivers
                </div>
                <div className="mt-3 space-y-2 text-sm text-zinc-700">
                  {penaltySummary.keyDrivers.map((driver) => (
                    <div
                      key={driver.code}
                      className="flex items-start justify-between gap-3"
                    >
                      <div className="text-zinc-500">{driver.label}</div>
                      <div className="text-right font-medium text-zinc-900">
                        {driver.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-zinc-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Scenario deltas
                </div>
                {penaltySummary.scenarios.length === 0 ? (
                  <div className="mt-3 text-sm text-zinc-500">
                    No governed scenario deltas are available from the current compliance context.
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    {penaltySummary.scenarios.map((scenario) => (
                      <div
                        key={scenario.code}
                        className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm"
                      >
                        <div className="font-medium text-zinc-900">{scenario.label}</div>
                        <div className="mt-1 text-zinc-600">{scenario.description}</div>
                        <div className="mt-2 flex flex-wrap gap-4">
                          <div className="text-zinc-700">
                            Estimate:{" "}
                            <span className="font-medium text-zinc-900">
                              {formatMoney(scenario.estimatedPenalty)}
                            </span>
                          </div>
                          <div className="text-zinc-700">
                            Delta:{" "}
                            <span className="font-medium text-zinc-900">
                              {formatMoney(scenario.deltaFromCurrent)}
                            </span>
                          </div>
                        </div>
                        {scenario.metricChange ? (
                          <div className="mt-2 text-zinc-600">
                            {scenario.metricChange.label}: {scenario.metricChange.from} to{" "}
                            {scenario.metricChange.to}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 text-sm text-zinc-600">
              <SummaryItem
                label="Penalty calculated"
                value={formatDate(penaltySummary.calculatedAt)}
              />
              <SummaryItem
                label="Last BEPS compliance evaluation"
                value={formatDate(penaltySummary.timestamps.lastComplianceEvaluatedAt)}
              />
              <SummaryItem
                label="Last readiness evaluation"
                value={formatDate(penaltySummary.timestamps.lastReadinessEvaluatedAt)}
              />
              <SummaryItem
                label="Last packet generated"
                value={formatDate(penaltySummary.timestamps.lastPacketGeneratedAt)}
              />
            </div>
          </div>
        )}
      </Panel>

      <Panel
        title="Retrofit priorities"
        subtitle="These retrofit opportunities are ranked as governed decision-support from the current penalty context, explicit retrofit assumptions, and aligned operational anomalies."
      >
        {retrofitSummary.activeCount === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
            No active retrofit opportunities have been prioritized for this building yet.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Active opportunities
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
                  {retrofitSummary.activeCount}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Highest priority band
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
                  {retrofitSummary.highestPriorityBand ?? "Not ranked"}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Top avoided penalty
                </div>
                <div className="mt-2 text-lg font-semibold tracking-tight text-zinc-900">
                  {formatMoney(
                    retrofitSummary.topOpportunity?.estimatedAvoidedPenalty ?? null,
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Top risk reduction
                </div>
                <div className="mt-2 text-lg font-semibold tracking-tight text-zinc-900">
                  {formatMoney(
                    retrofitSummary.topOpportunity?.estimatedOperationalRiskReduction
                      .penaltyImpactUsd ?? null,
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {retrofitSummary.opportunities.map((opportunity) => (
                <div
                  key={opportunity.candidateId}
                  className="rounded-lg border border-zinc-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-zinc-900">{opportunity.name}</div>
                      <div className="mt-1 text-sm text-zinc-500">
                        {opportunity.projectType.toLowerCase().replaceAll("_", " ")}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge
                        label={opportunity.priorityBand.toLowerCase()}
                        tone={
                          opportunity.priorityBand === "CRITICAL" ||
                          opportunity.priorityBand === "HIGH"
                            ? "danger"
                            : opportunity.priorityBand === "MEDIUM"
                              ? "warning"
                              : "muted"
                        }
                      />
                      <StatusBadge
                        label={opportunity.estimatedAvoidedPenaltyStatus
                          .toLowerCase()
                          .replaceAll("_", " ")}
                        tone={
                          opportunity.estimatedAvoidedPenaltyStatus === "ESTIMATED"
                            ? "warning"
                            : "muted"
                        }
                      />
                    </div>
                  </div>
                  <div className="mt-3 text-sm text-zinc-600">
                    {opportunity.basis.summary}
                  </div>
                  <div className="mt-3 grid gap-4 md:grid-cols-4 text-sm text-zinc-700">
                    <SummaryItem
                      label="Priority score"
                      value={String(opportunity.priorityScore)}
                    />
                    <SummaryItem
                      label="Net cost"
                      value={formatMoney(opportunity.netProjectCost)}
                    />
                    <SummaryItem
                      label="Avoided penalty"
                      value={formatMoney(opportunity.estimatedAvoidedPenalty)}
                    />
                    <SummaryItem
                      label="Risk reduction"
                      value={formatMoney(
                        opportunity.estimatedOperationalRiskReduction.penaltyImpactUsd,
                      )}
                    />
                  </div>
                  <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                    {opportunity.basis.explanation}
                  </div>
                  {opportunity.basis.assumptions.length > 0 ? (
                    <div className="mt-3 space-y-1 text-sm text-zinc-600">
                      {opportunity.basis.assumptions.map((assumption) => (
                        <div key={assumption}>{assumption}</div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>

      <Panel
        title="Operational anomalies"
        subtitle="Explainable operational signals are tracked as decision-support. They do not change the compliance engine result, but they can indicate energy and penalty risk."
      >
        {operationalAnomalies.length === 0 ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            No active operational anomalies are recorded for this building.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Active anomalies
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
                  {anomalySummary.activeCount}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  High severity
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
                  {anomalySummary.highSeverityCount}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Estimated energy impact
                </div>
                <div className="mt-2 text-lg font-semibold tracking-tight text-zinc-900">
                  {anomalySummary.totalEstimatedEnergyImpactKbtu == null
                    ? "Not available"
                    : `${Math.round(anomalySummary.totalEstimatedEnergyImpactKbtu).toLocaleString()} kBtu`}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Estimated penalty risk
                </div>
                <div className="mt-2 text-lg font-semibold tracking-tight text-zinc-900">
                  {formatMoney(anomalySummary.totalEstimatedPenaltyImpactUsd)}
                </div>
                <div className="mt-2">
                  <StatusBadge
                    label={
                      getOperationalAnomalyPenaltyImpactDisplay(
                        anomalySummary.penaltyImpactStatus,
                      ).label
                    }
                    tone={
                      getOperationalAnomalyPenaltyImpactDisplay(
                        anomalySummary.penaltyImpactStatus,
                      ).tone
                    }
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {operationalAnomalies.map((anomaly) => {
                const confidenceDisplay = getOperationalAnomalyConfidenceDisplay(
                  anomaly.confidenceBand,
                );
                const penaltyImpactDisplay = getOperationalAnomalyPenaltyImpactDisplay(
                  anomaly.penaltyImpactStatus,
                );

                return (
                  <div
                    key={anomaly.id}
                    className="rounded-lg border border-zinc-200 bg-white p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-zinc-900">{anomaly.title}</div>
                        <div className="mt-1 text-sm text-zinc-500">
                          {anomalyTypeLabel(anomaly.anomalyType)}
                          {anomaly.meter ? ` | ${anomaly.meter.name}` : ""}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge
                          label={anomaly.severity.toLowerCase()}
                          tone={
                            anomaly.severity === "HIGH" || anomaly.severity === "CRITICAL"
                              ? "danger"
                              : anomaly.severity === "MEDIUM"
                                ? "warning"
                                : "muted"
                          }
                        />
                        <StatusBadge
                          label={confidenceDisplay.label}
                          tone={confidenceDisplay.tone}
                        />
                        <StatusBadge
                          label={penaltyImpactDisplay.label}
                          tone={penaltyImpactDisplay.tone}
                        />
                      </div>
                    </div>
                    <div className="mt-3 text-sm text-zinc-600">{anomaly.explanation}</div>
                    <div className="mt-2 text-sm text-zinc-500">
                      {anomaly.causeHypothesis ?? "No cause hypothesis recorded."}
                    </div>
                    <div className="mt-3 grid gap-4 md:grid-cols-3 text-sm text-zinc-700">
                      <SummaryItem
                        label="Energy impact"
                        value={
                          anomaly.estimatedEnergyImpactKbtu == null
                            ? "Not available"
                            : `${Math.round(anomaly.estimatedEnergyImpactKbtu).toLocaleString()} kBtu`
                        }
                      />
                      <SummaryItem
                        label="Penalty impact"
                        value={formatMoney(anomaly.estimatedPenaltyImpactUsd)}
                      />
                      <SummaryItem
                        label="Detected through"
                        value={formatDate(anomaly.detectionWindowEnd)}
                      />
                    </div>
                    <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                      {anomaly.attribution.penaltyImpactExplanation}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Verification checklist"
          subtitle="This is the current QA gate used by the compliance workflow."
        >
          {!verificationChecklist ? (
            <div className="text-sm text-zinc-500">
              No verification checklist has been computed yet.
            </div>
          ) : (
            <div className="space-y-3">
              {verificationChecklist.items.map((item) => {
                const status = getVerificationStatusDisplay(item.status);
                return (
                  <div
                    key={item.key}
                    className="rounded-lg border border-zinc-200 bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-medium text-zinc-900">
                        {item.key.replaceAll("_", " ")}
                      </div>
                      <StatusBadge label={status.label} tone={status.tone} />
                    </div>
                    <div className="mt-2 text-sm text-zinc-600">
                      {item.explanation}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel
          title="Audit trace summary"
          subtitle="Recent persisted computation events for this building."
        >
          {building.recentAuditLogs.length === 0 ? (
            <div className="text-sm text-zinc-500">
              No audit events are available for this building yet.
            </div>
          ) : (
            <div className="space-y-3">
              {building.recentAuditLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-lg border border-zinc-200 bg-white p-4 text-sm"
                >
                  <div className="font-medium text-zinc-900">
                    {log.action.replaceAll("_", " ").toLowerCase()}
                  </div>
                  <div className="mt-1 text-zinc-500">{formatDate(log.timestamp)}</div>
                  {log.errorCode ? (
                    <div className="mt-1 text-red-600">Error code: {log.errorCode}</div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-sm text-zinc-900">{value}</div>
    </div>
  );
}
