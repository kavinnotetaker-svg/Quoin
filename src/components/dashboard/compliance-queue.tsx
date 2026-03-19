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
  const [search, setSearch] = useState("");
  const [readinessFilter, setReadinessFilter] = useState("");
  const [artifactFilter, setArtifactFilter] = useState("");
  const [nextActionFilter, setNextActionFilter] = useState("");
  const [sortBy, setSortBy] = useState<
    "PRIORITY" | "NAME" | "PENALTY" | "LAST_COMPLIANCE_EVALUATED"
  >("PRIORITY");
  const [blockingOnly, setBlockingOnly] = useState(false);
  const [penaltyOnly, setPenaltyOnly] = useState(false);

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
        | "REGENERATE_ARTIFACT"
        | "FINALIZE_ARTIFACT"
        | "REVIEW_COMPLIANCE_RESULT"
        | "SUBMIT_ARTIFACT"
        | "MONITOR_SUBMISSION"
        | "") || undefined,
    sortBy,
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
          { label: "Draft artifacts", value: data.aggregate.withDraftArtifacts },
          {
            label: "Finalized awaiting action",
            value: data.aggregate.finalizedAwaitingNextAction,
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
              {item.label}
            </div>
            <div className="mt-2 font-mono text-3xl font-semibold text-slate-900">
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
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition-colors focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
        />
        <select
          value={readinessFilter}
          onChange={(event) => setReadinessFilter(event.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
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
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
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
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
        >
          {NEXT_ACTION_FILTERS.map((option) => (
            <option key={option.label} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={blockingOnly}
            onChange={(event) => setBlockingOnly(event.target.checked)}
          />
          Blocking issues only
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
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
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.label} value={option.value}>
                Sort by {option.label.toLowerCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {data.items.length === 0 ? (
        <EmptyState message="No buildings match the current worklist filters." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3 font-semibold">Building</th>
                  <th className="px-5 py-3 font-semibold">Readiness</th>
                  <th className="px-5 py-3 font-semibold">Compliance</th>
                  <th className="px-5 py-3 font-semibold">Issues</th>
                  <th className="px-5 py-3 font-semibold">Penalty</th>
                  <th className="px-5 py-3 font-semibold">Artifacts</th>
                  <th className="px-5 py-3 font-semibold">Last activity</th>
                  <th className="px-5 py-3 font-semibold">Next action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
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

                  return (
                    <tr key={item.buildingId} className="align-top">
                      <td className="px-5 py-4">
                        <Link
                          href={`/buildings/${item.buildingId}`}
                          className="font-semibold text-slate-900 hover:text-slate-700"
                        >
                          {item.buildingName}
                        </Link>
                        <div className="mt-1 text-[13px] text-slate-500">
                          {item.address}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge label={readiness.label} tone={readiness.tone} />
                        <div className="mt-2 text-[12px] text-slate-500">
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
                        <div className="mt-2 text-[12px] text-slate-500">
                          {item.complianceSummary.reasonSummary}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        <div>{item.blockingIssueCount} blocking</div>
                        <div className="mt-1">{item.warningIssueCount} warning</div>
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge label={penalty.label} tone={penalty.tone} />
                        <div className="mt-2 font-mono text-sm text-slate-900">
                          {formatMoney(item.penaltySummary?.currentEstimatedPenalty)}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="space-y-2">
                          <div>
                            <div className="text-[11px] uppercase tracking-wider text-slate-500">
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
                            <div className="text-[11px] uppercase tracking-wider text-slate-500">
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
                      <td className="px-5 py-4 text-[13px] text-slate-600">
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
                        <div className="font-medium text-slate-900">
                          {item.nextAction.title}
                        </div>
                        <div className="mt-1 text-[13px] text-slate-500">
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
