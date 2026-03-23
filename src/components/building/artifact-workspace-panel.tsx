"use client";

import React from "react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
 ErrorState,
 Panel,
 downloadFile,
 formatDate,
 formatMoney,
} from "@/components/internal/admin-primitives";
import {
 StatusBadge,
 getPacketStatusDisplay,
 getSubmissionWorkflowStateDisplay,
} from "@/components/internal/status-helpers";

function getDispositionDisplay(disposition: string | null) {
 switch (disposition) {
 case "READY":
 return { label: "Ready", tone: "success" as const };
 case "READY_WITH_WARNINGS":
 return { label: "Ready with warnings", tone: "warning" as const };
 case "BLOCKED":
 return { label: "Blocked", tone: "danger" as const };
 default:
 return { label: "Not generated", tone: "muted" as const };
 }
}

function getFinalizeGuidance(workflow: ArtifactWorkflow) {
 if (workflow.canFinalize) {
 return "Finalize is available because the latest governed artifact is ready to lock for review.";
 }

 if (!workflow.latestArtifact) {
 return "Generate the governed artifact before finalization is available.";
 }

 if (workflow.latestArtifact.finalizedAt) {
 return "The latest governed artifact is already finalized.";
 }

 return "Finalize is blocked by the current governed artifact state.";
}

function getWorkflowGuidance(
 workflow: ArtifactWorkflow,
 canManageSubmissionWorkflows: boolean,
) {
 if (!canManageSubmissionWorkflows) {
 return "Submission workflow transitions require manager or admin access.";
 }

 if (!workflow.submissionWorkflow) {
 return "Generate the governed artifact to start submission workflow tracking.";
 }

 return workflow.submissionWorkflow.nextAction.reason;
}

type ArtifactWorkflow = {
 label: string;
 packetType: string | null;
 sourceRecordId: string | null;
 status: "NOT_STARTED" | "DRAFT" | "GENERATED" | "STALE" | "FINALIZED";
 disposition: string | null;
 canGenerate: boolean;
 canFinalize: boolean;
 latestArtifact: {
 id: string;
 version: number;
 status: "NOT_STARTED" | "DRAFT" | "GENERATED" | "STALE" | "FINALIZED";
 packetHash: string;
 generatedAt: string;
 finalizedAt: string | null;
 exportAvailable: boolean;
 lastExportedAt: string | null;
 lastExportFormat: "JSON" | "MARKDOWN" | "PDF" | null;
 } | null;
 history: Array<{
 id: string;
 version: number;
 status: "NOT_STARTED" | "DRAFT" | "GENERATED" | "STALE" | "FINALIZED";
 packetHash: string;
 generatedAt: string;
 finalizedAt: string | null;
 exportAvailable: boolean;
 lastExportedAt: string | null;
 lastExportFormat: "JSON" | "MARKDOWN" | "PDF" | null;
 }>;
 submissionWorkflow: {
 id: string;
 state:
 | "NOT_STARTED"
 | "DRAFT"
 | "READY_FOR_REVIEW"
 | "APPROVED_FOR_SUBMISSION"
 | "SUBMITTED"
 | "COMPLETED"
 | "NEEDS_CORRECTION"
 | "SUPERSEDED";
 latestTransitionAt: string | null;
 readyForReviewAt: string | null;
 approvedAt: string | null;
 submittedAt: string | null;
 completedAt: string | null;
 needsCorrectionAt: string | null;
 latestNotes: string | null;
 allowedTransitions: Array<{
 nextState:
 | "READY_FOR_REVIEW"
 | "APPROVED_FOR_SUBMISSION"
 | "SUBMITTED"
 | "COMPLETED"
 | "NEEDS_CORRECTION";
 label: string;
 }>;
 nextAction: {
 title: string;
 reason: string;
 };
 history: Array<{
 id: string;
 fromState:
 | "DRAFT"
 | "READY_FOR_REVIEW"
 | "APPROVED_FOR_SUBMISSION"
 | "SUBMITTED"
 | "COMPLETED"
 | "NEEDS_CORRECTION"
 | "SUPERSEDED"
 | null;
 toState:
 | "DRAFT"
 | "READY_FOR_REVIEW"
 | "APPROVED_FOR_SUBMISSION"
 | "SUBMITTED"
 | "COMPLETED"
 | "NEEDS_CORRECTION"
 | "SUPERSEDED";
 notes: string | null;
 createdAt: string;
 createdByType: string;
 createdById: string | null;
 }>;
 } | null;
 blockersCount: number;
 warningCount: number;
 sourceContext: {
 readinessState: string;
 primaryStatus: string;
 qaVerdict: string | null;
 reasonSummary: string;
 reportingYear: number | null;
 filingYear: number | null;
 complianceCycle: string | null;
 complianceRunId: string | null;
 readinessEvaluatedAt: string | null;
 complianceEvaluatedAt: string | null;
 penaltyRunId: string | null;
 penaltyEstimatedAt: string | null;
 currentEstimatedPenalty: number | null;
 };
};

function ArtifactCard({
 workflow,
 onGenerate,
 onFinalize,
 onExport,
 isGenerating,
 isFinalizing,
 onWorkflowTransition,
 isTransitioning,
 canManageSubmissionWorkflows,
 transitionNotes,
 onTransitionNotesChange,
}: {
 workflow: ArtifactWorkflow;
 onGenerate: () => void;
 onFinalize: () => void;
 onExport: (format: "JSON" | "MARKDOWN" | "PDF") => void;
 isGenerating: boolean;
 isFinalizing: boolean;
 onWorkflowTransition: (
 nextState:
 | "READY_FOR_REVIEW"
 | "APPROVED_FOR_SUBMISSION"
 | "SUBMITTED"
 | "COMPLETED"
 | "NEEDS_CORRECTION",
 notes: string | null,
 ) => void;
 isTransitioning: boolean;
 canManageSubmissionWorkflows: boolean;
 transitionNotes: string;
 onTransitionNotesChange: (value: string) => void;
}) {
 const statusDisplay = getPacketStatusDisplay(workflow.status);
 const dispositionDisplay = getDispositionDisplay(workflow.disposition);
 const workflowDisplay = getSubmissionWorkflowStateDisplay(
 workflow.submissionWorkflow?.state ?? "NOT_STARTED",
 );
 const transitionActions = canManageSubmissionWorkflows
 ? workflow.submissionWorkflow?.allowedTransitions ?? []
 : [];
 const primaryTransition =
 !workflow.canGenerate && !workflow.canFinalize
 ? transitionActions[0] ?? null
 : null;
 const secondaryTransitions = primaryTransition
 ? transitionActions.filter(
 (transition) => transition.nextState !== primaryTransition.nextState,
 )
 : transitionActions;
 const primaryButtonClass = "btn-primary inline-flex items-center justify-center";
 const quietButtonClass =
 "rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50";

 return (
 <div className="border border-zinc-200 p-5">
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div>
 <div className="font-semibold text-zinc-900">{workflow.label}</div>
 <div className="mt-1 text-sm text-zinc-500">
 {workflow.sourceContext.reportingYear != null
 ? `Reporting year ${workflow.sourceContext.reportingYear}`
 : workflow.sourceContext.filingYear != null
 ? `Filing year ${workflow.sourceContext.filingYear}`
 : "No governed source record"}
 </div>
 </div>
 <div className="flex flex-wrap gap-2">
 <StatusBadge label={statusDisplay.label} tone={statusDisplay.tone} />
 <StatusBadge label={dispositionDisplay.label} tone={dispositionDisplay.tone} />
 <StatusBadge label={workflowDisplay.label} tone={workflowDisplay.tone} />
 </div>
 </div>

 <div className="mt-4 grid gap-3 md:grid-cols-2 text-sm text-zinc-700">
 <div>
 <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
 Source context
 </div>
 <div className="mt-1">{workflow.sourceContext.reasonSummary}</div>
 <div className="mt-1 text-zinc-500">
 Readiness {workflow.sourceContext.readinessState.replaceAll("_", " ").toLowerCase()}
 {" · "}
 QA {workflow.sourceContext.qaVerdict ?? "not recorded"}
 </div>
 </div>
 <div>
 <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
 Latest artifact
 </div>
 <div className="mt-1">
 {workflow.latestArtifact
 ? `v${workflow.latestArtifact.version} generated ${formatDate(
 workflow.latestArtifact.generatedAt,
 )}`
 : "This package has not been generated yet."}
 </div>
 <div className="mt-1 text-zinc-500">
 {workflow.latestArtifact?.finalizedAt
 ? `Finalized ${formatDate(workflow.latestArtifact.finalizedAt)}`
 : "Not finalized"}
 </div>
 </div>
 <div>
 <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
 Submission workflow
 </div>
 <div className="mt-1">
 {workflow.submissionWorkflow
 ? workflow.submissionWorkflow.nextAction.title
 : "Submission workflow has not started for this package."}
 </div>
 <div className="mt-1 text-zinc-500">
 {workflow.submissionWorkflow?.latestTransitionAt
 ? `Last transition ${formatDate(workflow.submissionWorkflow.latestTransitionAt)}`
 : "Workflow history begins after the first governed package is generated."}
 </div>
 </div>
 <div>
 <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
 Blockers and warnings
 </div>
 <div className="mt-1">
 {workflow.blockersCount} blocker(s), {workflow.warningCount} warning(s)
 </div>
 </div>
 <div>
 <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
 Penalty context
 </div>
 <div className="mt-1">
 {workflow.sourceContext.currentEstimatedPenalty != null
 ? formatMoney(workflow.sourceContext.currentEstimatedPenalty)
 : "No governed estimate"}
 </div>
 <div className="mt-1 text-zinc-500">
 {workflow.sourceContext.penaltyEstimatedAt
 ? `Calculated ${formatDate(workflow.sourceContext.penaltyEstimatedAt)}`
 : "No governed penalty run is linked to this package context."}
 </div>
 </div>
 </div>

 <div className="mt-4 space-y-3">
 <div className="flex flex-wrap gap-3">
 {workflow.canGenerate ? (
 <button
 type="button"
 onClick={onGenerate}
 disabled={!workflow.canGenerate || isGenerating}
 className={primaryButtonClass}
 >
 {isGenerating
 ? "Generating package..."
 : workflow.latestArtifact
 ? "Refresh package"
 : "Generate package"}
 </button>
 ) : null}
 {!workflow.canGenerate && workflow.canFinalize ? (
 <button
 type="button"
 onClick={onFinalize}
 disabled={!workflow.canFinalize || isFinalizing}
 className={primaryButtonClass}
 >
 {isFinalizing ? "Finalizing package..." : "Finalize package"}
 </button>
 ) : null}
 {!workflow.canGenerate && !workflow.canFinalize && primaryTransition ? (
 <button
 type="button"
 onClick={() =>
 onWorkflowTransition(
 primaryTransition.nextState,
 transitionNotes.trim().length > 0 ? transitionNotes.trim() : null,
 )
 }
 disabled={isTransitioning}
 className={primaryButtonClass}
 >
 {primaryTransition.label}
 </button>
 ) : null}
 </div>
 <div className="flex flex-wrap gap-3">
 {workflow.canGenerate && workflow.canFinalize ? (
 <button
 type="button"
 onClick={onFinalize}
 disabled={!workflow.canFinalize || isFinalizing}
 className={quietButtonClass}
 >
 {isFinalizing ? "Finalizing package..." : "Finalize package"}
 </button>
 ) : null}
 {secondaryTransitions.map((transition) => (
 <button
 key={transition.nextState}
 type="button"
 onClick={() =>
 onWorkflowTransition(
 transition.nextState,
 transitionNotes.trim().length > 0 ? transitionNotes.trim() : null,
 )
 }
 disabled={isTransitioning}
 className={quietButtonClass}
 >
 {transition.label}
 </button>
 ))}
 {workflow.latestArtifact ? (
 <>
 <button
 type="button"
 onClick={() => onExport("PDF")}
 disabled={!workflow.latestArtifact}
 className={quietButtonClass}
 >
 Download PDF
 </button>
 <button
 type="button"
 onClick={() => onExport("JSON")}
 disabled={!workflow.latestArtifact}
 className={quietButtonClass}
 >
 Download JSON
 </button>
 </>
 ) : null}
 </div>
 </div>

 <div className="mt-3 space-y-2 text-xs text-zinc-500">
 <div>{getFinalizeGuidance(workflow)}</div>
 <div>{getWorkflowGuidance(workflow, canManageSubmissionWorkflows)}</div>
 </div>

 {canManageSubmissionWorkflows && workflow.submissionWorkflow ? (
 <div className="mt-4">
 <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
 Transition note (optional)
 </label>
 <textarea
 value={transitionNotes}
 onChange={(event) => onTransitionNotesChange(event.target.value)}
 placeholder="Add rationale for this workflow transition."
 className="mt-2 min-h-[84px] w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
 />
 <div className="mt-2 text-xs text-zinc-500">
 Notes are stored on the governed workflow transition event.
 </div>
 </div>
 ) : null}

 <div className="mt-4">
 <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
 Version history
 </div>
 {workflow.history.length === 0 ? (
 <div className="mt-2 text-sm text-zinc-500">
 No governed package versions exist yet. Generate the package to start version history.
 </div>
 ) : (
 <div className="mt-3 space-y-2">
 {workflow.history.map((version) => {
 const versionStatus = getPacketStatusDisplay(version.status);
 return (
 <div
 key={version.id}
 className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-zinc-200 pl-3 py-1 text-sm"
 >
 <div>
 <div className="font-medium text-zinc-900">
 v{version.version} · {formatDate(version.generatedAt)}
 </div>
 <div className="mt-1 text-zinc-500">
 {version.finalizedAt
 ? `Finalized ${formatDate(version.finalizedAt)}`
 : "Not finalized"}
 {version.lastExportedAt
 ? ` · Last export ${version.lastExportFormat ?? "unknown"} ${formatDate(version.lastExportedAt)}`
 : ""}
 </div>
 </div>
 <StatusBadge label={versionStatus.label} tone={versionStatus.tone} />
 </div>
 );
 })}
 </div>
 )}
 </div>

 {workflow.submissionWorkflow ? (
 <div className="mt-4">
 <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
 Workflow history
 </div>
 {workflow.submissionWorkflow.history.length === 0 ? (
 <div className="mt-2 text-sm text-zinc-500">
 No review or submission transitions are recorded yet. History begins after the first workflow move.
 </div>
 ) : (
 <div className="mt-3 space-y-2">
 {workflow.submissionWorkflow.history.map((entry) => (
 <div
 key={entry.id}
 className="border border-zinc-200 p-3 text-sm"
 >
 <div className="font-medium text-zinc-900">
 {(entry.fromState ?? "START").replaceAll("_", " ")} to{" "}
 {entry.toState.replaceAll("_", " ")}
 </div>
 <div className="mt-1 text-zinc-500">
 {formatDate(entry.createdAt)}
 {entry.notes ? ` · ${entry.notes}` : ""}
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 ) : null}
 </div>
 );
}

export function ArtifactWorkspacePanel({
 buildingId,
 canManageSubmissionWorkflows = false,
}: {
 buildingId: string;
 canManageSubmissionWorkflows?: boolean;
}) {
 const utils = trpc.useUtils();
 const [benchmarkWorkflowNotes, setBenchmarkWorkflowNotes] = useState("");
 const [bepsWorkflowNotes, setBepsWorkflowNotes] = useState("");
 const artifactWorkspace = trpc.building.getArtifactWorkspace.useQuery(
 { buildingId },
 { retry: false },
 );

 const invalidateAll = async () => {
 await Promise.all([
 utils.building.get.invalidate({ id: buildingId }),
 utils.building.list.invalidate(),
 utils.building.getArtifactWorkspace.invalidate({ buildingId }),
 utils.building.portfolioWorklist.invalidate(),
 ]);
 };

 const benchmarkGenerate = trpc.benchmarking.generateBenchmarkPacket.useMutation({
 onSuccess: invalidateAll,
 });
 const benchmarkFinalize = trpc.benchmarking.finalizeBenchmarkPacket.useMutation({
 onSuccess: invalidateAll,
 });
 const bepsGenerate = trpc.beps.generatePacket.useMutation({
 onSuccess: invalidateAll,
 });
 const bepsFinalize = trpc.beps.finalizePacket.useMutation({
 onSuccess: invalidateAll,
 });
 const transitionWorkflow = trpc.building.transitionSubmissionWorkflow.useMutation({
 onSuccess: invalidateAll,
 });

 async function exportBenchmark(format: "JSON" | "MARKDOWN" | "PDF") {
 const workflow = artifactWorkspace.data?.benchmarkVerification;
 const reportingYear = workflow?.sourceContext.reportingYear;
 if (reportingYear == null) {
 return;
 }

 const result = await utils.benchmarking.exportBenchmarkPacket.fetch({
 buildingId,
 reportingYear,
 format,
 });

 downloadFile({
 fileName: result.fileName,
 content: result.content,
 contentType: result.contentType,
 encoding: result.encoding,
 });
 await invalidateAll();
 }

 async function exportBeps(format: "JSON" | "MARKDOWN" | "PDF") {
 const workflow = artifactWorkspace.data?.bepsFiling;
 if (!workflow?.sourceRecordId || !workflow.packetType) {
 return;
 }

 const result = await utils.beps.exportPacket.fetch({
 buildingId,
 filingRecordId: workflow.sourceRecordId,
 packetType: workflow.packetType,
 format,
 });

 downloadFile({
 fileName: result.fileName,
 content: result.content,
 contentType: result.contentType,
 encoding: result.encoding,
 });
 await invalidateAll();
 }

 if (artifactWorkspace.isLoading) {
 return (
 <Panel
 title="Governed artifacts"
 subtitle="Immutable filing and submission artifacts generated from the current governed compliance context."
 >
 <div className="text-sm text-zinc-500">Preparing the governed artifact workspace...</div>
 </Panel>
 );
 }

 if (artifactWorkspace.error || !artifactWorkspace.data) {
 return (
 <ErrorState
 message="Governed artifact workspace is unavailable."
 detail={artifactWorkspace.error?.message}
 />
 );
 }

 const benchmark = artifactWorkspace.data.benchmarkVerification;
 const beps = artifactWorkspace.data.bepsFiling;

 return (
 <Panel
 title="Governed artifacts"
 subtitle="These are the immutable operational artifacts generated from the current readiness, compliance, and penalty context."
 >
 <div className="space-y-6">
 <ArtifactCard
 workflow={benchmark}
 onGenerate={() => {
 const reportingYear = benchmark.sourceContext.reportingYear;
 if (reportingYear != null) {
 benchmarkGenerate.mutate({ buildingId, reportingYear });
 }
 }}
 onFinalize={() => {
 const reportingYear = benchmark.sourceContext.reportingYear;
 if (reportingYear != null) {
 benchmarkFinalize.mutate({ buildingId, reportingYear });
 }
 }}
 onExport={exportBenchmark}
 isGenerating={benchmarkGenerate.isPending}
 isFinalizing={benchmarkFinalize.isPending}
 onWorkflowTransition={(nextState, notes) => {
 const workflowId = benchmark.submissionWorkflow?.id;
 if (workflowId) {
 transitionWorkflow.mutate({
 buildingId,
 workflowId,
 nextState,
 notes,
 });
 }
 }}
 isTransitioning={transitionWorkflow.isPending}
 canManageSubmissionWorkflows={canManageSubmissionWorkflows}
 transitionNotes={benchmarkWorkflowNotes}
 onTransitionNotesChange={setBenchmarkWorkflowNotes}
 />

 <ArtifactCard
 workflow={beps}
 onGenerate={() => {
 if (beps.sourceRecordId && beps.packetType) {
 bepsGenerate.mutate({
 buildingId,
 filingRecordId: beps.sourceRecordId,
 packetType: beps.packetType,
 });
 }
 }}
 onFinalize={() => {
 if (beps.sourceRecordId && beps.packetType) {
 bepsFinalize.mutate({
 buildingId,
 filingRecordId: beps.sourceRecordId,
 packetType: beps.packetType,
 });
 }
 }}
 onExport={exportBeps}
 isGenerating={bepsGenerate.isPending}
 isFinalizing={bepsFinalize.isPending}
 onWorkflowTransition={(nextState, notes) => {
 const workflowId = beps.submissionWorkflow?.id;
 if (workflowId) {
 transitionWorkflow.mutate({
 buildingId,
 workflowId,
 nextState,
 notes,
 });
 }
 }}
 isTransitioning={transitionWorkflow.isPending}
 canManageSubmissionWorkflows={canManageSubmissionWorkflows}
 transitionNotes={bepsWorkflowNotes}
 onTransitionNotesChange={setBepsWorkflowNotes}
 />
 </div>
 </Panel>
 );
}
