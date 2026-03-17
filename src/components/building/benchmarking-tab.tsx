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
import {
  StatusBadge,
  getReadinessStatusDisplay,
  getSyncStatusDisplay,
  getVerificationStatusDisplay,
} from "@/components/internal/status-helpers";

function defaultReportingYear() {
  return new Date().getUTCFullYear() - 1;
}

function formatSyncStatus(status: string | null | undefined) {
  return getSyncStatusDisplay(status).label;
}

function formatStepLabel(step: unknown) {
  return typeof step === "string" && step.trim()
    ? step.replaceAll("_", " ").toLowerCase()
    : "Not available";
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
  const submissions = trpc.benchmarking.listSubmissions.useQuery({
    buildingId,
    limit: 10,
  });
  const verificationChecklist = trpc.benchmarking.getVerificationChecklist.useQuery(
    { buildingId, reportingYear },
    { retry: false },
  );

  const syncMutation = trpc.benchmarking.syncPortfolioManager.useMutation({
    onSuccess: () => {
      utils.benchmarking.getPortfolioManagerSyncStatus.invalidate({ buildingId });
      utils.benchmarking.getQaFindings.invalidate({ buildingId });
      utils.benchmarking.listSubmissions.invalidate({ buildingId, limit: 10 });
      utils.benchmarking.getReadiness.invalidate({ buildingId, reportingYear });
      utils.benchmarking.getVerificationChecklist.invalidate({
        buildingId,
        reportingYear,
      });
      utils.building.get.invalidate({ id: buildingId });
      utils.building.list.invalidate();
      utils.building.portfolioWorkflow.invalidate({ limit: 25 });
      utils.building.complianceHistory.invalidate({ buildingId, limit: 20 });
      utils.report.getComplianceReport.invalidate({ buildingId });
    },
  });

  const pushMutation =
    trpc.benchmarking.pushLocalEnergyToPortfolioManager.useMutation({
      onSuccess: () => {
        utils.benchmarking.getPortfolioManagerSyncStatus.invalidate({
          buildingId,
        });
        utils.benchmarking.getQaFindings.invalidate({ buildingId });
        utils.benchmarking.listSubmissions.invalidate({
          buildingId,
          limit: 10,
        });
        utils.benchmarking.getReadiness.invalidate({ buildingId, reportingYear });
        utils.benchmarking.getVerificationChecklist.invalidate({
          buildingId,
          reportingYear,
        });
        utils.building.get.invalidate({ id: buildingId });
        utils.building.list.invalidate();
        utils.building.portfolioWorkflow.invalidate({ limit: 25 });
        utils.building.energyReadings.invalidate({ buildingId, months: 24 });
        utils.building.complianceHistory.invalidate({ buildingId, limit: 20 });
        utils.report.getComplianceReport.invalidate({ buildingId });
      },
    });

  const evaluateMutation = trpc.benchmarking.evaluateReadiness.useMutation({
    onSuccess: () => {
      utils.benchmarking.getReadiness.invalidate({ buildingId, reportingYear });
      utils.benchmarking.listSubmissions.invalidate({ buildingId, limit: 10 });
      utils.benchmarking.getVerificationChecklist.invalidate({
        buildingId,
        reportingYear,
      });
      utils.report.getComplianceReport.invalidate({ buildingId });
    },
  });

  if (submissions.isLoading) {
    return <LoadingState />;
  }

  if (submissions.error) {
    return (
      <ErrorState
        message="Benchmarking workflow is unavailable."
        detail={submissions.error.message}
      />
    );
  }

  const syncData = syncStatus.error ? null : syncStatus.data;
  const qaPayload =
    qaFindings.error ||
    !qaFindings.data ||
    typeof qaFindings.data !== "object" ||
    Array.isArray(qaFindings.data)
      ? null
      : (qaFindings.data as Record<string, unknown>);
  const readinessPayload =
    readiness.data?.submissionPayload &&
    typeof readiness.data.submissionPayload === "object" &&
    !Array.isArray(readiness.data.submissionPayload)
      ? (readiness.data.submissionPayload as Record<string, unknown>)
      : null;
  const findings = Array.isArray(qaPayload?.findings) ? qaPayload.findings : [];
  const syncDiagnostics = syncData?.diagnostics ?? null;
  const syncWarnings = Array.isArray(syncDiagnostics?.warnings)
    ? syncDiagnostics.warnings.map((warning) => String(warning))
    : [];
  const verificationItems = verificationChecklist.data?.items ?? [];
  const verificationSummary = verificationChecklist.data?.summary ?? null;

  const btnClass =
    "rounded-md border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50";
  const qualityStatus = getReadinessStatusDisplay(
    String(qaPayload?.status ?? "NOT_AVAILABLE"),
  );

  return (
    <div className="space-y-6">
      <Panel
        title="Benchmarking readiness"
        subtitle="Confirm the data connection, review blockers, and refresh the governed readiness result for the selected reporting year."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="number"
              value={reportingYear}
              onChange={(event) => setReportingYear(Number(event.target.value))}
              className="w-28 rounded-md border border-slate-300 bg-white px-3 py-2 text-[13px] font-medium text-slate-900 shadow-sm transition-colors focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
            <button
              onClick={() => syncMutation.mutate({ buildingId, reportingYear })}
              disabled={syncMutation.isPending}
              className={btnClass}
            >
              {syncMutation.isPending ? "Syncing..." : "Refresh PM Data"}
            </button>
            <button
              onClick={() => pushMutation.mutate({ buildingId, reportingYear })}
              disabled={pushMutation.isPending}
              className={btnClass}
            >
              {pushMutation.isPending ? "Pushing..." : "Push Local Data"}
            </button>
            <button
              onClick={() => evaluateMutation.mutate({ buildingId, reportingYear })}
              disabled={evaluateMutation.isPending}
              className={btnClass}
            >
              {evaluateMutation.isPending
                ? "Rechecking..."
                : "Recheck Benchmarking"}
            </button>
          </div>
        }
      >
        <MetricGrid
          items={[
            {
              label: "Portfolio Manager sync",
              value: formatSyncStatus(syncData?.status),
            },
            {
              label: "Last sync attempt",
              value: formatDate(syncData?.lastAttemptedSyncAt),
            },
            {
              label: "Last successful sync",
              value: formatDate(syncData?.lastSuccessfulSyncAt),
            },
            {
              label: "Failed phase",
              value: formatStepLabel(syncDiagnostics?.failedStep),
            },
            {
              label: "Quality checks",
              value: qualityStatus.label,
            },
          ]}
        />

        {syncStatus.error && syncStatus.error.data?.code !== "NOT_FOUND" ? (
          <ErrorState
            message="Sync status failed to load."
            detail={syncStatus.error.message}
          />
        ) : null}

        {syncDiagnostics?.message ? (
          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-4 text-sm text-slate-700 shadow-sm">
            <div className="font-semibold tracking-tight text-slate-900">
              Latest sync message
            </div>
            <div className="mt-2 text-[13px] leading-relaxed text-slate-600">
              {String(syncDiagnostics.message)}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-500">
              <span>Phase: {formatStepLabel(syncDiagnostics.failedStep)}</span>
              <span>
                Retryable: {syncDiagnostics.retryable === true ? "Yes" : "No"}
              </span>
              <span>
                Imported: {String(syncDiagnostics.readingsCreated ?? 0)} new /{" "}
                {String(syncDiagnostics.readingsUpdated ?? 0)} updated /{" "}
                {String(syncDiagnostics.readingsSkipped ?? 0)} skipped
              </span>
            </div>
            {syncWarnings.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-[13px] text-amber-700">
                {syncWarnings.slice(0, 4).map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {pushMutation.error ? (
          <ErrorState
            message="Local Portfolio Manager push failed."
            detail={pushMutation.error.message}
          />
        ) : null}

        {pushMutation.data ? (
          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-4 text-sm text-slate-700 shadow-sm">
            <div className="font-semibold tracking-tight text-slate-900">
              Latest push summary
            </div>
            <div className="mt-2 text-[13px] leading-relaxed text-slate-600">
              Pushed{" "}
              <strong className="font-semibold text-slate-900">
                {pushMutation.data.totals.readingsPushed}
              </strong>{" "}
              of {pushMutation.data.totals.readingsPrepared} local electric/gas
              readings to property{" "}
              <span className="rounded border border-slate-200 bg-slate-100 px-1 py-0.5 font-mono text-xs">
                {pushMutation.data.propertyId}
              </span>
              .
            </div>
            <div className="mt-1 text-[13px] leading-relaxed text-slate-600">
              Created{" "}
              <strong className="font-semibold text-slate-900">
                {pushMutation.data.metersCreated}
              </strong>{" "}
              new PM meter(s); updated{" "}
              <strong className="font-semibold text-slate-900">
                {pushMutation.data.totals.readingsUpdated}
              </strong>{" "}
              existing PM reading(s); skipped{" "}
              {pushMutation.data.totals.readingsSkippedExisting} row(s) already
              matching PM.
            </div>
            <div className="mt-1 text-[13px] leading-relaxed text-slate-600">
              PM refresh result:{" "}
              <strong className="font-semibold text-slate-900">
                {formatSyncStatus(pushMutation.data.syncState.status)}
              </strong>
            </div>
            {pushMutation.data.warnings.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-[13px] text-amber-700">
                {pushMutation.data.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="What is blocking submission"
          subtitle="Deterministic checks for PM linkage, sharing, required evidence, coverage, and overlapping bills."
        >
          {findings.length === 0 ? (
            <EmptyState message="No blocking checks have been generated for this building yet." />
          ) : (
            <div className="space-y-4">
              {findings.map((finding, index) => {
                const record =
                  finding &&
                  typeof finding === "object" &&
                  !Array.isArray(finding)
                    ? (finding as Record<string, unknown>)
                    : {};

                return (
                  <div
                    key={`${String(record.code ?? "finding")}-${index}`}
                    className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 font-semibold tracking-tight text-slate-900">
                        {String(record.code ?? "Finding")}
                      </div>
                      <StatusBadge
                        label={String(record.status ?? "Not available")}
                        tone={
                          String(record.status) === "BLOCKED"
                            ? "danger"
                            : "warning"
                        }
                      />
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                      {String(record.message ?? "No detail available.")}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel
          title="Current submission state"
          subtitle="Current governed benchmarking position for the selected reporting year."
        >
          {readiness.error && readiness.error.data?.code !== "NOT_FOUND" ? (
            <ErrorState
              message="Readiness state failed to load."
              detail={readiness.error.message}
            />
          ) : readiness.error?.data?.code === "NOT_FOUND" || !readiness.data ? (
            <EmptyState message="No benchmark submission exists yet for the selected reporting year." />
          ) : (
            <div className="space-y-4 text-sm text-slate-700">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-lg font-semibold tracking-tight text-slate-900">
                  Reporting Year {readiness.data.reportingYear}
                </div>
                <div className="mt-2">
                  <StatusBadge
                    label={getReadinessStatusDisplay(readiness.data.status).label}
                    tone={getReadinessStatusDisplay(readiness.data.status).tone}
                  />
                </div>
                <p className="mt-3 text-[13px] text-slate-600">
                  {readiness.data.status === "READY"
                    ? "The current record supports annual benchmarking submission."
                    : "The building still has blocking issues or missing requirements before submission."}
                </p>
                {readiness.data.complianceRunId ? (
                  <div className="mt-3 text-[13px] font-medium text-slate-500">
                    Compliance run ID:{" "}
                    <span className="ml-1 font-mono text-xs text-slate-900">
                      {readiness.data.complianceRunId}
                    </span>
                  </div>
                ) : null}
              </div>
              <details className="group rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 shadow-sm transition-all outline-none">
                <summary className="cursor-pointer font-semibold tracking-tight text-slate-900 outline-none">
                  Technical workflow record
                </summary>
                <div className="mt-3 max-h-48 overflow-y-auto rounded-md border border-slate-100 bg-white p-3">
                  <pre className="font-mono text-xs text-slate-600">
                    {JSON.stringify(readinessPayload ?? {}, null, 2)}
                  </pre>
                </div>
              </details>
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="Verification checklist"
        subtitle="Deterministic verification checks derived from building records, Portfolio Manager linkage, annual coverage, metrics, and linked evidence."
      >
        {verificationChecklist.error &&
        verificationChecklist.error.data?.code !== "NOT_FOUND" ? (
          <ErrorState
            message="Verification checklist failed to load."
            detail={verificationChecklist.error.message}
          />
        ) : verificationItems.length === 0 ? (
          <EmptyState message="No verification results have been computed for this reporting year yet. Refresh benchmarking to generate them." />
        ) : (
          <div className="space-y-4">
            {verificationSummary ? (
              <MetricGrid
                items={[
                  {
                    label: "Passed",
                    value: String(verificationSummary.passedCount),
                  },
                  {
                    label: "Failed",
                    value: String(verificationSummary.failedCount),
                  },
                  {
                    label: "Needs review",
                    value: String(verificationSummary.needsReviewCount),
                  },
                ]}
              />
            ) : null}

            <div className="space-y-4">
              {verificationItems.map((item) => {
                const statusDisplay = getVerificationStatusDisplay(item.status);

                return (
                  <div
                    key={item.key}
                    className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-[15px] font-semibold tracking-tight text-slate-900">
                          {item.category
                            .toLowerCase()
                            .split("_")
                            .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
                            .join(" ")}
                        </div>
                        <div className="text-[12px] uppercase tracking-wide text-slate-400">
                          {item.key}
                        </div>
                      </div>
                      <StatusBadge
                        label={statusDisplay.label}
                        tone={statusDisplay.tone}
                      />
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-slate-600">
                      {item.explanation}
                    </p>
                    <div className="mt-3 text-[12px] text-slate-500">
                      {item.evidenceLinks.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {item.evidenceLinks.map((link) => (
                            <span
                              key={link.id}
                              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1"
                            >
                              {link.artifactKind === "EVIDENCE" ? "Evidence" : "Source"}:{" "}
                              {link.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span>No linked evidence artifacts for this check.</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Panel>

      <Panel
        title="Recent benchmark submissions"
        subtitle="Recent governed annual benchmarking records for this building."
      >
        {!submissions.data || submissions.data.length === 0 ? (
          <EmptyState message="No benchmark submissions exist for this building yet." />
        ) : (
          <div className="space-y-4">
            {submissions.data.map((submission) => (
              <div
                key={submission.id}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[15px] font-semibold text-slate-900">
                    Reporting Year {submission.reportingYear}
                  </div>
                  <StatusBadge
                    label={getReadinessStatusDisplay(submission.status).label}
                    tone={getReadinessStatusDisplay(submission.status).tone}
                  />
                </div>
                <div className="mt-3 text-[13px] font-medium text-slate-600">
                  Rule package:{" "}
                  <span className="rounded border border-slate-100 bg-slate-50 px-1 py-0.5 font-mono text-xs text-slate-500">
                    {submission.ruleVersion.rulePackage.key}
                  </span>
                </div>
                <div className="mt-2 text-[13px] font-medium text-slate-500">
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
