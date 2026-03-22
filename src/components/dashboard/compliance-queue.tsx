"use client";

import React from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Building2, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/layout/page-header";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/internal/admin-primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BuildingForm, type BuildingFormData } from "@/components/onboarding/building-form";
import {
  StatusBadge,
  getPacketStatusDisplay,
  getPenaltySummaryStatusDisplay,
  getPrimaryComplianceStatusDisplay,
  getRuntimeStatusDisplay,
  getSubmissionWorkflowStateDisplay,
  getSubmissionReadinessDisplay,
  getVerificationStatusDisplay,
  getWorklistTriageDisplay,
  humanizeToken,
} from "@/components/internal/status-helpers";

const TRIAGE_FILTERS = [
  { label: "All triage queues", value: "" },
  { label: "Compliance blockers", value: "COMPLIANCE_BLOCKER" },
  { label: "Artifact attention", value: "ARTIFACT_ATTENTION" },
  { label: "Review queue", value: "REVIEW_QUEUE" },
  { label: "Submission queue", value: "SUBMISSION_QUEUE" },
  { label: "Sync attention", value: "SYNC_ATTENTION" },
  { label: "Operational risk", value: "OPERATIONAL_RISK" },
  { label: "Retrofit queue", value: "RETROFIT_QUEUE" },
  { label: "Monitoring", value: "MONITORING" },
] as const;

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

const SUBMISSION_STATE_FILTERS = [
  { label: "Any workflow state", value: "" },
  { label: "No workflow", value: "NOT_STARTED" },
  { label: "Draft", value: "DRAFT" },
  { label: "Ready for review", value: "READY_FOR_REVIEW" },
  { label: "Approved for submission", value: "APPROVED_FOR_SUBMISSION" },
  { label: "Submitted", value: "SUBMITTED" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Needs correction", value: "NEEDS_CORRECTION" },
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

export function ComplianceQueue() {
  const utils = trpc.useUtils();
  const pageSize = 25;
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [triageUrgencyFilter, setTriageUrgencyFilter] = useState("");
  const [triageFilter, setTriageFilter] = useState("");
  const [readinessFilter, setReadinessFilter] = useState("");
  const [submissionStateFilter, setSubmissionStateFilter] = useState("");
  const [artifactFilter, setArtifactFilter] = useState("");
  const [nextActionFilter, setNextActionFilter] = useState("");
  const [sortBy, setSortBy] = useState<
    "PRIORITY" | "NAME" | "PENALTY" | "LAST_COMPLIANCE_EVALUATED"
  >("PRIORITY");
  const [blockingOnly, setBlockingOnly] = useState(false);
  const [penaltyOnly, setPenaltyOnly] = useState(false);
  const [syncAttentionOnly, setSyncAttentionOnly] = useState(false);
  const [anomalyAttentionOnly, setAnomalyAttentionOnly] = useState(false);
  const [retrofitOnly, setRetrofitOnly] = useState(false);
  const [selectedBuildingIds, setSelectedBuildingIds] = useState<string[]>([]);
  const [bulkResult, setBulkResult] = useState<BulkPortfolioActionResult | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);

  useEffect(() => {
    setCursor(undefined);
    setCursorHistory([]);
  }, [
    search,
    triageUrgencyFilter,
    triageFilter,
    readinessFilter,
    submissionStateFilter,
    artifactFilter,
    nextActionFilter,
    sortBy,
    blockingOnly,
    penaltyOnly,
    syncAttentionOnly,
    anomalyAttentionOnly,
    retrofitOnly,
  ]);

  const worklist = trpc.building.portfolioWorklist.useQuery({
    cursor,
    pageSize,
    search: search || undefined,
    triageUrgency:
      (triageUrgencyFilter as "NOW" | "NEXT" | "MONITOR" | "") || undefined,
    triageBucket:
      (triageFilter as
        | "COMPLIANCE_BLOCKER"
        | "ARTIFACT_ATTENTION"
        | "REVIEW_QUEUE"
        | "SUBMISSION_QUEUE"
        | "SYNC_ATTENTION"
        | "OPERATIONAL_RISK"
        | "RETROFIT_QUEUE"
        | "MONITORING"
        | "") || undefined,
    readinessState:
      (readinessFilter as
        | "DATA_INCOMPLETE"
        | "READY_FOR_REVIEW"
        | "READY_TO_SUBMIT"
        | "SUBMITTED"
        | "") || undefined,
    hasBlockingIssues: blockingOnly ? true : undefined,
    hasPenaltyExposure: penaltyOnly ? true : undefined,
    submissionState:
      (submissionStateFilter as
        | "NOT_STARTED"
        | "DRAFT"
        | "READY_FOR_REVIEW"
        | "APPROVED_FOR_SUBMISSION"
        | "SUBMITTED"
        | "COMPLETED"
        | "NEEDS_CORRECTION"
        | "SUPERSEDED"
        | "") || undefined,
    needsSyncAttention: syncAttentionOnly ? true : undefined,
    needsAnomalyAttention: anomalyAttentionOnly ? true : undefined,
    hasRetrofitOpportunity: retrofitOnly ? true : undefined,
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
  const createBuilding = trpc.building.create.useMutation({
    onSuccess: async (createdBuilding) => {
      await Promise.all([
        utils.building.list.invalidate(),
        utils.building.portfolioWorklist.invalidate(),
      ]);
      setIsCreateDialogOpen(false);

      if (typeof window !== "undefined") {
        window.location.assign(`/buildings/${createdBuilding.id}`);
      }
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
    return (
      <EmptyState
        message="The governed worklist is not ready to display yet. Refresh the page once the portfolio view is available."
      />
    );
  }

  const canManageOperatorActions = data.operatorAccess.canManage;
  const pageInfo = data.pageInfo;
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

  function clearFilters() {
    setSearch("");
    setTriageUrgencyFilter("");
    setTriageFilter("");
    setReadinessFilter("");
    setSubmissionStateFilter("");
    setArtifactFilter("");
    setNextActionFilter("");
    setBlockingOnly(false);
    setPenaltyOnly(false);
    setSyncAttentionOnly(false);
    setAnomalyAttentionOnly(false);
    setRetrofitOnly(false);
  }

  function moveToNextPage() {
    if (!pageInfo.nextCursor) {
      return;
    }

    setCursorHistory((current) => [...current, cursor ?? ""]);
    setCursor(pageInfo.nextCursor);
  }

  function moveToPreviousPage() {
    if (cursorHistory.length === 0) {
      setCursor(undefined);
      return;
    }

    const previousCursor = cursorHistory[cursorHistory.length - 1];
    setCursor(previousCursor || undefined);
    setCursorHistory(cursorHistory.slice(0, -1));
  }

  const currentPage = cursorHistory.length + 1;
  const totalPages = Math.max(
    1,
    Math.ceil(pageInfo.totalMatchingCount / pageSize),
  );
  const pageStart =
    pageInfo.totalMatchingCount === 0 ? 0 : cursorHistory.length * pageSize + 1;
  const pageEnd =
    pageInfo.totalMatchingCount === 0
      ? 0
      : cursorHistory.length * pageSize + pageInfo.returnedCount;

  const hasActiveFilters =
    search.length > 0 ||
    triageUrgencyFilter.length > 0 ||
    triageFilter.length > 0 ||
    readinessFilter.length > 0 ||
    submissionStateFilter.length > 0 ||
    artifactFilter.length > 0 ||
    nextActionFilter.length > 0 ||
    blockingOnly ||
    penaltyOnly ||
    syncAttentionOnly ||
    anomalyAttentionOnly ||
    retrofitOnly;

  function handleCreateBuilding(input: BuildingFormData) {
    createBuilding.mutate({
      name: input.name,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      grossSquareFeet: input.grossSquareFeet,
      propertyType: input.propertyType as "OFFICE" | "MULTIFAMILY" | "MIXED_USE" | "OTHER",
      yearBuilt: input.yearBuilt ?? undefined,
      bepsTargetScore: input.bepsTargetScore,
      espmPropertyId: input.espmPropertyId,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Portfolio worklist"
        subtitle="Use the governed worklist to see which buildings are blocked, which are ready for review, and which artifacts are ready to finalize or submit."
      >
        <div className="w-full border border-zinc-200/80 bg-white px-5 py-5 sm:min-w-[340px] sm:max-w-[420px]">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="quoin-kicker">
                Portfolio setup
              </div>
              <div className="mt-2 font-display text-2xl font-medium tracking-tight text-zinc-900">
                Add a building into the governed workflow
              </div>
              <div className="mt-2 text-sm leading-7 text-zinc-500">
                Create the record first, then connect data sources, review compliance,
                and package artifacts from the same building workspace.
              </div>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-zinc-200 bg-zinc-50 text-zinc-600">
              <Building2 size={18} />
            </div>
          </div>
          <button type="button" onClick={() => setIsCreateDialogOpen(true)} className="btn-primary mt-5 w-full justify-center text-sm">
            <Plus size={16} />
            Add building
          </button>
        </div>
      </PageHeader>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent
          className="border border-zinc-200/80 bg-white p-0 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)]"
          style={{ width: "min(calc(100vw - 2rem), 48rem)", maxWidth: "48rem" }}
        >
          <DialogHeader className="border-b border-zinc-200 px-6 py-5">
            <DialogTitle>Add building</DialogTitle>
            <DialogDescription>
              Create a building record so it can enter the governed compliance workflow.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[calc(100vh-8rem)] overflow-y-auto px-6 py-6">
            <div className="space-y-5">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Manual scope
                </div>
                <div className="mt-2 text-lg font-semibold tracking-tight text-zinc-900">
                  Start with the building record
                </div>
                <div className="mt-2 text-sm leading-relaxed text-zinc-600">
                  Quoin uses the building as the governed anchor for source reconciliation,
                  compliance evaluation, artifacts, and reports.
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm text-zinc-600">
                  <div className="rounded-xl border border-zinc-200/80 bg-white px-4 py-3 shadow-sm">
                    Link Portfolio Manager later if needed.
                  </div>
                  <div className="rounded-xl border border-zinc-200/80 bg-white px-4 py-3 shadow-sm">
                    Upload utility data after creation.
                  </div>
                  <div className="rounded-xl border border-zinc-200/80 bg-white px-4 py-3 shadow-sm">
                    Governed readiness, penalty, and artifact history attach to this record.
                  </div>
                </div>
              </div>
              <div className="min-w-0">
                <BuildingForm
                  onSubmit={handleCreateBuilding}
                  loading={createBuilding.isPending}
                />
                {createBuilding.error ? (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    {createBuilding.error.message}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-6">
        <div className="quoin-metric-strip lg:grid-cols-4">
          {[
            {
              label: "Needs attention now",
              value: data.aggregate.needsAttentionNow.toString().padStart(2, "0"),
              copy: "Buildings with immediate governed blockers, workflow stalls, or urgent operational follow-up.",
            },
            {
              label: "Ready for review",
              value: data.aggregate.readyForReview.toString().padStart(2, "0"),
              copy: "Governed building records prepared for consultant review.",
            },
            {
              label: "Ready to submit",
              value: data.aggregate.readyToSubmit.toString().padStart(2, "0"),
              copy: "Artifacts and workflow state aligned for submission handling.",
            },
            {
              label: "Penalty exposure",
              value: data.aggregate.withPenaltyExposure.toString().padStart(2, "0"),
              copy: "Buildings with an active governed penalty estimate on record.",
            },
          ].map((item) => (
            <div key={item.label} className="quoin-metric">
              <div className="quoin-metric-label">{item.label}</div>
              <div className="quoin-metric-value">{item.value}</div>
              <div className="quoin-metric-copy">{item.copy}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-x-8 gap-y-3 border-t border-zinc-200 pt-5 text-sm text-zinc-600 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Blocked", data.aggregate.blocked],
            ["Submission queue", data.aggregate.submissionQueue],
            ["Review queue", data.aggregate.reviewQueue],
            ["Needs correction", data.aggregate.needsCorrection],
            ["Operational risk", data.aggregate.withOperationalRisk],
            ["Retrofit opportunities", data.aggregate.withActionableRetrofits],
            ["Sync attention", data.aggregate.withSyncAttention],
            ["Draft artifacts", data.aggregate.withDraftArtifacts],
          ].map(([label, value]) => (
            <div key={label as string} className="flex items-center justify-between gap-4 border-b border-zinc-100 py-2">
              <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">{label}</span>
              <span className="font-display text-xl font-medium text-zinc-900">{String(value)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
        <div>
          Showing {pageStart}-{pageEnd} of {pageInfo.totalMatchingCount} matching
          {" "}buildings
          {" | "}Page {currentPage} of {totalPages}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={moveToPreviousPage}
            disabled={cursorHistory.length === 0}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={moveToNextPage}
            disabled={!pageInfo.nextCursor}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { label: "Needs attention now", value: "NOW", kind: "urgency" as const },
          { label: "Submission queue", value: "SUBMISSION_QUEUE" },
          { label: "Sync attention", value: "SYNC_ATTENTION" },
          { label: "Operational risk", value: "OPERATIONAL_RISK" },
          { label: "Retrofit queue", value: "RETROFIT_QUEUE" },
        ].map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => {
              if ("kind" in preset) {
                setTriageUrgencyFilter((current) =>
                  current === preset.value ? "" : preset.value,
                );
                return;
              }
              setTriageFilter((current) => (current === preset.value ? "" : preset.value));
            }}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              (("kind" in preset && triageUrgencyFilter === preset.value) ||
                (!("kind" in preset) && triageFilter === preset.value))
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 hover:text-zinc-900"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search building name or address"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition-colors focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
        />
        <select
          value={triageFilter}
          onChange={(event) => setTriageFilter(event.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm"
        >
          {TRIAGE_FILTERS.map((option) => (
            <option key={option.label} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
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
          value={submissionStateFilter}
          onChange={(event) => setSubmissionStateFilter(event.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm"
        >
          {SUBMISSION_STATE_FILTERS.map((option) => (
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
        <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={syncAttentionOnly}
            onChange={(event) => setSyncAttentionOnly(event.target.checked)}
          />
          Sync attention only
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={anomalyAttentionOnly}
            onChange={(event) => setAnomalyAttentionOnly(event.target.checked)}
          />
          Anomaly attention only
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={retrofitOnly}
            onChange={(event) => setRetrofitOnly(event.target.checked)}
          />
          Retrofit queue only
        </label>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900"
          >
            Clear filters
          </button>
        ) : null}
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

      {canManageOperatorActions && selectedBuildingIds.length > 0 ? (
        <div className="border-y border-zinc-200 bg-white px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Selected buildings</div>
              <div className="mt-1 text-sm text-zinc-500">
                {selectedBuildingIds.length} building(s) selected. Bulk actions stay
                contextual and each building is still validated individually through the
                governed workflow.
              </div>
              {selectedBuildingIds.length > 0 && visibleSelectedCount !== selectedBuildingIds.length ? (
                <div className="mt-1 text-xs text-zinc-500">
                  {visibleSelectedCount} selected in the current filtered view.
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedBuildingIds([])}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900"
              >
                Clear selection
              </button>
              <button
                type="button"
                onClick={() => runBulkAction("RERUN_SOURCE_RECONCILIATION")}
                disabled={bulkOperatePortfolio.isPending}
                className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.14em] text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900 disabled:opacity-50"
              >
                Refresh source reconciliation
              </button>
              <button
                type="button"
                onClick={() => runBulkAction("REFRESH_PENALTY_SUMMARY")}
                disabled={bulkOperatePortfolio.isPending}
                className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.14em] text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900 disabled:opacity-50"
              >
                Refresh penalty summary
              </button>
              <button
                type="button"
                onClick={() => runBulkAction("RETRY_PORTFOLIO_MANAGER_SYNC")}
                disabled={bulkOperatePortfolio.isPending}
                className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.14em] text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900 disabled:opacity-50"
              >
                Retry PM sync
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {bulkResult ? (
        <div className="border-l border-zinc-300 bg-zinc-50 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-zinc-900">
                Bulk action result: {humanizeToken(bulkResult.action)}
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-sm text-zinc-600">
                <div>Targets {bulkResult.targetCount}</div>
                <div>Succeeded {bulkResult.succeededCount}</div>
                <div>Failed {bulkResult.failedCount}</div>
                <div>Skipped {bulkResult.skippedCount}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setBulkResult(null)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900"
            >
              Clear result
            </button>
          </div>
          <div className="mt-3 space-y-2 text-sm text-zinc-600">
            {bulkResult.results.slice(0, 8).map((result) => (
              <div key={`${result.buildingId}-${result.status}`} className="rounded-md border border-zinc-200 bg-white px-3 py-2">
                <span className="font-medium text-zinc-900">{result.buildingName}</span>
                {": "}
                {humanizeToken(result.status)} - {result.message}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {data.items.length === 0 ? (
        <EmptyState
          message={
            hasActiveFilters
              ? "No buildings match the current worklist filters. Clear the filters to return to the broader governed queue."
              : "No buildings are in the governed worklist yet. Add a building to start source review, compliance evaluation, and package preparation."
          }
          action={
            hasActiveFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900"
              >
                Clear filters
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsCreateDialogOpen(true)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900"
              >
                Add building
              </button>
            )
          }
        />
      ) : (
        <div className="overflow-hidden border-y border-zinc-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50/70">
                <tr className="border-b border-zinc-200 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
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
                  <th className="px-5 py-3 font-semibold">Triage</th>
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
                  const benchmarkWorkflow = getSubmissionWorkflowStateDisplay(
                    item.submission.benchmark.state,
                  );
                  const bepsWorkflow = getSubmissionWorkflowStateDisplay(item.submission.beps.state);
                  const portfolioManagerRuntime = getRuntimeStatusDisplay(
                    item.runtime.portfolioManager.currentState,
                  );
                  const greenButtonRuntime = getRuntimeStatusDisplay(
                    item.runtime.greenButton.currentState,
                  );
                  const triage = getWorklistTriageDisplay(item.triage.bucket);

                  return (
                    <tr key={item.buildingId} className="align-top transition-colors hover:bg-zinc-50/60">
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
                        <div className="mt-2 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                          {triage.label}
                        </div>
                        <div className="mt-1 text-[13px] text-zinc-500">
                          {item.address}
                        </div>
                        <div className="mt-2 space-y-1 text-[12px] text-zinc-500">
                          {item.flags.needsSyncAttention ? (
                            <div>Integration recovery is flagged.</div>
                          ) : null}
                          {item.flags.needsAnomalyAttention ? (
                            <div>Operational risk needs review.</div>
                          ) : null}
                          {item.retrofitSummary.topOpportunity ? (
                            <div>
                              Advisory retrofit: {item.retrofitSummary.topOpportunity.name}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge
                          label={item.triage.urgency === "NOW" ? "Needs attention now" : item.triage.urgency === "NEXT" ? "Next up" : "Monitor"}
                          tone={item.triage.urgency === "NOW" ? "danger" : item.triage.urgency === "NEXT" ? "info" : "muted"}
                        />
                        <div className="mt-2 text-[12px] text-zinc-500">
                          {item.triage.cue}
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
                        <div className="font-medium text-zinc-900">{compliance.label}</div>
                        <div className="mt-1 text-[12px] uppercase tracking-[0.16em] text-zinc-500">
                          QA {qa.label}
                        </div>
                        <div className="mt-2 text-[12px] text-zinc-500">
                          {item.complianceSummary.reasonSummary}
                        </div>
                        <div className="mt-2 text-[12px] text-zinc-500">
                          Workflow {getSubmissionWorkflowStateDisplay(item.submission.overall.state).label}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-zinc-600">
                        <div>{item.blockingIssueCount} blocking</div>
                        <div className="mt-1">{item.warningIssueCount} warning</div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-mono text-sm text-zinc-900">
                          {formatMoney(item.penaltySummary?.currentEstimatedPenalty)}
                        </div>
                        <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                          {penalty.label}
                        </div>
                        {item.anomalySummary.activeCount > 0 ? (
                          <div className="mt-2 text-[12px] text-zinc-500">
                            {item.anomalySummary.activeCount}{" "}
                            {item.anomalySummary.activeCount === 1 ? "anomaly" : "anomalies"}
                            {item.anomalySummary.totalEstimatedPenaltyImpactUsd != null
                              ? ` | ${formatMoney(
                                  item.anomalySummary.totalEstimatedPenaltyImpactUsd,
                                )} added risk`
                              : ""}
                          </div>
                        ) : null}
                        {item.retrofitSummary.topOpportunity ? (
                          <div className="mt-2 text-[12px] text-zinc-500">
                            Top retrofit: {item.retrofitSummary.topOpportunity.name}
                            {" | "}
                            {formatMoney(
                              item.retrofitSummary.topOpportunity
                                .estimatedAvoidedPenalty,
                            )}{" "}
                            avoided
                          </div>
                        ) : null}
                      </td>
                      <td className="px-5 py-4">
                        <div className="space-y-3 text-[12px] text-zinc-600">
                          <div>
                            <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                              PM
                            </div>
                            <div className="mt-1 text-zinc-900">{portfolioManagerRuntime.label}</div>
                          </div>
                          <div>
                            <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                              Green Button
                            </div>
                            <div className="mt-1 text-zinc-900">{greenButtonRuntime.label}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="space-y-3 text-[12px] text-zinc-600">
                          <div>
                            <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                              Benchmark
                            </div>
                            <div className="mt-1 text-zinc-900">
                              {benchmarkArtifact.label}
                            </div>
                            <div className="mt-1 text-zinc-500">{benchmarkWorkflow.label}</div>
                          </div>
                          <div>
                            <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                              BEPS
                            </div>
                            <div className="mt-1 text-zinc-900">{bepsArtifact.label}</div>
                            <div className="mt-1 text-zinc-500">{bepsWorkflow.label}</div>
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
                        <div className="border-l-2 border-zinc-900 pl-3">
                          <div className="font-medium text-zinc-900">
                            {item.nextAction.title}
                          </div>
                          <div className="mt-1 text-[13px] text-zinc-500">
                            {item.nextAction.reason}
                          </div>
                        </div>
                        <div className="mt-2 text-[12px] text-zinc-500">
                          {item.triage.bucket === "COMPLIANCE_BLOCKER"
                            ? "Primary queue: compliance blockers"
                            : item.triage.bucket === "ARTIFACT_ATTENTION"
                              ? "Primary queue: artifact attention"
                              : item.triage.bucket === "REVIEW_QUEUE"
                                ? "Primary queue: review"
                                : item.triage.bucket === "SUBMISSION_QUEUE"
                                  ? "Primary queue: submission"
                                  : item.triage.bucket === "SYNC_ATTENTION"
                                    ? "Primary queue: integration recovery"
                                    : item.triage.bucket === "OPERATIONAL_RISK"
                                      ? "Primary queue: operational risk"
                                      : item.triage.bucket === "RETROFIT_QUEUE"
                                        ? "Primary queue: retrofit planning"
                                        : "Primary queue: monitoring"}
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
