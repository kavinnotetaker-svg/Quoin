"use client";

import React from "react";
import { formatDate } from "@/components/internal/admin-primitives";
import {
  getPacketStatusDisplay,
  getSubmissionReadinessDisplay,
  getSubmissionWorkflowStateDisplay,
} from "@/components/internal/status-helpers";
import { WorkflowPanel } from "./workflow-panel";
import { BenchmarkingTab } from "./benchmarking-tab";
import { VerificationRequestsTab } from "./verification-requests-tab";
import { ArtifactWorkspacePanel } from "./artifact-workspace-panel";

type BenchmarkWorkbenchProps = {
  buildingId: string;
  canManageSubmissionWorkflows: boolean;
  onUpload: () => void;
  readinessSummary: {
    state: string;
    blockingIssueCount: number;
    warningIssueCount: number;
    nextAction: {
      title: string;
      reason: string;
    };
    lastReadinessEvaluatedAt: string | null;
  };
  governedSummary: {
    artifactSummary: {
      benchmark: {
        latestArtifactStatus: "NOT_STARTED" | "DRAFT" | "GENERATED" | "STALE" | "FINALIZED";
        lastGeneratedAt: string | null;
        lastFinalizedAt: string | null;
      };
    };
    submissionSummary: {
      benchmark: {
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
      } | null;
    };
    runtimeSummary: {
      needsAttention: boolean;
    };
  };
};

function deriveStageStatus(input: {
  blocked: boolean;
  started: boolean;
  complete: boolean;
  needsAttention: boolean;
}) {
  if (input.blocked) {
    return "BLOCKED" as const;
  }
  if (input.complete) {
    return "COMPLETE" as const;
  }
  if (input.needsAttention || input.started) {
    return "NEEDS_ATTENTION" as const;
  }
  return "NOT_STARTED" as const;
}

export function BenchmarkWorkbenchTab({
  buildingId,
  canManageSubmissionWorkflows,
  onUpload,
  readinessSummary,
  governedSummary,
}: BenchmarkWorkbenchProps) {
  const benchmarkArtifact = governedSummary.artifactSummary.benchmark;
  const benchmarkWorkflow = governedSummary.submissionSummary.benchmark;
  const readinessDisplay = getSubmissionReadinessDisplay(readinessSummary.state);
  const packetDisplay = getPacketStatusDisplay(benchmarkArtifact.latestArtifactStatus);
  const workflowDisplay = getSubmissionWorkflowStateDisplay(
    benchmarkWorkflow?.state ?? "NOT_STARTED",
  );

  const stages = [
    {
      key: "source-preparation",
      label: "Prepare source data",
      status: deriveStageStatus({
        blocked: readinessSummary.blockingIssueCount > 0,
        started: readinessSummary.lastReadinessEvaluatedAt != null,
        complete: readinessSummary.state !== "DATA_INCOMPLETE",
        needsAttention: governedSummary.runtimeSummary.needsAttention,
      }),
      reason:
        readinessSummary.blockingIssueCount > 0
          ? `${readinessSummary.blockingIssueCount} governed issue(s) still block benchmark readiness.`
          : readinessSummary.lastReadinessEvaluatedAt
            ? "Source state has been evaluated and is ready for packet assembly."
            : "Connect or upload source data, then run benchmark readiness for the reporting year.",
      href: "#workflow-readiness",
    },
    {
      key: "verification-packet",
      label: "Assemble verification packet",
      status: deriveStageStatus({
        blocked:
          benchmarkArtifact.latestArtifactStatus === "NOT_STARTED" &&
          readinessSummary.state === "DATA_INCOMPLETE",
        started: benchmarkArtifact.lastGeneratedAt != null,
        complete: benchmarkArtifact.latestArtifactStatus === "FINALIZED",
        needsAttention:
          benchmarkArtifact.latestArtifactStatus === "GENERATED" ||
          benchmarkArtifact.latestArtifactStatus === "STALE",
      }),
      reason:
        benchmarkArtifact.latestArtifactStatus === "FINALIZED"
          ? "The latest governed benchmark packet is finalized and ready for review."
          : benchmarkArtifact.lastGeneratedAt
            ? "The packet exists but still needs refresh or finalization before review."
            : "Request items, supporting evidence, and packet blockers are managed here.",
      href: "#workflow-verification",
    },
    {
      key: "review-submission",
      label: "Review and submit",
      status: deriveStageStatus({
        blocked: benchmarkWorkflow?.state === "NEEDS_CORRECTION",
        started: benchmarkWorkflow != null && benchmarkWorkflow.state !== "NOT_STARTED",
        complete: benchmarkWorkflow?.state === "COMPLETED",
        needsAttention:
          benchmarkWorkflow?.state === "READY_FOR_REVIEW" ||
          benchmarkWorkflow?.state === "APPROVED_FOR_SUBMISSION" ||
          benchmarkWorkflow?.state === "SUBMITTED",
      }),
      reason:
        benchmarkWorkflow?.state === "COMPLETED"
          ? "The current benchmark submission workflow is complete."
          : benchmarkWorkflow?.state === "NEEDS_CORRECTION"
            ? "The current review cycle needs correction before submission can continue."
            : benchmarkWorkflow?.latestTransitionAt
              ? "Use the governed packet below to record review and submission transitions."
              : "Review and submission workflow begins after the first governed packet is generated.",
      href: "#workflow-submission",
    },
  ];

  return (
    <div className="space-y-12">
      <section className="space-y-6 border-b border-zinc-200 pb-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
              Primary workflow
            </div>
            <h2 className="font-display text-4xl tracking-tight text-zinc-900">
              Benchmark readiness, packet review, and submission
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-zinc-600">
              This workbench keeps source preparation, verifier support, packet control, and
              submission workflow in one governed path.
            </p>
          </div>
          <button
            type="button"
            onClick={onUpload}
            className="inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
          >
            Upload source data
          </button>
        </div>

        <div className="grid gap-4 border-t border-zinc-200 pt-5 md:grid-cols-2 xl:grid-cols-4">
          <WorkbenchSummary
            label="Current readiness"
            value={readinessDisplay.label}
            supporting={
              readinessSummary.lastReadinessEvaluatedAt
                ? `Evaluated ${formatDate(readinessSummary.lastReadinessEvaluatedAt)}`
                : "Readiness has not been evaluated yet."
            }
          />
          <WorkbenchSummary
            label="Packet status"
            value={packetDisplay.label}
            supporting={
              benchmarkArtifact.lastFinalizedAt
                ? `Finalized ${formatDate(benchmarkArtifact.lastFinalizedAt)}`
                : benchmarkArtifact.lastGeneratedAt
                  ? `Generated ${formatDate(benchmarkArtifact.lastGeneratedAt)}`
                  : "No benchmark packet generated yet."
            }
          />
          <WorkbenchSummary
            label="Submission state"
            value={workflowDisplay.label}
            supporting={
              benchmarkWorkflow?.latestTransitionAt
                ? `Last moved ${formatDate(benchmarkWorkflow.latestTransitionAt)}`
                : "Submission workflow starts after the first governed packet."
            }
          />
          <WorkbenchSummary
            label="Current next step"
            value={readinessSummary.nextAction.title}
            supporting={readinessSummary.nextAction.reason}
          />
        </div>
      </section>

      <WorkflowPanel
        nextAction={{
          ...readinessSummary.nextAction,
          href: "#workflow-readiness",
        }}
        stages={stages}
      />

      <section id="workflow-readiness" className="scroll-mt-24">
        <BenchmarkingTab buildingId={buildingId} />
      </section>

      <section id="workflow-verification" className="scroll-mt-24">
        <VerificationRequestsTab buildingId={buildingId} showPacketActions={false} />
      </section>

      <section id="workflow-submission" className="scroll-mt-24">
        <ArtifactWorkspacePanel
          buildingId={buildingId}
          canManageSubmissionWorkflows={canManageSubmissionWorkflows}
          scopes={["benchmark"]}
          title="Packet review and submission"
          subtitle="Use the current governed benchmark packet as the single review and submission record."
        />
      </section>
    </div>
  );
}

function WorkbenchSummary({
  label,
  value,
  supporting,
}: {
  label: string;
  value: string;
  supporting: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </div>
      <div className="text-base font-semibold tracking-tight text-zinc-900">{value}</div>
      <div className="text-sm leading-relaxed text-zinc-600">{supporting}</div>
    </div>
  );
}
