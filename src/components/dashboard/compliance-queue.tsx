"use client";

import React from "react";
import Link from "next/link";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/layout/page-header";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/internal/admin-primitives";
import {
  StatusBadge,
  getPacketStatusDisplay,
  getPenaltySummaryStatusDisplay,
  getPrimaryComplianceStatusDisplay,
  getRuntimeStatusDisplay,
  getSubmissionReadinessDisplay,
  getVerificationStatusDisplay,
} from "@/components/internal/status-helpers";

const READINESS_FILTERS = [
  { label: "All readiness states", value: "" },
  { label: "Data incomplete", value: "DATA_INCOMPLETE" },
  { label: "Ready for review", value: "READY_FOR_REVIEW" },
  { label: "Ready to submit", value: "READY_TO_SUBMIT" },
  { label: "Submitted", value: "SUBMITTED" },
] as const;

const ARTIFACT_FILTERS = [
  { label: "Any artifact status", value: "" },
  { label: "Not started", value: "NOT_STARTED" },
  { label: "Generated", value: "GENERATED" },
  { label: "Needs refresh", value: "STALE" },
  { label: "Finalized", value: "FINALIZED" },
] as const;

const NEXT_ACTION_FILTERS = [
  { label: "Any next action", value: "" },
  { label: "Resolve blocking issues", value: "RESOLVE_BLOCKING_ISSUES" },
  { label: "Refresh integration", value: "REFRESH_INTEGRATION" },
  { label: "Regenerate artifact", value: "REGENERATE_ARTIFACT" },
  { label: "Finalize artifact", value: "FINALIZE_ARTIFACT" },
  { label: "Review result", value: "REVIEW_COMPLIANCE_RESULT" },
  { label: "Submit artifact", value: "SUBMIT_ARTIFACT" },
  { label: "Monitor submission", value: "MONITOR_SUBMISSION" },
] as const;

const SORT_OPTIONS = [
  { label: "Priority", value: "PRIORITY" },
  { label: "Name", value: "NAME" },
  { label: "Penalty exposure", value: "PENALTY" },
  { label: "Last compliance evaluation", value: "LAST_COMPLIANCE_EVALUATED" },
] as const;

type BulkPortfolioActionResult = {
  action: string;
  targetCount: number;
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
  results: Array<{
    buildingId: string;
    buildingName: string;
    status: "SUCCEEDED" | "FAILED" | "SKIPPED";
    message: string;
  }>;
};

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not recorded";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMoney(value: number | null | undefined) {
  if (value == null) {
    return "Not available";
  }

  return `$${value.toLocaleString()}`;
}

function getWorkflowStateDisplay(state: string) {
  switch (state) {
    case "READY_FOR_REVIEW":
      return { label: "Ready for review", tone: "info" as const };
    case "APPROVED_FOR_SUBMISSION":
      return { label: "Approved", tone: "success" as const };
    case "SUBMITTED":
      return { label: "Submitted", tone: "warning" as const };
    case "COMPLETED":
      return { label: "Completed", tone: "success" as const };
    case "NEEDS_CORRECTION":
      return { label: "Correction needed", tone: "danger" as const };
    case "DRAFT":
      return { label: "Draft workflow", tone: "muted" as const };
    default:
      return { label: "No workflow", tone: "muted" as const };
  }
}

export function ComplianceQueue() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [readinessFilter, setReadinessFilter] = useState("");
  const [artifactFilter, setArtifactFilter] = useState("");
  const [nextActionFilter, setNextActionFilter] = useState("");
  const [sortBy, setSortBy] = useState<
    "PRIORITY" | "NAME" | "PENALTY" | "LAST_COMPLIANCE_EVALUATED"
  >("PRIORITY");
  const [blockingOnly, setBlockingOnly] = useState(false);
  const [penaltyOnly, setPenaltyOnly] = useState(false);
  const [selectedBuildingIds, setSelectedBuildingIds] = useState<string[]>([]);
  const [bulkResult, setBulkResult] = useState<BulkPortfolioActionResult | null>(null);

  const worklist = trpc.building.portfolioWorklist.useQuery({
    search: search || undefined,
    readinessState:
      (readinessFilter as
        | "DATA_INCOMPLETE"
        | "READY_FOR_REVIEW"
        | "READY_TO_SUBMIT"
        | "SUBMITTED"
        | "") || undefined,
    hasBlockingIssues: blockingOnly ? true : undefined,
    hasPenaltyExposure: penaltyOnly ? true : undefined,
    artifactStatus:
      (artifactFilter as "NOT_STARTED" | "GENERATED" | "STALE" | "FINALIZED" | "") ||
      undefined,
    nextAction:
      (nextActionFilter as
        | "RESOLVE_BLOCKING_ISSUES"
        | "REFRESH_INTEGRATION"
        | "REGENERATE_ARTIFACT"
        | "FINALIZE_ARTIFACT"
        | "REVIEW_COMPLIANCE_RESULT"
        | "SUBMIT_ARTIFACT"
        | "MONITOR_SUBMISSION"
        | "") || undefined,
    sortBy,
  });

  const bulkOperatePortfolio = trpc.building.bulkOperatePortfolio.useMutation({
    onSuccess: async (result) => {
      setBulkResult(result);
      setSelectedBuildingIds([]);
      await Promise.all([
        utils.building.portfolioWorklist.invalidate(),
        utils.building.list.invalidate(),
      ]);
    },
  });

  if (worklist.isLoading) {
    return <LoadingState />;
  }

  if (worklist.error) {
    return (
      <ErrorState
        message="Portfolio worklist could not load."
        detail={worklist.error.message}
      />
    );
  }

  const data = worklist.data;
  if (!data) {
    return <EmptyState message="No worklist data is available." />;
  }

  const canManageOperatorActions = data.operatorAccess.canManage;
  const visibleBuildingIds = data.items.map((item) => item.buildingId);
  const visibleSelectedCount = visibleBuildingIds.filter((buildingId) =>
    selectedBuildingIds.includes(buildingId),
  ).length;
  const allVisibleSelected =
    visibleBuildingIds.length > 0 && visibleSelectedCount === visibleBuildingIds.length;

  async function runBulkAction(
    action:
      | "RERUN_SOURCE_RECONCILIATION"
      | "REFRESH_PENALTY_SUMMARY"
      | "RETRY_PORTFOLIO_MANAGER_SYNC",
  ) {
    if (selectedBuildingIds.length === 0) {
      return;
    }

    await bulkOperatePortfolio.mutateAsync({
      buildingIds: selectedBuildingIds,
      action,
    });
  }

  function toggleBuildingSelection(buildingId: string, checked: boolean) {
    setSelectedBuildingIds((current) => {
      if (checked) {
        return current.includes(buildingId) ? current : [...current, buildingId];
      }
      return current.filter((value) => value !== buildingId);
    });
  }

  function toggleVisibleSelection(checked: boolean) {
    setSelectedBuildingIds((current) => {
      if (!checked) {
        return current.filter((buildingId) => !visibleBuildingIds.includes(buildingId));
      }

      return Array.from(new Set([...current, ...visibleBuildingIds]));
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Portfolio worklist"
        subtitle="Use the governed worklist to see which buildings are blocked, which are ready for review, and which artifacts are ready to finalize or submit."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { label: "Blocked", value: data.aggregate.blocked },
          { label: "Ready for review", value: data.aggregate.readyForReview },
          { label: "Ready to submit", value: data.aggregate.readyToSubmit },
          { label: "Needs correction", value: data.aggregate.needsCorrection },
          {
            label: "Penalty exposure",
            value: data.aggregate.withPenaltyExposure,
          },
          { label: "Operational risk", value: data.aggregate.withOperationalRisk },
          { label: "Sync attention", value: data.aggregate.withSyncAttention },
          { label: "Draft artifacts", value: data.aggregate.withDraftArtifacts },
          {
            label: "Finalized awaiting action",
            value: data.aggregate.finalizedAwaitingNextAction,
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
          >
            <div className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
              {item.label}
            </div>
            <div className="mt-2 font-mono text-3xl font-semibold text-zinc-900">
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search building name or address"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition-colors focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
        />
        <select
          value={readinessFilter}
          onChange={(event) => setReadinessFilter(event.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm"
        >
          {READINESS_FILTERS.map((option) => (
            <option key={option.label} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={artifactFilter}
          onChange={(event) => setArtifactFilter(event.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm"
        >
          {ARTIFACT_FILTERS.map((option) => (
            <option key={option.label} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={nextActionFilter}
          onChange={(event) => setNextActionFilter(event.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm"
        >
          {NEXT_ACTION_FILTERS.map((option) => (
            <option key={option.label} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={blockingOnly}
            onChange={(event) => setBlockingOnly(event.target.checked)}
          />
          Blocking issues only
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={penaltyOnly}
            onChange={(event) => setPenaltyOnly(event.target.checked)}
          />
          Governed penalty exposure only
        </label>
        <div className="ml-auto">
          <select
            value={sortBy}
            onChange={(event) =>
              setSortBy(
                event.target.value as
                  | "PRIORITY"
                  | "NAME"
                  | "PENALTY"
                  | "LAST_COMPLIANCE_EVALUATED",
              )
            }
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.label} value={option.value}>
                Sort by {option.label.toLowerCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {canManageOperatorActions ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Bulk operator actions</div>
              <div className="mt-1 text-sm text-zinc-500">
                Selected {selectedBuildingIds.length} building(s). Each building is still
                validated individually through the governed server workflow.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => runBulkAction("RERUN_SOURCE_RECONCILIATION")}
                disabled={selectedBuildingIds.length === 0 || bulkOperatePortfolio.isPending}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900 disabled:opacity-50"
              >
                Bulk rerun source reconciliation
              </button>
              <button
                type="button"
                onClick={() => runBulkAction("REFRESH_PENALTY_SUMMARY")}
                disabled={selectedBuildingIds.length === 0 || bulkOperatePortfolio.isPending}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900 disabled:opacity-50"
              >
                Bulk refresh penalty summary
              </button>
              <button
                type="button"
                onClick={() => runBulkAction("RETRY_PORTFOLIO_MANAGER_SYNC")}
                disabled={selectedBuildingIds.length === 0 || bulkOperatePortfolio.isPending}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900 disabled:opacity-50"
              >
                Bulk retry PM sync
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {bulkResult ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 shadow-sm">
          <div className="text-sm font-semibold text-zinc-900">
            Bulk action result: {bulkResult.action.replaceAll("_", " ").toLowerCase()}
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-zinc-600">
            <div>Targets {bulkResult.targetCount}</div>
            <div>Succeeded {bulkResult.succeededCount}</div>
            <div>Failed {bulkResult.failedCount}</div>
            <div>Skipped {bulkResult.skippedCount}</div>
          </div>
          <div className="mt-3 space-y-2 text-sm text-zinc-600">
            {bulkResult.results.slice(0, 8).map((result) => (
              <div key={`${result.buildingId}-${result.status}`} className="rounded-md border border-zinc-200 bg-white px-3 py-2">
                <span className="font-medium text-zinc-900">{result.buildingName}</span>
                {": "}
                {result.status.toLowerCase()} - {result.message}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {data.items.length === 0 ? (
        <EmptyState message="No buildings match the current worklist filters." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50">
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wider text-zinc-500">
                  {canManageOperatorActions ? (
                    <th className="px-5 py-3 font-semibold">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={(event) => toggleVisibleSelection(event.target.checked)}
                        aria-label="Select all visible buildings"
                      />
                    </th>
                  ) : null}
                  <th className="px-5 py-3 font-semibold">Building</th>
                  <th className="px-5 py-3 font-semibold">Readiness</th>
                  <th className="px-5 py-3 font-semibold">Compliance</th>
                  <th className="px-5 py-3 font-semibold">Issues</th>
                  <th className="px-5 py-3 font-semibold">Penalty</th>
                  <th className="px-5 py-3 font-semibold">Runtime</th>
                  <th className="px-5 py-3 font-semibold">Artifacts</th>
                  <th className="px-5 py-3 font-semibold">Last activity</th>
                  <th className="px-5 py-3 font-semibold">Next action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {data.items.map((item) => {
                  const readiness = getSubmissionReadinessDisplay(item.readinessState);
                  const compliance = getPrimaryComplianceStatusDisplay(
                    item.complianceSummary.primaryStatus,
                  );
                  const qa = getVerificationStatusDisplay(
                    item.complianceSummary.qaVerdict ?? "FAIL",
                  );
                  const penalty = getPenaltySummaryStatusDisplay(item.penaltySummary?.status);
                  const benchmarkArtifact = getPacketStatusDisplay(
                    item.artifacts.benchmark.status,
                  );
                  const bepsArtifact = getPacketStatusDisplay(item.artifacts.beps.status);
                  const benchmarkWorkflow = getWorkflowStateDisplay(
                    item.submission.benchmark.state,
                  );
                  const bepsWorkflow = getWorkflowStateDisplay(item.submission.beps.state);
                  const portfolioManagerRuntime = getRuntimeStatusDisplay(
                    item.runtime.portfolioManager.currentState,
                  );
                  const greenButtonRuntime = getRuntimeStatusDisplay(
                    item.runtime.greenButton.currentState,
                  );

                  return (
                    <tr key={item.buildingId} className="align-top">
                      {canManageOperatorActions ? (
                        <td className="px-5 py-4">
                          <input
                            type="checkbox"
                            checked={selectedBuildingIds.includes(item.buildingId)}
                            onChange={(event) =>
                              toggleBuildingSelection(item.buildingId, event.target.checked)
                            }
                            aria-label={`Select ${item.buildingName}`}
                          />
                        </td>
                      ) : null}
                      <td className="px-5 py-4">
                        <Link
                          href={`/buildings/${item.buildingId}`}
                          className="font-semibold text-zinc-900 hover:text-zinc-700"
                        >
                          {item.buildingName}
                        </Link>
                        <div className="mt-1 text-[13px] text-zinc-500">
                          {item.address}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge label={readiness.label} tone={readiness.tone} />
                        <div className="mt-2 text-[12px] text-zinc-500">
                          {item.flags.readyToSubmit
                            ? "Ready to submit"
                            : item.flags.readyForReview
                              ? "Ready for consultant review"
                              : item.flags.submitted
                                ? "Submission is already recorded"
                                : "Blocked by governed issues"}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          <StatusBadge label={compliance.label} tone={compliance.tone} />
                          <StatusBadge label={qa.label} tone={qa.tone} />
                        </div>
                        <div className="mt-2 text-[12px] text-zinc-500">
                          {item.complianceSummary.reasonSummary}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-zinc-600">
                        <div>{item.blockingIssueCount} blocking</div>
                        <div className="mt-1">{item.warningIssueCount} warning</div>
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge label={penalty.label} tone={penalty.tone} />
                        <div className="mt-2 font-mono text-sm text-zinc-900">
                          {formatMoney(item.penaltySummary?.currentEstimatedPenalty)}
                        </div>
                        {item.anomalySummary.activeCount > 0 ? (
                          <div className="mt-2 text-[12px] text-zinc-500">
                            {item.anomalySummary.activeCount} anomaly
                            {item.anomalySummary.activeCount === 1 ? "" : "ies"}
                            {item.anomalySummary.totalEstimatedPenaltyImpactUsd != null
                              ? ` | ${formatMoney(
                                  item.anomalySummary.totalEstimatedPenaltyImpactUsd,
                                )} added risk`
                              : ""}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-5 py-4">
                        <div className="space-y-2">
                          <div>
                            <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                              PM
                            </div>
                            <div className="mt-1">
                              <StatusBadge
                                label={portfolioManagerRuntime.label}
                                tone={portfolioManagerRuntime.tone}
                              />
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                              Green Button
                            </div>
                            <div className="mt-1">
                              <StatusBadge
                                label={greenButtonRuntime.label}
                                tone={greenButtonRuntime.tone}
                              />
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="space-y-2">
                          <div>
                            <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                              Benchmark
                            </div>
                            <div className="mt-1 flex flex-wrap gap-2">
                              <StatusBadge
                                label={benchmarkArtifact.label}
                                tone={benchmarkArtifact.tone}
                              />
                              <StatusBadge
                                label={benchmarkWorkflow.label}
                                tone={benchmarkWorkflow.tone}
                              />
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                              BEPS
                            </div>
                            <div className="mt-1 flex flex-wrap gap-2">
                              <StatusBadge
                                label={bepsArtifact.label}
                                tone={bepsArtifact.tone}
                              />
                              <StatusBadge
                                label={bepsWorkflow.label}
                                tone={bepsWorkflow.tone}
                              />
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-[13px] text-zinc-600">
                        <div>
                          Compliance: {formatDate(item.timestamps.lastComplianceEvaluatedAt)}
                        </div>
                        <div className="mt-1">
                          Penalty: {formatDate(item.timestamps.lastPenaltyCalculatedAt)}
                        </div>
                        <div className="mt-1">
                          Artifact: {formatDate(item.timestamps.lastArtifactGeneratedAt)}
                        </div>
                        <div className="mt-1">
                          Workflow: {formatDate(item.timestamps.lastSubmissionTransitionAt)}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-medium text-zinc-900">
                          {item.nextAction.title}
                        </div>
                        <div className="mt-1 text-[13px] text-zinc-500">
                          {item.nextAction.reason}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
