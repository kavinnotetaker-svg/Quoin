"use client";

import React from "react";
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

function getWorkflowStateDisplay(state: string) {
  switch (state) {
    case "DRAFT":
      return { label: "Draft workflow", tone: "muted" as const };
    case "READY_FOR_REVIEW":
      return { label: "Ready for review", tone: "info" as const };
    case "APPROVED_FOR_SUBMISSION":
      return { label: "Approved for submission", tone: "success" as const };
    case "SUBMITTED":
      return { label: "Submitted", tone: "warning" as const };
    case "COMPLETED":
      return { label: "Completed", tone: "success" as const };
    case "NEEDS_CORRECTION":
      return { label: "Needs correction", tone: "danger" as const };
    case "SUPERSEDED":
      return { label: "Superseded", tone: "muted" as const };
    default:
      return { label: "No workflow", tone: "muted" as const };
  }
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
  ) => void;
  isTransitioning: boolean;
}) {
  const statusDisplay = getPacketStatusDisplay(workflow.status);
  const dispositionDisplay = getDispositionDisplay(workflow.disposition);
  const workflowDisplay = getWorkflowStateDisplay(
    workflow.submissionWorkflow?.state ?? "NOT_STARTED",
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-900">{workflow.label}</div>
          <div className="mt-1 text-sm text-slate-500">
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

      <div className="mt-4 grid gap-3 md:grid-cols-2 text-sm text-slate-700">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Source context
          </div>
          <div className="mt-1">{workflow.sourceContext.reasonSummary}</div>
          <div className="mt-1 text-slate-500">
            Readiness {workflow.sourceContext.readinessState.replaceAll("_", " ").toLowerCase()}
            {" · "}
            QA {workflow.sourceContext.qaVerdict ?? "not recorded"}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Latest artifact
          </div>
          <div className="mt-1">
            {workflow.latestArtifact
              ? `v${workflow.latestArtifact.version} generated ${formatDate(
                  workflow.latestArtifact.generatedAt,
                )}`
              : "No artifact has been generated yet."}
          </div>
          <div className="mt-1 text-slate-500">
            {workflow.latestArtifact?.finalizedAt
              ? `Finalized ${formatDate(workflow.latestArtifact.finalizedAt)}`
              : "Not finalized"}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Submission workflow
          </div>
          <div className="mt-1">
            {workflow.submissionWorkflow
              ? workflow.submissionWorkflow.nextAction.title
              : "No submission workflow has started."}
          </div>
          <div className="mt-1 text-slate-500">
            {workflow.submissionWorkflow?.latestTransitionAt
              ? `Last transition ${formatDate(workflow.submissionWorkflow.latestTransitionAt)}`
              : "Workflow starts after artifact generation."}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Blockers and warnings
          </div>
          <div className="mt-1">
            {workflow.blockersCount} blocker(s), {workflow.warningCount} warning(s)
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Penalty context
          </div>
          <div className="mt-1">
            {workflow.sourceContext.currentEstimatedPenalty != null
              ? formatMoney(workflow.sourceContext.currentEstimatedPenalty)
              : "No current estimate"}
          </div>
          <div className="mt-1 text-slate-500">
            {workflow.sourceContext.penaltyEstimatedAt
              ? `Calculated ${formatDate(workflow.sourceContext.penaltyEstimatedAt)}`
              : "No governed penalty run linked"}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onGenerate}
          disabled={!workflow.canGenerate || isGenerating}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {isGenerating
            ? "Generating..."
            : workflow.latestArtifact
              ? "Regenerate artifact"
              : "Generate artifact"}
        </button>
        <button
          type="button"
          onClick={onFinalize}
          disabled={!workflow.canFinalize || isFinalizing}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {isFinalizing ? "Finalizing..." : "Finalize artifact"}
        </button>
        <button
          type="button"
          onClick={() => onExport("PDF")}
          disabled={!workflow.latestArtifact}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          Export PDF
        </button>
        <button
          type="button"
          onClick={() => onExport("JSON")}
          disabled={!workflow.latestArtifact}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          Export JSON
        </button>
        {workflow.submissionWorkflow?.allowedTransitions.map((transition) => (
          <button
            key={transition.nextState}
            type="button"
            onClick={() => onWorkflowTransition(transition.nextState)}
            disabled={isTransitioning}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {transition.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Version history
        </div>
        {workflow.history.length === 0 ? (
          <div className="mt-2 text-sm text-slate-500">
            No governed artifact versions exist yet.
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {workflow.history.map((version) => {
              const versionStatus = getPacketStatusDisplay(version.status);
              return (
                <div
                  key={version.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"
                >
                  <div>
                    <div className="font-medium text-slate-900">
                      v{version.version} · {formatDate(version.generatedAt)}
                    </div>
                    <div className="mt-1 text-slate-500">
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
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Workflow history
          </div>
          {workflow.submissionWorkflow.history.length === 0 ? (
            <div className="mt-2 text-sm text-slate-500">
              No workflow transitions have been recorded yet.
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {workflow.submissionWorkflow.history.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border border-slate-200 bg-white p-3 text-sm"
                >
                  <div className="font-medium text-slate-900">
                    {(entry.fromState ?? "START").replaceAll("_", " ")} to{" "}
                    {entry.toState.replaceAll("_", " ")}
                  </div>
                  <div className="mt-1 text-slate-500">
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

export function ArtifactWorkspacePanel({ buildingId }: { buildingId: string }) {
  const utils = trpc.useUtils();
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
        <div className="text-sm text-slate-500">Loading artifact workspace...</div>
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
          onWorkflowTransition={(nextState) => {
            const workflowId = benchmark.submissionWorkflow?.id;
            if (workflowId) {
              transitionWorkflow.mutate({
                buildingId,
                workflowId,
                nextState,
              });
            }
          }}
          isTransitioning={transitionWorkflow.isPending}
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
          onWorkflowTransition={(nextState) => {
            const workflowId = beps.submissionWorkflow?.id;
            if (workflowId) {
              transitionWorkflow.mutate({
                buildingId,
                workflowId,
                nextState,
              });
            }
          }}
          isTransitioning={transitionWorkflow.isPending}
        />
      </div>
    </Panel>
  );
}
