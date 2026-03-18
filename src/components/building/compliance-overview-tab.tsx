"use client";

import React from "react";
import { trpc } from "@/lib/trpc";
import {
  Panel,
  formatDate,
} from "@/components/internal/admin-primitives";
import {
  StatusBadge,
  getDataIssueSeverityDisplay,
  getDataIssueStatusDisplay,
  getPrimaryComplianceStatusDisplay,
  getSubmissionReadinessDisplay,
  getVerificationStatusDisplay,
} from "@/components/internal/status-helpers";
import {
  derivePrimaryComplianceStatus,
  extractComplianceEngineResult,
  summarizeReasonCodes,
} from "@/lib/compliance-surface";

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

function extractInputSummary(payload: unknown) {
  const record =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;

  const readiness = record?.readiness;
  const evaluation = record?.evaluation;

  return {
    readiness:
      readiness && typeof readiness === "object" && !Array.isArray(readiness)
        ? (readiness as Record<string, unknown>)
        : null,
    evaluation:
      evaluation && typeof evaluation === "object" && !Array.isArray(evaluation)
        ? (evaluation as Record<string, unknown>)
        : null,
  };
}

export function ComplianceOverviewTab({
  building,
  verificationChecklist,
}: {
  building: {
    id: string;
    complianceCycle: string;
    issueSummary: {
      state: string;
      blockingIssueCount: number;
      warningIssueCount: number;
      nextAction: {
        title: string;
        reason: string;
      };
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
    latestBenchmarkSubmission: {
      reportingYear: number;
      status: string;
      readinessEvaluatedAt: string | Date | null;
      submissionPayload: unknown;
      complianceRun: {
        executedAt: string | Date;
      } | null;
    } | null;
    latestBepsFiling: {
      filingYear: number | null;
      complianceCycle: string | null;
      status: string;
      filingPayload: unknown;
      complianceRun: {
        executedAt: string | Date;
      } | null;
    } | null;
    recentAuditLogs: Array<{
      id: string;
      timestamp: string | Date;
      action: string;
      errorCode: string | null;
      requestId: string | null;
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
  const benchmarkEngine = extractComplianceEngineResult(
    building.latestBenchmarkSubmission?.submissionPayload,
  );
  const bepsEngine = extractComplianceEngineResult(
    building.latestBepsFiling?.filingPayload,
  );
  const utils = trpc.useUtils();
  const updateIssueStatus = trpc.building.updateIssueStatus.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.building.get.invalidate({ id: building.id }),
        building.latestBenchmarkSubmission
          ? utils.benchmarking.getVerificationChecklist.invalidate({
              buildingId: building.id,
              reportingYear: building.latestBenchmarkSubmission.reportingYear,
            })
          : Promise.resolve(),
      ]);
    },
  });
  const activeIssues = building.issueSummary.openIssues.filter(
    (issue) => issue.status === "OPEN" || issue.status === "IN_PROGRESS",
  );
  const primaryStatus = derivePrimaryComplianceStatus({
    benchmark: benchmarkEngine,
    beps: bepsEngine,
  });
  const primaryDisplay = getPrimaryComplianceStatusDisplay(primaryStatus);
  const readinessDisplay = getSubmissionReadinessDisplay(building.issueSummary.state);
  const qaDisplay = getVerificationStatusDisplay(benchmarkEngine?.qaVerdict ?? "FAIL");
  const benchmarkInput = extractInputSummary(
    building.latestBenchmarkSubmission?.submissionPayload,
  );
  const bepsInput = extractInputSummary(building.latestBepsFiling?.filingPayload);

  return (
    <div className="space-y-6">
      <Panel
        title="Compliance decision"
        subtitle="This summary is taken from the latest persisted compliance-engine results for benchmarking and BEPS."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Submission readiness
            </div>
            <div className="mt-2">
              <StatusBadge label={readinessDisplay.label} tone={readinessDisplay.tone} />
            </div>
            <div className="mt-2 text-sm text-slate-600">
              {building.issueSummary.nextAction.reason}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              QA verdict
            </div>
            <div className="mt-2">
              <StatusBadge label={qaDisplay.label} tone={qaDisplay.tone} />
            </div>
            <div className="mt-2 text-sm text-slate-600">
              {verificationChecklist
                ? `${verificationChecklist.summary.failedCount} failed, ${verificationChecklist.summary.needsReviewCount} needs review`
                : "No verification checklist has been recorded yet."}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Compliance result
            </div>
            <div className="mt-2">
              <StatusBadge label={primaryDisplay.label} tone={primaryDisplay.tone} />
            </div>
            <div className="mt-2 text-sm text-slate-600">
              {building.issueSummary.blockingIssueCount > 0
                ? `${building.issueSummary.blockingIssueCount} blocking issue(s) must be resolved before the compliance result is submission-ready.`
                : "The latest governed compliance result is available below."}
            </div>
          </div>
        </div>
      </Panel>

      <Panel
        title="Open data issues"
        subtitle="These are the persistent issues currently blocking or slowing this building’s path to review and submission."
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
                  className="rounded-lg border border-slate-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-900">{issue.title}</div>
                      <div className="mt-1 text-sm text-slate-500">
                        {issue.reportingYear ? `Reporting year ${issue.reportingYear}` : "Current building state"}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge label={severity.label} tone={severity.tone} />
                      <StatusBadge label={status.label} tone={status.tone} />
                    </div>
                  </div>
                  <div className="mt-3 text-sm text-slate-600">{issue.description}</div>
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">Required action:</span>{" "}
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
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-400 hover:text-slate-900 disabled:opacity-50"
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
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-400 hover:text-slate-900 disabled:opacity-50"
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

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Benchmarking engine result"
          subtitle="Latest persisted benchmarking computation and QA gate."
        >
          {!benchmarkEngine || !building.latestBenchmarkSubmission ? (
            <div className="text-sm text-slate-500">
              No benchmarking engine result has been recorded yet.
            </div>
          ) : (
            <div className="space-y-4 text-sm text-slate-700">
              <div className="grid gap-4 md:grid-cols-2">
                <SummaryItem label="Reporting year" value={String(building.latestBenchmarkSubmission.reportingYear)} />
                <SummaryItem label="Rule version" value={benchmarkEngine.ruleVersion ?? "Not recorded"} />
                <SummaryItem label="Metric used" value={metricLabel(benchmarkEngine.metricUsed)} />
                <SummaryItem
                  label="Decision"
                  value={decisionLabel({
                    status: benchmarkEngine.status,
                    meetsStandard: benchmarkEngine.decision.meetsStandard,
                    blocked: benchmarkEngine.decision.blocked,
                  })}
                />
                <SummaryItem
                  label="Reason codes"
                  value={summarizeReasonCodes(benchmarkEngine.reasonCodes)}
                />
                <SummaryItem
                  label="Last evaluation"
                  value={formatDate(
                    building.latestBenchmarkSubmission.complianceRun?.executedAt ??
                      building.latestBenchmarkSubmission.readinessEvaluatedAt,
                  )}
                />
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Input snapshot summary
                </div>
                <div className="mt-2 text-sm text-slate-600">
                  Submission status {building.latestBenchmarkSubmission.status.toLowerCase().replaceAll("_", " ")}.
                  Scope{" "}
                  {typeof benchmarkInput.readiness?.summary === "object" &&
                  benchmarkInput.readiness?.summary &&
                  typeof (benchmarkInput.readiness.summary as Record<string, unknown>).scopeState ===
                    "string"
                    ? String(
                        (benchmarkInput.readiness.summary as Record<string, unknown>).scopeState,
                      )
                        .toLowerCase()
                        .replaceAll("_", " ")
                    : "not recorded"}
                  .
                </div>
              </div>
            </div>
          )}
        </Panel>

        <Panel
          title="BEPS engine result"
          subtitle="Latest persisted BEPS evaluation and governed decision path."
        >
          {!bepsEngine || !building.latestBepsFiling ? (
            <div className="text-sm text-slate-500">
              No BEPS engine result has been recorded yet.
            </div>
          ) : (
            <div className="space-y-4 text-sm text-slate-700">
              <div className="grid gap-4 md:grid-cols-2">
                <SummaryItem
                  label="Cycle / filing year"
                  value={`${building.latestBepsFiling.complianceCycle ?? building.complianceCycle} / ${building.latestBepsFiling.filingYear ?? "Not recorded"}`}
                />
                <SummaryItem label="Rule version" value={bepsEngine.ruleVersion ?? "Not recorded"} />
                <SummaryItem label="Metric used" value={metricLabel(bepsEngine.metricUsed)} />
                <SummaryItem
                  label="Decision"
                  value={decisionLabel({
                    status: bepsEngine.status,
                    meetsStandard: bepsEngine.decision.meetsStandard,
                    blocked: bepsEngine.decision.blocked,
                  })}
                />
                <SummaryItem
                  label="Reason codes"
                  value={summarizeReasonCodes(bepsEngine.reasonCodes)}
                />
                <SummaryItem
                  label="Last evaluation"
                  value={formatDate(building.latestBepsFiling.complianceRun?.executedAt)}
                />
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Input snapshot summary
                </div>
                <div className="mt-2 text-sm text-slate-600">
                  Filing status {building.latestBepsFiling.status.toLowerCase().replaceAll("_", " ")}.
                  Overall result{" "}
                  {typeof bepsInput.evaluation?.overallStatus === "string"
                    ? String(bepsInput.evaluation.overallStatus)
                        .toLowerCase()
                        .replaceAll("_", " ")
                    : "not recorded"}
                  .
                </div>
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
            <div className="text-sm text-slate-500">
              No verification checklist has been computed yet.
            </div>
          ) : (
            <div className="space-y-3">
              {verificationChecklist.items.map((item) => {
                const status = getVerificationStatusDisplay(item.status);
                return (
                  <div
                    key={item.key}
                    className="rounded-lg border border-slate-200 bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-medium text-slate-900">
                        {item.key.replaceAll("_", " ")}
                      </div>
                      <StatusBadge label={status.label} tone={status.tone} />
                    </div>
                    <div className="mt-2 text-sm text-slate-600">
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
            <div className="text-sm text-slate-500">
              No audit events are available for this building yet.
            </div>
          ) : (
            <div className="space-y-3">
              {building.recentAuditLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-lg border border-slate-200 bg-white p-4 text-sm"
                >
                  <div className="font-medium text-slate-900">
                    {log.action.replaceAll("_", " ").toLowerCase()}
                  </div>
                  <div className="mt-1 text-slate-500">{formatDate(log.timestamp)}</div>
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
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-sm text-slate-900">{value}</div>
    </div>
  );
}
