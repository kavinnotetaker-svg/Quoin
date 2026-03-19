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
  getPrimaryComplianceStatusDisplay,
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
    governedSummary: {
      penaltySummary: PenaltySummaryShape | null;
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
  const readiness = building.readinessSummary;
  const penaltySummary = building.governedSummary.penaltySummary;
  const benchmarkReportingYear = readiness.evaluations.benchmark?.reportingYear ?? null;
  const updateIssueStatus = trpc.building.updateIssueStatus.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.building.get.invalidate({ id: building.id }),
        benchmarkReportingYear
          ? utils.benchmarking.getVerificationChecklist.invalidate({
              buildingId: building.id,
              reportingYear: benchmarkReportingYear,
            })
          : Promise.resolve(),
      ]);
    },
  });
  const activeIssues = building.issueSummary.openIssues.filter(
    (issue) => issue.status === "OPEN" || issue.status === "IN_PROGRESS",
  );
  const primaryDisplay = getPrimaryComplianceStatusDisplay(readiness.primaryStatus);
  const readinessDisplay = getSubmissionReadinessDisplay(readiness.state);
  const qaDisplay = getVerificationStatusDisplay(readiness.qaVerdict ?? "FAIL");

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
              {readiness.nextAction.reason}
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
                  className="rounded-lg border border-slate-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-900">{issue.title}</div>
                      <div className="mt-1 text-sm text-slate-500">
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

      <ArtifactWorkspacePanel buildingId={building.id} />

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Benchmarking engine result"
          subtitle="Latest persisted benchmarking computation and QA gate."
        >
          {!readiness.evaluations.benchmark ? (
            <div className="text-sm text-slate-500">
              No benchmarking engine result has been recorded yet.
            </div>
          ) : (
            <div className="space-y-4 text-sm text-slate-700">
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
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Input snapshot summary
                </div>
                <div className="mt-2 text-sm text-slate-600">
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
            <div className="text-sm text-slate-500">
              No BEPS engine result has been recorded yet.
            </div>
          ) : (
            <div className="space-y-4 text-sm text-slate-700">
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
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Input snapshot summary
                </div>
                <div className="mt-2 text-sm text-slate-600">
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
          <div className="text-sm text-slate-500">
            Penalty estimate is unavailable right now.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Current penalty estimate
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                  {formatMoney(penaltySummary.currentEstimatedPenalty)}
                </div>
                <div className="mt-2">
                  <StatusBadge
                    label={getPenaltyStatusDisplay(penaltySummary.status).label}
                    tone={getPenaltyStatusDisplay(penaltySummary.status).tone}
                  />
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Penalty basis
                </div>
                <div className="mt-2 text-sm font-medium text-slate-900">
                  {penaltySummary.basis.label}
                </div>
                <div className="mt-2 text-sm text-slate-600">
                  {penaltySummary.basis.explanation}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Governing context
                </div>
                <div className="mt-2 text-sm text-slate-700">
                  Filing year {penaltySummary.governingContext.filingYear ?? "Not recorded"}
                  {" | "}
                  {penaltySummary.governingContext.basisPathway
                    ? penaltySummary.governingContext.basisPathway.replaceAll("_", " ")
                    : "No pathway basis"}
                </div>
                <div className="mt-2 text-sm text-slate-600">
                  Rule version {penaltySummary.governingContext.ruleVersion ?? "Not recorded"}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Key drivers
                </div>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  {penaltySummary.keyDrivers.map((driver) => (
                    <div
                      key={driver.code}
                      className="flex items-start justify-between gap-3"
                    >
                      <div className="text-slate-500">{driver.label}</div>
                      <div className="text-right font-medium text-slate-900">
                        {driver.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Scenario deltas
                </div>
                {penaltySummary.scenarios.length === 0 ? (
                  <div className="mt-3 text-sm text-slate-500">
                    No governed scenario deltas are available from the current compliance context.
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    {penaltySummary.scenarios.map((scenario) => (
                      <div
                        key={scenario.code}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"
                      >
                        <div className="font-medium text-slate-900">{scenario.label}</div>
                        <div className="mt-1 text-slate-600">{scenario.description}</div>
                        <div className="mt-2 flex flex-wrap gap-4">
                          <div className="text-slate-700">
                            Estimate:{" "}
                            <span className="font-medium text-slate-900">
                              {formatMoney(scenario.estimatedPenalty)}
                            </span>
                          </div>
                          <div className="text-slate-700">
                            Delta:{" "}
                            <span className="font-medium text-slate-900">
                              {formatMoney(scenario.deltaFromCurrent)}
                            </span>
                          </div>
                        </div>
                        {scenario.metricChange ? (
                          <div className="mt-2 text-slate-600">
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

            <div className="grid gap-4 md:grid-cols-2 text-sm text-slate-600">
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
