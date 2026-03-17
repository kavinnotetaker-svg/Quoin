"use client";

import React from "react";
import Link from "next/link";
import { Panel } from "@/components/internal/admin-primitives";
import {
  StatusBadge,
  getWorkflowStageStatusDisplay,
} from "@/components/internal/status-helpers";

type WorkflowStageStatus =
  | "COMPLETE"
  | "NEEDS_ATTENTION"
  | "BLOCKED"
  | "NOT_STARTED";

interface WorkflowPanelProps {
  nextAction: {
    title: string;
    reason: string;
    href: string;
  };
  stages: Array<{
    key: string;
    label: string;
    status: WorkflowStageStatus;
    reason: string;
    href: string;
  }>;
}

export function WorkflowPanel({ nextAction, stages }: WorkflowPanelProps) {
  return (
    <Panel
      title="Building Workflow"
      subtitle="Start with the next best action, then use the stage list to see what is complete, blocked, or still waiting to start."
    >
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 shadow-sm">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Next best action
        </div>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-lg font-semibold tracking-tight text-slate-900">
              {nextAction.title}
            </div>
            <p className="mt-1 text-sm text-slate-600">{nextAction.reason}</p>
          </div>
          <Link
            href={nextAction.href}
            className="inline-flex shrink-0 items-center rounded-md border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            Open step
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {stages.map((stage, index) => (
          <WorkflowStageCard key={stage.key} index={index} stage={stage} />
        ))}
      </div>
    </Panel>
  );
}

function WorkflowStageCard({
  index,
  stage,
}: {
  index: number;
  stage: WorkflowPanelProps["stages"][number];
}) {
  const status = getWorkflowStageStatusDisplay(stage.status);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Step {index + 1}
          </div>
          <div className="mt-1 text-[15px] font-semibold tracking-tight text-slate-900">
            {stage.label}
          </div>
        </div>
        <StatusBadge label={status.label} tone={status.tone} />
      </div>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">{stage.reason}</p>
      <div className="mt-4">
        <Link
          href={stage.href}
          className="text-[13px] font-medium text-slate-700 underline decoration-slate-300 underline-offset-4 transition-colors hover:text-slate-900"
        >
          Go to {stage.label.toLowerCase()}
        </Link>
      </div>
    </div>
  );
}
