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
  const workflow = trpc.building.portfolioWorkflow.useQuery({ limit: 200 });

  const rows = useMemo(() => {
    if (!buildingList.data || !workflow.data) {
      return [];
    }

    const workflowByBuildingId = new Map(
      workflow.data.items.map((item) => [item.buildingId, item]),
    );

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
      const workflowSummary = workflowByBuildingId.get(building.id) ?? null;
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
        reasonSummary: summarizeReasonCodes(reasonCodes),
        lastEvaluationAt,
        nextActionTitle: workflowSummary?.nextAction.title ?? "Refresh compliance data",
        nextActionReason:
          workflowSummary?.nextAction.reason ??
          "Run or refresh the governed compliance evaluation for this building.",
      };
    });
  }, [buildingList.data, workflow.data]);

  const statusCounts = rows.reduce(
    (acc, row) => {
      acc[row.primaryStatus] += 1;
      return acc;
    },
    {
      DATA_INCOMPLETE: 0,
      READY: 0,
      COMPLIANT: 0,
      NON_COMPLIANT: 0,
    },
  );

  if (buildingList.isLoading || workflow.isLoading) {
    return <LoadingState />;
  }

  if (buildingList.error || workflow.error) {
    const error = buildingList.error ?? workflow.error;
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
          { label: "Data incomplete", value: statusCounts.DATA_INCOMPLETE },
          { label: "Ready to evaluate", value: statusCounts.READY },
          { label: "Compliant", value: statusCounts.COMPLIANT },
          { label: "Needs improvement", value: statusCounts.NON_COMPLIANT },
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

      {rows.length === 0 ? (
        <EmptyState message="No buildings match the current filter." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3 font-semibold">Building</th>
                  <th className="px-5 py-3 font-semibold">QA</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Reason</th>
                  <th className="px-5 py-3 font-semibold">Last evaluation</th>
                  <th className="px-5 py-3 font-semibold">Next action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const qa = getVerificationStatusDisplay(row.qaVerdict);
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
                        <StatusBadge label={qa.label} tone={qa.tone} />
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge label={status.label} tone={status.tone} />
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
