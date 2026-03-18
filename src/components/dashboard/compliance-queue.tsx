"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  derivePrimaryComplianceStatus,
  extractComplianceEngineResult,
  summarizeReasonCodes,
} from "@/lib/compliance-surface";
import { PageHeader } from "@/components/layout/page-header";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/internal/admin-primitives";
import {
  StatusBadge,
  getPrimaryComplianceStatusDisplay,
  getSubmissionReadinessDisplay,
  getVerificationStatusDisplay,
} from "@/components/internal/status-helpers";

function defaultReportingYear() {
  return new Date().getUTCFullYear() - 1;
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) {
    return "Not evaluated";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not evaluated";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ComplianceQueue() {
  const [search, setSearch] = useState("");
  const reportingYear = defaultReportingYear();
  const buildingList = trpc.building.list.useQuery({
    search: search || undefined,
    page: 1,
    pageSize: 100,
  });

  const rows = useMemo(() => {
    if (!buildingList.data) {
      return [];
    }

    return buildingList.data.buildings.map((building) => {
      const latestBenchmarkSubmission = building.latestBenchmarkSubmission;
      const latestBepsFiling = building.latestBepsFiling;
      const benchmarkEngine = extractComplianceEngineResult(
        latestBenchmarkSubmission?.submissionPayload,
      );
      const bepsEngine = extractComplianceEngineResult(
        latestBepsFiling?.filingPayload,
      );
      const primaryStatus = derivePrimaryComplianceStatus({
        benchmark: benchmarkEngine,
        beps: bepsEngine,
      });
      const reasonCodes = bepsEngine?.reasonCodes.length
        ? bepsEngine.reasonCodes
        : benchmarkEngine?.reasonCodes ?? [];
      const lastEvaluationAt =
        latestBepsFiling?.complianceRun?.executedAt ??
        latestBenchmarkSubmission?.complianceRun?.executedAt ??
        null;

      return {
        id: building.id,
        name: building.name,
        qaVerdict: benchmarkEngine?.qaVerdict ?? "FAIL",
        primaryStatus,
        readinessState: building.readinessSummary.state,
        blockingIssueCount: building.activeIssueCounts.blocking,
        warningIssueCount: building.activeIssueCounts.warning,
        reasonSummary: summarizeReasonCodes(reasonCodes),
        lastEvaluationAt,
        nextActionTitle: building.readinessSummary.nextAction.title,
        nextActionReason: building.readinessSummary.nextAction.reason,
      };
    });
  }, [buildingList.data]);

  const orderedRows = [...rows].sort((left, right) => {
    const rank = {
      DATA_INCOMPLETE: 0,
      READY_FOR_REVIEW: 1,
      READY_TO_SUBMIT: 2,
      SUBMITTED: 3,
    } as const;

    const readinessDelta = rank[left.readinessState] - rank[right.readinessState];
    if (readinessDelta !== 0) {
      return readinessDelta;
    }

    const blockingDelta = right.blockingIssueCount - left.blockingIssueCount;
    if (blockingDelta !== 0) {
      return blockingDelta;
    }

    const warningDelta = right.warningIssueCount - left.warningIssueCount;
    if (warningDelta !== 0) {
      return warningDelta;
    }

    return left.name.localeCompare(right.name);
  });

  const readinessCounts = rows.reduce(
    (acc, row) => {
      acc[row.readinessState] += 1;
      return acc;
    },
    {
      DATA_INCOMPLETE: 0,
      READY_FOR_REVIEW: 0,
      READY_TO_SUBMIT: 0,
      SUBMITTED: 0,
    },
  );

  if (buildingList.isLoading) {
    return <LoadingState />;
  }

  if (buildingList.error) {
    const error = buildingList.error;
    return (
      <ErrorState
        message="Compliance queue could not load."
        detail={error?.message}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Building compliance"
        subtitle="Use this queue to see data quality, the latest governed result, and the next required action for each building."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Data incomplete", value: readinessCounts.DATA_INCOMPLETE },
          { label: "Ready for review", value: readinessCounts.READY_FOR_REVIEW },
          { label: "Ready to submit", value: readinessCounts.READY_TO_SUBMIT },
          { label: "Submitted", value: readinessCounts.SUBMITTED },
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

      <div className="flex items-center justify-between gap-4">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search buildings"
          className="w-full max-w-sm rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition-colors focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
        />
        <div className="text-sm text-slate-500">Reporting year {reportingYear}</div>
      </div>

      {orderedRows.length === 0 ? (
        <EmptyState message="No buildings match the current filter." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3 font-semibold">Building</th>
                  <th className="px-5 py-3 font-semibold">Readiness</th>
                  <th className="px-5 py-3 font-semibold">QA</th>
                  <th className="px-5 py-3 font-semibold">Compliance</th>
                  <th className="px-5 py-3 font-semibold">Issues</th>
                  <th className="px-5 py-3 font-semibold">Reason</th>
                  <th className="px-5 py-3 font-semibold">Last evaluation</th>
                  <th className="px-5 py-3 font-semibold">Next action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orderedRows.map((row) => {
                  const qa = getVerificationStatusDisplay(row.qaVerdict);
                  const readiness = getSubmissionReadinessDisplay(row.readinessState);
                  const status = getPrimaryComplianceStatusDisplay(row.primaryStatus);

                  return (
                    <tr key={row.id} className="align-top">
                      <td className="px-5 py-4">
                        <Link
                          href={`/buildings/${row.id}`}
                          className="font-semibold text-slate-900 hover:text-slate-700"
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge label={readiness.label} tone={readiness.tone} />
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge label={qa.label} tone={qa.tone} />
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge label={status.label} tone={status.tone} />
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {row.blockingIssueCount} blocking / {row.warningIssueCount} warning
                      </td>
                      <td className="px-5 py-4 text-slate-600">{row.reasonSummary}</td>
                      <td className="px-5 py-4 text-slate-600">
                        {formatDate(row.lastEvaluationAt)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-medium text-slate-900">
                          {row.nextActionTitle}
                        </div>
                        <div className="mt-1 text-[13px] text-slate-500">
                          {row.nextActionReason}
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
