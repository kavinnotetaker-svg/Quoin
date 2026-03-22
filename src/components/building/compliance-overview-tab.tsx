"use client";

import React from "react";
import { trpc } from "@/lib/trpc";
import {
  Panel,
  formatDate,
  formatMoney,
} from "@/components/internal/admin-primitives";
import {
  StatusBadge,
  formatCycleLabel,
  getDataIssueSeverityDisplay,
  getDataIssueStatusDisplay,
  getOperationalAnomalyConfidenceDisplay,
  getOperationalAnomalyPenaltyImpactDisplay,
  getPrimaryComplianceStatusDisplay,
  getRuntimeStatusDisplay,
  getSourceReconciliationStatusDisplay,
  getSubmissionReadinessDisplay,
  getVerificationStatusDisplay,
  humanizeToken,
} from "@/components/internal/status-helpers";

function metricLabel(metric: string | null) {
  return metric ? humanizeToken(metric) : "Not recorded";
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
  return value ? humanizeToken(value) : "Not selected";
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
  return humanizeToken(value);
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
  const runtimeSummary = building.governedSummary.runtimeSummary;
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
  const primaryOverviewAction =
    readiness.blockingIssueCount > 0
      ? {
          label: "Resolve blocking issues",
          detail:
            "Open the active issue list and clear the remaining blockers before moving this building forward.",
          targetId: "building-open-issues",
        }
      : runtimeSummary.needsAttention
        ? {
            label: "Review source and runtime context",
            detail:
              runtimeSummary.nextAction?.reason ??
              "Check the latest integration and source state before advancing compliance work.",
            targetId: "building-runtime-context",
          }
        : {
            label: "Review latest compliance result",
            detail:
              "Use the current governed result and evidence record as the basis for the next submission step.",
            targetId: "building-compliance-decision",
          };

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

  function scrollToSection(sectionId: string) {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <div className="space-y-6">
      <div className="border-y border-zinc-200 bg-white">
        <div className="grid gap-6 px-5 py-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="quoin-kicker">Current operating position</div>
            <div className="font-display text-3xl font-medium tracking-tight text-zinc-950">
              {primaryDisplay.label}
            </div>
            <div className="max-w-2xl text-sm leading-7 text-zinc-600">
              {readiness.reasonSummary}
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge label={readinessDisplay.label} tone={readinessDisplay.tone} />
              <StatusBadge label={qaDisplay.label} tone={qaDisplay.tone} />
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => scrollToSection(primaryOverviewAction.targetId)}
                className="btn-primary"
              >
                {primaryOverviewAction.label}
              </button>
              <div className="mt-3 max-w-xl text-sm leading-7 text-zinc-500">
                {primaryOverviewAction.detail}
              </div>
            </div>
          </div>
          <div className="space-y-4 border-t border-zinc-200 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <SummaryItem label="Next action" value={readiness.nextAction.title} />
            <div className="text-sm leading-7 text-zinc-600">{readiness.nextAction.reason}</div>
            <div className="grid gap-3 text-sm text-zinc-600 sm:grid-cols-2 lg:grid-cols-1">
              <SummaryItem
                label="Blocking issues"
                value={String(readiness.blockingIssueCount)}
              />
              <SummaryItem
                label="Warnings"
                value={String(readiness.warningIssueCount)}
              />
            </div>
          </div>
          <div className="space-y-4 border-t border-zinc-200 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <SummaryItem label="Compliance cycle" value={building.complianceCycle} />
            <SummaryItem
              label="Latest submission transition"
              value={formatDate(
                building.governedSummary.timestamps.lastSubmissionTransitionAt,
              )}
            />
            <SummaryItem
              label="Last packet finalized"
              value={formatDate(readiness.lastPacketFinalizedAt)}
            />
          </div>
        </div>
      </div>

      <SectionHeading
        kicker="Authoritative truth"
        title="Deterministic compliance and evidence record"
        description="These sections come from persisted compliance evaluations, governed penalty runs, active issues, and immutable artifact workflow state."
      />

      <div id="building-compliance-decision">
        <Panel
        title="Compliance decision"
        subtitle="This summary is taken from the latest persisted compliance-engine results for benchmarking and BEPS."
      >
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="space-y-4 border-l-2 border-zinc-900 pl-4">
            <div className="quoin-kicker">Current recorded result</div>
            <div className="font-display text-3xl font-medium tracking-tight text-zinc-950">
              {primaryDisplay.label}
            </div>
            <div className="text-sm leading-7 text-zinc-600">
              {readiness.blockingIssueCount > 0
                ? `${readiness.blockingIssueCount} blocking issue(s) must be resolved before the compliance result is submission-ready.`
                : "No blocking issues remain. Review the latest governed result before submission."}
            </div>
            <div className="grid gap-4 border-t border-zinc-200 pt-4 sm:grid-cols-2">
              <SummaryItem label="Submission readiness" value={readinessDisplay.label} />
              <SummaryItem label="QA verdict" value={qaDisplay.label} />
              <SummaryItem
                label="Last readiness evaluation"
                value={formatDate(readiness.lastReadinessEvaluatedAt)}
              />
              <SummaryItem
                label="Last compliance evaluation"
                value={formatDate(readiness.lastComplianceEvaluatedAt)}
              />
            </div>
          </div>
          <div className="space-y-3 border-t border-zinc-200 pt-4 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
            <div className="quoin-kicker">Why it is surfacing now</div>
            <div className="text-sm leading-7 text-zinc-700">{readiness.nextAction.reason}</div>
            <div className="grid gap-3 text-sm text-zinc-600">
              <div className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-3">
                <span>Benchmarking</span>
                <span className="max-w-[18rem] text-right text-zinc-900">
                  {readiness.evaluations.benchmark?.reasonSummary ?? "No governed evaluation"}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-3">
                <span>BEPS</span>
                <span className="max-w-[18rem] text-right text-zinc-900">
                  {readiness.evaluations.beps?.reasonSummary ?? "No governed evaluation"}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span>Next action</span>
                <span className="max-w-[18rem] text-right text-zinc-900">
                  {readiness.nextAction.title}
                </span>
              </div>
            </div>
          </div>
        </div>
        </Panel>
      </div>

      <div id="building-open-issues">
        <Panel
        title="Open data issues"
        subtitle="These are the persistent issues currently blocking or slowing this building's path to review and submission."
      >
        {activeIssues.length === 0 ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  No open data issues are recorded. The building can move forward using the current governed record.
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

      <div className="border-t border-zinc-200 pt-6">
        <SectionHeading
          kicker="Governed interpretation"
          title="Basis, provenance, and runtime context"
          description="These sections explain how Quoin selected sources, what runtime state produced the record, and what traceable assumptions or review inputs still matter."
        />
      </div>

      <Panel
        title="Canonical source reconciliation"
        subtitle="This shows how Quoin selected the current canonical source state across Portfolio Manager, Green Button, uploads, and manual corrections."
      >
        {!reconciliation ? (
          <div className="text-sm text-zinc-500">
            Source reconciliation has not produced a persisted summary for this building yet. Connect or refresh source data to establish the governed basis.
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
                    No reconciliation conflicts are recorded for the current source basis. The canonical source can be reviewed below.
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
                        {humanizeToken(conflict.code)}
                        {conflict.meterName ? ` | ${conflict.meterName}` : ""}
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
                            {humanizeToken(meter.meterType)} | {meter.unit}
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
                              {sourceRecordStateLabel(record.state)} | {record.readingCount} readings
                            </div>
                            <div className="mt-1">
                              {record.coverageMonthCount} month(s) |{" "}
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

      <div id="building-runtime-context">
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
                      {entry.summary.attentionReason ??
                        "No runtime follow-up is currently flagged from the latest governed integration state."}
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
      </div>

      {canManageOperatorControls ? (
        <Panel
          title="Technical recovery tools"
          subtitle="These controls reuse the governed sync, reconciliation, and penalty services. They support recovery work after the primary compliance step is clear."
        >
          <div className="space-y-4">
            {operatorFeedback ? (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                {operatorFeedback}
              </div>
            ) : null}
            <div className="max-w-3xl text-sm leading-7 text-zinc-500">
              Use these only when runtime or source state is preventing normal progress. They are intentionally secondary to the compliance and submission actions above.
            </div>
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
                className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50"
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
                className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50"
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
                className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50"
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
                className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50"
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
              Benchmarking has not produced a governed engine result for this building yet. Refresh PM data or run benchmarking to establish the current record.
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
                  {humanizeToken(readiness.artifacts.benchmarkSubmission?.status) ?? "not recorded"}
                  . Latest readiness check recorded on{" "}
                  {formatDate(readiness.artifacts.benchmarkSubmission?.lastReadinessEvaluatedAt)}.
                  {readiness.artifacts.benchmarkPacket ? (
                    <>
                      {" "}Verification packet{" "}
                      {humanizeToken(readiness.artifacts.benchmarkPacket.status)}.
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
              BEPS evaluation has not produced a governed engine result for this cycle yet. Run evaluation in the BEPS tab to establish the current filing record.
            </div>
          ) : (
            <div className="space-y-4 text-sm text-zinc-700">
              <div className="grid gap-4 md:grid-cols-2">
                <SummaryItem
                  label="Cycle / filing year"
                  value={`${formatCycleLabel(readiness.evaluations.beps.complianceCycle ?? building.complianceCycle)} / ${readiness.evaluations.beps.filingYear ?? "Not recorded"}`}
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
                  {humanizeToken(readiness.artifacts.bepsFiling?.status) ?? "not recorded"}
                  . Packet{" "}
                  {humanizeToken(readiness.artifacts.bepsPacket?.status) ?? "not started"}
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
            No governed penalty run is linked to the current BEPS context yet. Run BEPS evaluation, then refresh the penalty summary when the filing record is ready.
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
                    ? humanizeToken(penaltySummary.governingContext.basisPathway)
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
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Verification checklist"
          subtitle="This is the current QA gate used by the compliance workflow."
        >
          {!verificationChecklist ? (
            <div className="text-sm text-zinc-500">
              The QA gate has not been computed for the current record yet. Recheck benchmarking to generate the verification checklist.
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
                        {humanizeToken(item.key)}
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
              No persisted audit events are recorded for this building yet. Audit history begins after the first governed evaluation, packet action, or workflow transition.
            </div>
          ) : (
            <div className="space-y-3">
              {building.recentAuditLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-lg border border-zinc-200 bg-white p-4 text-sm"
                >
                  <div className="font-medium text-zinc-900">
                    {humanizeToken(log.action)}
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

function SectionHeading({
  kicker,
  title,
  description,
}: {
  kicker: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-2">
      <div className="quoin-kicker">{kicker}</div>
      <div className="font-display text-2xl font-medium tracking-tight text-zinc-950">
        {title}
      </div>
      <div className="max-w-3xl text-sm leading-7 text-zinc-600">{description}</div>
    </div>
  );
}
