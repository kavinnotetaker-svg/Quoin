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
 readinessState: undefined,
 hasBlockingIssues: triageFilter === 'COMPLIANCE_BLOCKER' ? true : undefined,
 hasPenaltyExposure: undefined,
 submissionState: undefined,
 needsSyncAttention: undefined,
 needsAnomalyAttention: triageUrgencyFilter === 'NOW' ? true : undefined,
 hasRetrofitOpportunity: undefined,
 artifactStatus: undefined,
 nextAction: undefined,
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
 setTriageFilter("");
 setTriageUrgencyFilter("");
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
 <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between border-b-2 border-zinc-900 pb-8 mb-12">
 <PageHeader
 title="Buildings"
 subtitle="Prioritize benchmark readiness, verification packets, and submission workflow from the governed worklist."
 />
 <div className="mt-8 lg:mt-0 flex flex-col items-start lg:items-end">
 <div className="text-[10px] font-mono tracking-[0.2em] text-zinc-500 uppercase mb-3">Portfolio Setup</div>
 <button
 onClick={() => setIsCreateDialogOpen(true)}
 className="group flex items-center gap-2 text-sm font-medium text-zinc-900 hover:text-zinc-600 transition-colors"
 >
 <Plus size={16} className="text-zinc-400 group-hover:text-zinc-900 transition-colors" />
 Add building
 </button>
 </div>
 </div>

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
 <div className="min-w-0">
 <BuildingForm
 onSubmit={handleCreateBuilding}
 loading={createBuilding.isPending}
 />
 {createBuilding.error ? (
 <div className="mt-4 border border-red-200 bg-red-50 p-4 text-sm text-red-800">
 {createBuilding.error.message}
 </div>
 ) : null}
 </div>
 </div>
 </div>
 </DialogContent>
 </Dialog>

 <div className="space-y-6">
 <div className="grid lg:grid-cols-4 gap-x-12 gap-y-10">
 {[
 {
 label: "Blocked buildings",
 value: data.aggregate.blocked.toString().padStart(2, "0"),
 copy: "Buildings where governed benchmark readiness or packet workflow is blocked right now.",
 },
 {
 label: "Ready for review",
 value: data.aggregate.readyForReview.toString().padStart(2, "0"),
 copy: "Buildings with a finalized governed benchmark packet ready for consultant review.",
 },
 {
 label: "Ready to submit",
 value: data.aggregate.readyToSubmit.toString().padStart(2, "0"),
 copy: "Buildings already approved and ready for benchmark submission handling.",
 },
 {
 label: "Sync attention",
 value: data.aggregate.withSyncAttention.toString().padStart(2, "0"),
 copy: "Buildings whose source connection state still needs refresh before benchmark work can proceed cleanly.",
 },
 ].map((item) => (
 <div key={item.label}>
 <div className="text-[10px] font-mono tracking-[0.2em] text-zinc-500 uppercase mb-4">{item.label}</div>
 <div className="font-display text-4xl tracking-tight text-zinc-900 mb-4">{item.value}</div>
 <div className="text-sm leading-relaxed text-zinc-600">{item.copy}</div>
 </div>
 ))}
 </div>

 <div className="space-y-4 border-t border-zinc-200 pt-8">
 <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
 Secondary signals
 </div>
 <div className="grid gap-x-12 gap-y-6 text-sm text-zinc-900 md:grid-cols-2 xl:grid-cols-4 font-mono">
 {[
 ["Blocked", data.aggregate.blocked],
 ["Submission queue", data.aggregate.submissionQueue],
 ["Review queue", data.aggregate.reviewQueue],
 ["Needs correction", data.aggregate.needsCorrection],
 ["Penalty exposure", data.aggregate.withPenaltyExposure],
 ["Operational risk", data.aggregate.withOperationalRisk],
 ["Retrofit opportunities", data.aggregate.withActionableRetrofits],
 ["Draft artifacts", data.aggregate.withDraftArtifacts],
 ].map(([label, value]) => (
 <div key={label as string} className="flex flex-col gap-1">
 <span className="text-[10px] tracking-[0.1em] text-zinc-500 uppercase">{label}</span>
 <span className="text-lg">{String(value)}</span>
 </div>
 ))}
 </div>
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

 <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8 mt-16 mb-8 border-t-2 border-zinc-900 pt-8">
 <div className="flex flex-wrap items-center gap-8">
 {[
 { label: "All Portfolio", value: "" },
 { label: "Needs attention", value: "NOW", kind: "urgency" },
 { label: "Compliance blockers", value: "COMPLIANCE_BLOCKER" },
 ].map((preset) => {
 const isActive = (("kind" in preset && triageUrgencyFilter === preset.value) ||
 (!("kind" in preset) && triageFilter === preset.value));
 
 return (
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
 className={`text-[12px] font-mono tracking-[0.15em] uppercase transition-colors pb-2 border-b-2 ${
 isActive
 ? "border-zinc-900 text-zinc-900"
 : "border-transparent text-zinc-400 hover:text-zinc-900"
 }`}
 >
 {preset.label}
 </button>
 );
 })}
 </div>
 
 <div className="w-full xl:w-96">
 <input
 type="text"
 value={search}
 onChange={(event) => setSearch(event.target.value)}
 placeholder="Filter building name or ID"
 className="w-full border-b border-zinc-300 bg-transparent px-0 py-2 text-sm font-mono text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none transition-colors"
 />
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
 <thead className="bg-zinc-50">
 <tr className="border-y border-zinc-200 text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
 {canManageOperatorActions ? (
 <th className="px-5 py-3 font-semibold w-[1%]">
 <input
 type="checkbox"
 checked={allVisibleSelected}
 onChange={(event) => toggleVisibleSelection(event.target.checked)}
 aria-label="Select all visible buildings"
 />
 </th>
 ) : null}
 <th className="px-5 py-3 font-semibold">Building & Triage</th>
 <th className="px-5 py-3 font-semibold">Primary Status</th>
 <th className="px-5 py-3 font-semibold">Current Blocker</th>
 <th className="px-5 py-3 font-semibold">Next Action</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-zinc-100">
 {data.items.map((item) => {
 const compliance = getPrimaryComplianceStatusDisplay(item.complianceSummary.primaryStatus);
 const benchmarkArtifact = getPacketStatusDisplay(item.artifacts.benchmark.status);

 return (
 <tr key={item.buildingId} className="align-top transition-colors hover:bg-zinc-50">
 {canManageOperatorActions ? (
 <td className="px-5 py-4 w-[1%] whitespace-nowrap">
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
 <td className="px-5 py-4 min-w-[280px]">
 <div className="flex items-center gap-3">
 <Link href={`/buildings/${item.buildingId}`} className="font-display text-base font-medium tracking-tight text-zinc-900 hover:text-zinc-600 transition-colors">
 {item.buildingName}
 </Link>
 {item.triage.urgency === "NOW" && (
 <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm bg-red-50 text-red-700 text-[10px] font-mono uppercase tracking-widest ring-1 ring-inset ring-red-600/20">
 Action Required
 </span>
 )}
 </div>
 <div className="mt-1 text-sm text-zinc-500">{item.address}</div>
 <div className="mt-2 text-sm text-zinc-500 max-w-[280px] leading-relaxed">
 {item.triage.cue}
 </div>
 </td>
 <td className="px-5 py-4 min-w-[240px]">
 <div className="font-medium text-zinc-900">{compliance.label}</div>
 <div className="mt-1 text-sm text-zinc-500">
 {item.flags.readyToSubmit ? "Ready to submit" : item.flags.readyForReview ? "Ready for consultant review" : "Not mathematically ready"}
 </div>
 <div className="mt-2 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
 Artifacts: {benchmarkArtifact.label}
 </div>
 </td>
 <td className="px-5 py-4 min-w-[260px]">
 {item.blockingIssueCount > 0 ? (
 <div className="text-sm font-medium text-red-700">{item.blockingIssueCount} Blocking Issues</div>
 ) : (
 <div className="text-sm font-medium text-zinc-900">No Blockers</div>
 )}
 <div className="mt-1 text-sm text-zinc-500 max-w-[280px] leading-relaxed">
 {item.complianceSummary.reasonSummary}
 </div>
 {item.penaltySummary?.currentEstimatedPenalty != null && item.penaltySummary.currentEstimatedPenalty > 0 && (
 <div className="mt-2 text-[10px] font-mono uppercase tracking-widest text-amber-600">
 Exposure: {formatMoney(item.penaltySummary.currentEstimatedPenalty)}
 </div>
 )}
 </td>
 <td className="px-5 py-4 min-w-[260px]">
 <div className="font-medium text-zinc-900">{item.nextAction.title}</div>
 <div className="mt-1 text-sm text-zinc-500 max-w-[280px] leading-relaxed">{item.nextAction.reason}</div>
 <div className="mt-2 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
 Updated: {formatDate(item.timestamps.lastComplianceEvaluatedAt)}
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
