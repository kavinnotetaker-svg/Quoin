"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  MetricGrid,
  Panel,
  formatDate,
} from "@/components/internal/admin-primitives";

function defaultReportingYear() {
  return new Date().getUTCFullYear() - 1;
}

export function BenchmarkingTab({ buildingId }: { buildingId: string }) {
  const [reportingYear, setReportingYear] = useState(defaultReportingYear());
  const utils = trpc.useUtils();

  const syncStatus = trpc.benchmarking.getPortfolioManagerSyncStatus.useQuery(
    { buildingId },
    { retry: false },
  );
  const qaFindings = trpc.benchmarking.getQaFindings.useQuery(
    { buildingId },
    { retry: false },
  );
  const readiness = trpc.benchmarking.getReadiness.useQuery(
    { buildingId, reportingYear },
    { retry: false },
  );
  const submissions = trpc.benchmarking.listSubmissions.useQuery({ buildingId, limit: 10 });

  const syncMutation = trpc.benchmarking.syncPortfolioManager.useMutation({
    onSuccess: () => {
      utils.benchmarking.getPortfolioManagerSyncStatus.invalidate({ buildingId });
      utils.benchmarking.getQaFindings.invalidate({ buildingId });
      utils.benchmarking.listSubmissions.invalidate({ buildingId, limit: 10 });
      utils.benchmarking.getReadiness.invalidate({ buildingId, reportingYear });
      utils.building.get.invalidate({ id: buildingId });
      utils.building.list.invalidate();
      utils.building.complianceHistory.invalidate({ buildingId, limit: 20 });
      utils.report.getComplianceReport.invalidate({ buildingId });
    },
  });

  const evaluateMutation = trpc.benchmarking.evaluateReadiness.useMutation({
    onSuccess: () => {
      utils.benchmarking.getReadiness.invalidate({ buildingId, reportingYear });
      utils.benchmarking.listSubmissions.invalidate({ buildingId, limit: 10 });
      utils.report.getComplianceReport.invalidate({ buildingId });
    },
  });

  if (submissions.isLoading) {
    return <LoadingState />;
  }

  if (submissions.error) {
    return <ErrorState message="Benchmarking workflow is unavailable." detail={submissions.error.message} />;
  }

  const syncData = syncStatus.error ? null : syncStatus.data;
  const qaPayload =
    qaFindings.error || !qaFindings.data || typeof qaFindings.data !== "object" || Array.isArray(qaFindings.data)
      ? null
      : (qaFindings.data as Record<string, unknown>);
  const readinessPayload =
    readiness.data?.submissionPayload &&
    typeof readiness.data.submissionPayload === "object" &&
    !Array.isArray(readiness.data.submissionPayload)
      ? (readiness.data.submissionPayload as Record<string, unknown>)
      : null;
  const findings = Array.isArray(qaPayload?.findings) ? qaPayload.findings : [];

  return (
    <div className="space-y-6">
      <Panel
        title="Portfolio Manager Sync"
        subtitle="Refresh PM property, meter, consumption, and metrics data, then rerun benchmarking autopilot."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              value={reportingYear}
              onChange={(event) => setReportingYear(Number(event.target.value))}
              className="w-28 rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
            <button
              onClick={() => syncMutation.mutate({ buildingId, reportingYear })}
              disabled={syncMutation.isPending}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {syncMutation.isPending ? "Syncing..." : "Sync PM"}
            </button>
            <button
              onClick={() => evaluateMutation.mutate({ buildingId, reportingYear })}
              disabled={evaluateMutation.isPending}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {evaluateMutation.isPending ? "Evaluating..." : "Evaluate Readiness"}
            </button>
          </div>
        }
      >
        <MetricGrid
          items={[
            { label: "Sync Status", value: syncData?.status ?? "NOT_STARTED" },
            { label: "Last Attempt", value: formatDate(syncData?.lastAttemptedSyncAt) },
            { label: "Last Success", value: formatDate(syncData?.lastSuccessfulSyncAt) },
            { label: "QA Status", value: String(qaPayload?.status ?? "NOT_AVAILABLE") },
          ]}
        />
        {syncStatus.error && syncStatus.error.data?.code !== "NOT_FOUND" ? (
          <ErrorState message="Sync status failed to load." detail={syncStatus.error.message} />
        ) : null}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="QA Findings" subtitle="Deterministic PM sync QA checks for linkage, sharing, coverage, and overlap.">
          {findings.length === 0 ? (
            <EmptyState message="No QA findings are available for this building yet." />
          ) : (
            <div className="space-y-3">
              {findings.map((finding, index) => {
                const record =
                  finding && typeof finding === "object" && !Array.isArray(finding)
                    ? (finding as Record<string, unknown>)
                    : {};
                return (
                  <div key={`${String(record.code ?? "finding")}-${index}`} className="rounded border border-gray-200 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-gray-900">{String(record.code ?? "Finding")}</div>
                      <div className="text-xs text-gray-500">{String(record.status ?? "—")}</div>
                    </div>
                    <p className="mt-1 text-sm text-gray-700">{String(record.message ?? "—")}</p>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Readiness" subtitle="Canonical annual benchmarking submission state for the selected reporting year.">
          {readiness.error && readiness.error.data?.code !== "NOT_FOUND" ? (
            <ErrorState message="Readiness state failed to load." detail={readiness.error.message} />
          ) : readiness.error?.data?.code === "NOT_FOUND" || !readiness.data ? (
            <EmptyState message="No benchmark submission exists yet for the selected reporting year." />
          ) : (
            <div className="space-y-3 text-sm text-gray-700">
              <div className="rounded border border-gray-200 px-3 py-3">
                <div className="font-medium text-gray-900">Reporting year {readiness.data.reportingYear}</div>
                <div className="mt-1 text-xs text-gray-500">
                  Status {readiness.data.status} • Compliance run {readiness.data.complianceRunId ?? "—"}
                </div>
              </div>
              <details className="rounded border border-gray-200 px-3 py-3">
                <summary className="cursor-pointer text-sm font-medium text-gray-900">
                  Readiness payload
                </summary>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-gray-600">
                  {JSON.stringify(readinessPayload ?? {}, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Benchmark Submissions" subtitle="Recent governed annual benchmarking submissions for this building.">
        {!submissions.data || submissions.data.length === 0 ? (
          <EmptyState message="No benchmark submissions exist for this building yet." />
        ) : (
          <div className="space-y-3">
            {submissions.data.map((submission) => (
              <div key={submission.id} className="rounded border border-gray-200 px-3 py-3">
                <div className="font-medium text-gray-900">Reporting year {submission.reportingYear}</div>
                <div className="mt-1 text-xs text-gray-500">
                  {submission.status} • {submission.ruleVersion.rulePackage.key}
                </div>
                <div className="mt-1 text-xs text-gray-600">
                  Created {formatDate(submission.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
