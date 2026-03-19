"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/layout/page-header";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  MetricGrid,
  Panel,
  downloadTextFile,
  formatDate,
  formatMoney,
} from "@/components/internal/admin-primitives";

function currentReportingYear() {
  return new Date().getUTCFullYear() - 1;
}

export function ReportsPage() {
  const utils = trpc.useUtils();
  const [buildingId, setBuildingId] = useState("");
  const [reportingYear, setReportingYear] = useState(currentReportingYear());
  const buildings = trpc.building.list.useQuery({ pageSize: 100 });
  const publicationOverview = trpc.report.publicationOverview.useQuery();
  const promoteRuleCandidate = trpc.report.promoteRuleCandidate.useMutation({
    onSuccess: async () => {
      await utils.report.publicationOverview.invalidate();
    },
  });
  const promoteFactorCandidate = trpc.report.promoteFactorCandidate.useMutation({
    onSuccess: async () => {
      await utils.report.publicationOverview.invalidate();
    },
  });
  const validateRuleCandidate = trpc.report.validateRuleCandidate.useMutation({
    onSuccess: async () => {
      await utils.report.publicationOverview.invalidate();
    },
  });
  const validateFactorCandidate = trpc.report.validateFactorCandidate.useMutation({
    onSuccess: async () => {
      await utils.report.publicationOverview.invalidate();
    },
  });
  const publishGovernedCandidate = trpc.report.publishGovernedCandidate.useMutation({
    onSuccess: async () => {
      await utils.report.publicationOverview.invalidate();
    },
  });
  const complianceReport = trpc.report.getComplianceReport.useQuery(
    { buildingId },
    { enabled: !!buildingId },
  );
  const exemptionReport = trpc.report.getExemptionReport.useQuery(
    { buildingId },
    { enabled: !!buildingId },
  );
  const submissions = trpc.benchmarking.listSubmissions.useQuery(
    { buildingId: buildingId || undefined, limit: 10 },
    { enabled: !!buildingId },
  );

  useEffect(() => {
    if (!buildingId && buildings.data?.buildings[0]?.id) {
      setBuildingId(buildings.data.buildings[0].id);
    }
  }, [buildingId, buildings.data]);

  if (buildings.isLoading) {
    return <LoadingState />;
  }

  if (buildings.error) {
    return (
      <ErrorState
        message="Reports are unavailable right now."
        detail={buildings.error.message}
      />
    );
  }

  const selectedBuilding = buildings.data?.buildings.find((building) => building.id === buildingId);
  const canManagePublication =
    publicationOverview.data?.operatorAccess.canManage ?? false;

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" />

      <Panel
        title="Report Scope"
        subtitle="Choose a building to inspect the generated compliance and exemption report data."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-zinc-700">
            <span className="mb-1 block text-xs text-zinc-500">Building</span>
            <select
              value={buildingId}
              onChange={(event) => setBuildingId(event.target.value)}
              className="w-full rounded border border-zinc-300 px-3 py-2"
            >
              <option value="">Select a building</option>
              {buildings.data?.buildings.map((building) => (
                <option key={building.id} value={building.id}>
                  {building.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-zinc-700">
            <span className="mb-1 block text-xs text-zinc-500">Reporting year</span>
            <input
              type="number"
              value={reportingYear}
              onChange={(event) => setReportingYear(Number(event.target.value))}
              className="w-full rounded border border-zinc-300 px-3 py-2"
            />
          </label>
        </div>
      </Panel>

      <Panel
        title="Governed publication"
        subtitle="Inspect live vs candidate governed versions and run deterministic publication checks before activation."
      >
        {publicationOverview.isLoading ? <LoadingState /> : null}
        {publicationOverview.error ? (
          <ErrorState
            message="Governed publication state is unavailable."
            detail={publicationOverview.error.message}
          />
        ) : null}
        {publicationOverview.data ? (
          <div className="space-y-3">
            {publicationOverview.data.targets.map((target) => (
              <div
                key={`${target.publicationKind}-${target.targetKey}`}
                className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-700"
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-1">
                    <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      {target.scopeKey.replaceAll("_", " ")}
                    </div>
                    <div className="font-medium text-zinc-900">{target.label}</div>
                    <div className="text-xs text-zinc-500">{target.targetKey}</div>
                    <div className="mt-2 grid gap-2 md:grid-cols-3">
                      <div>
                        <div className="text-xs uppercase tracking-wider text-zinc-500">
                          Active
                        </div>
                        <div className="mt-1 font-medium text-zinc-900">
                          {target.activeVersion
                            ? `${target.activeVersion.version} (${target.activeVersion.status.toLowerCase()})`
                            : "Not configured"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wider text-zinc-500">
                          Candidate
                        </div>
                        <div className="mt-1 font-medium text-zinc-900">
                          {target.candidateVersion
                            ? `${target.candidateVersion.version} (${target.candidateVersion.status.toLowerCase()})`
                            : "None"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wider text-zinc-500">
                          Latest draft
                        </div>
                        <div className="mt-1 font-medium text-zinc-900">
                          {target.latestDraftVersion
                            ? `${target.latestDraftVersion.version} (${target.latestDraftVersion.status.toLowerCase()})`
                            : "None"}
                        </div>
                      </div>
                    </div>
                    {target.latestValidation ? (
                      <div className="mt-3 rounded border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
                        <div className="font-medium text-zinc-900">
                          Latest validation: {target.latestValidation.status.toLowerCase()}
                        </div>
                        <div className="mt-1">
                          {target.latestValidation.passedCases} passed /{" "}
                          {target.latestValidation.failedCases} failed /{" "}
                          {target.latestValidation.totalCases} total
                        </div>
                        <div className="mt-1">
                          Validated {formatDate(target.latestValidation.validatedAt)}
                          {" | "}Published {formatDate(target.latestValidation.publishedAt)}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canManagePublication &&
                    target.publicationKind === "RULE_VERSION" &&
                    target.latestDraftVersion ? (
                      <button
                        onClick={() =>
                          promoteRuleCandidate.mutate({
                            ruleVersionId: target.latestDraftVersion!.id,
                          })
                        }
                        disabled={promoteRuleCandidate.isPending}
                        className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                      >
                        Promote draft
                      </button>
                    ) : null}
                    {canManagePublication &&
                    target.publicationKind === "FACTOR_SET_VERSION" &&
                    target.latestDraftVersion ? (
                      <button
                        onClick={() =>
                          promoteFactorCandidate.mutate({
                            factorSetVersionId: target.latestDraftVersion!.id,
                          })
                        }
                        disabled={promoteFactorCandidate.isPending}
                        className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                      >
                        Promote draft
                      </button>
                    ) : null}
                    {canManagePublication &&
                    target.publicationKind === "RULE_VERSION" &&
                    target.candidateVersion ? (
                      <button
                        onClick={() =>
                          validateRuleCandidate.mutate({
                            ruleVersionId: target.candidateVersion!.id,
                          })
                        }
                        disabled={validateRuleCandidate.isPending}
                        className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                      >
                        Run regressions
                      </button>
                    ) : null}
                    {canManagePublication &&
                    target.publicationKind === "FACTOR_SET_VERSION" &&
                    target.candidateVersion ? (
                      <button
                        onClick={() =>
                          validateFactorCandidate.mutate({
                            factorSetVersionId: target.candidateVersion!.id,
                          })
                        }
                        disabled={validateFactorCandidate.isPending}
                        className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                      >
                        Run regressions
                      </button>
                    ) : null}
                    {canManagePublication && target.latestValidation?.canPublish ? (
                      <button
                        onClick={() =>
                          publishGovernedCandidate.mutate({
                            runId: target.latestValidation!.id,
                          })
                        }
                        disabled={publishGovernedCandidate.isPending}
                        className="rounded border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800 disabled:opacity-60"
                      >
                        Publish active version
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
            {!canManagePublication ? (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                Governed publication controls require manager or admin access. Current publication and validation state remains visible here.
              </div>
            ) : null}
          </div>
        ) : null}
      </Panel>

      {!buildingId ? (
        <EmptyState message="Select a building to load report surfaces." />
      ) : (
        <>
          {complianceReport.isLoading || exemptionReport.isLoading ? <LoadingState /> : null}
          {complianceReport.error ? (
            <ErrorState
              message="Compliance report failed to load."
              detail={complianceReport.error.message}
            />
          ) : null}
          {exemptionReport.error ? (
            <ErrorState
              message="Exemption report failed to load."
              detail={exemptionReport.error.message}
            />
          ) : null}

          {selectedBuilding && complianceReport.data ? (
            <Panel
              title="Compliance Report"
              subtitle="Current generated report payload from the report router."
              actions={
                <button
                  onClick={() =>
                    downloadTextFile({
                      fileName: `${selectedBuilding.name.replace(/\s+/g, "-").toLowerCase()}-compliance-report.json`,
                      content: JSON.stringify(complianceReport.data, null, 2),
                      contentType: "application/json",
                    })
                  }
                  className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  Download JSON
                </button>
              }
            >
              <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
                <div className="font-medium text-zinc-900">Latest governed operational summary</div>
                <div className="mt-1 text-zinc-600">
                  Readiness{" "}
                  {complianceReport.data.governedOperationalSummary.readinessSummary.state
                    .toLowerCase()
                    .replaceAll("_", " ")}
                  {" | "}Compliance{" "}
                  {complianceReport.data.governedOperationalSummary.complianceSummary.primaryStatus
                    .toLowerCase()
                    .replaceAll("_", " ")}
                </div>
                <div className="mt-1 text-zinc-500">
                  Last readiness evaluation{" "}
                  {formatDate(
                    complianceReport.data.governedOperationalSummary.timestamps
                      .lastReadinessEvaluatedAt,
                  )}
                  {" | "}Last compliance evaluation{" "}
                  {formatDate(
                    complianceReport.data.governedOperationalSummary.timestamps
                      .lastComplianceEvaluatedAt,
                  )}
                </div>
              </div>

              <MetricGrid
                items={[
                  {
                    label: "Compliance Status",
                    value:
                      complianceReport.data.governedOperationalSummary.complianceSummary
                        .primaryStatus,
                  },
                  {
                    label: "ENERGY STAR Score",
                    value: complianceReport.data.complianceData.energyStarScore ?? "-",
                  },
                  {
                    label: "Site EUI",
                    value: complianceReport.data.complianceData.siteEui ?? "-",
                  },
                  {
                    label: "Current Penalty Estimate",
                    value: formatMoney(
                      complianceReport.data.governedOperationalSummary.penaltySummary
                        ?.currentEstimatedPenalty,
                    ),
                    tone:
                      complianceReport.data.governedOperationalSummary.penaltySummary
                        ?.status === "ESTIMATED"
                        ? "danger"
                        : "default",
                  },
                ]}
              />

              {complianceReport.data.governedOperationalSummary.penaltySummary ? (
                <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
                  <div className="font-medium text-zinc-900">
                    {
                      complianceReport.data.governedOperationalSummary.penaltySummary.basis
                        .label
                    }
                  </div>
                  <div className="mt-1 text-zinc-600">
                    {
                      complianceReport.data.governedOperationalSummary.penaltySummary.basis
                        .explanation
                    }
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">
                    Calculated{" "}
                    {formatDate(
                      complianceReport.data.governedOperationalSummary.penaltySummary
                        .calculatedAt,
                    )}
                    {" | "}Last compliance evaluation{" "}
                    {formatDate(
                      complianceReport.data.governedOperationalSummary.timestamps
                        .lastComplianceEvaluatedAt,
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
                  No governed penalty run is available for this building yet.
                </div>
              )}

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
                  <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Artifact status
                  </div>
                  <div className="mt-2">
                    Benchmark:{" "}
                    {complianceReport.data.governedOperationalSummary.artifactSummary.benchmark.latestArtifactStatus
                      .toLowerCase()
                      .replaceAll("_", " ")}
                  </div>
                  <div className="mt-1">
                    BEPS:{" "}
                    {complianceReport.data.governedOperationalSummary.artifactSummary.beps.latestArtifactStatus
                      .toLowerCase()
                      .replaceAll("_", " ")}
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
                  <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Submission workflow
                  </div>
                  <div className="mt-2">
                    Benchmark:{" "}
                    {(complianceReport.data.governedOperationalSummary.submissionSummary.benchmark
                      ?.state ?? "NOT_STARTED")
                      .toLowerCase()
                      .replaceAll("_", " ")}
                  </div>
                  <div className="mt-1">
                    BEPS:{" "}
                    {(complianceReport.data.governedOperationalSummary.submissionSummary.beps
                      ?.state ?? "NOT_STARTED")
                      .toLowerCase()
                      .replaceAll("_", " ")}
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
                  <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Next action
                  </div>
                  <div className="mt-2 font-medium text-zinc-900">
                    {complianceReport.data.governedOperationalSummary.readinessSummary.nextAction.title}
                  </div>
                  <div className="mt-1 text-zinc-600">
                    {complianceReport.data.governedOperationalSummary.readinessSummary.nextAction.reason}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <div>
                  <h4 className="text-sm font-medium text-zinc-900">Energy History</h4>
                  <div className="mt-2 space-y-2 text-sm text-zinc-700">
                    {complianceReport.data.energyHistory.slice(0, 8).map((reading) => (
                      <div
                        key={`${reading.periodStart}-${reading.periodEnd}-${reading.meterType}-${reading.source}`}
                        className="rounded border border-zinc-200 px-3 py-2"
                      >
                        <div className="font-medium">{reading.meterType}</div>
                        <div className="text-xs text-zinc-500">
                          {new Date(reading.periodStart).toLocaleDateString()} -{" "}
                          {new Date(reading.periodEnd).toLocaleDateString()}
                        </div>
                        <div className="mt-1 text-xs text-zinc-600">
                          {reading.consumptionKbtu.toLocaleString()} kBtu | {reading.source}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-zinc-900">Recent Pipeline Runs</h4>
                  <div className="mt-2 space-y-2 text-sm text-zinc-700">
                    {complianceReport.data.pipelineRuns.length === 0 ? (
                      <EmptyState message="No pipeline runs were included in the report payload." />
                    ) : (
                      complianceReport.data.pipelineRuns.map((run) => (
                        <div key={run.id} className="rounded border border-zinc-200 px-3 py-2">
                          <div className="font-medium">{run.pipelineType}</div>
                          <div className="text-xs text-zinc-500">{run.status}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </Panel>
          ) : null}

          {selectedBuilding && exemptionReport.data ? (
            <Panel
              title="Exemption Report"
              subtitle="Current exemption filing package payload generated from the deterministic screener."
              actions={
                <button
                  onClick={() =>
                    downloadTextFile({
                      fileName: `${selectedBuilding.name.replace(/\s+/g, "-").toLowerCase()}-exemption-report.json`,
                      content: JSON.stringify(exemptionReport.data, null, 2),
                      contentType: "application/json",
                    })
                  }
                  className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  Download JSON
                </button>
              }
            >
              <MetricGrid
                items={[
                  {
                    label: "Eligible",
                    value: exemptionReport.data.exemptionScreening.eligible ? "Yes" : "No",
                  },
                  {
                    label: "Qualified Exemptions",
                    value:
                      exemptionReport.data.exemptionScreening.qualifiedExemptions.length || 0,
                  },
                  {
                    label: "Penalty Savings If Exempt",
                    value: formatMoney(exemptionReport.data.penaltyContext.penaltySavingsIfExempt),
                    tone: "success",
                  },
                  {
                    label: "Current Penalty Estimate",
                    value: formatMoney(exemptionReport.data.penaltyContext.currentEstimatedPenalty),
                  },
                ]}
              />
              <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
                <div className="font-medium text-zinc-900">
                  {exemptionReport.data.penaltyContext.currentEstimateBasis}
                </div>
                <div className="mt-1 text-zinc-600">
                  Current estimate status:{" "}
                  {exemptionReport.data.penaltyContext.currentEstimateStatus
                    .toLowerCase()
                    .replaceAll("_", " ")}
                  .
                </div>
                <div className="mt-1 text-zinc-500">
                  Legacy statutory ceiling:{" "}
                  {formatMoney(exemptionReport.data.penaltyContext.legacyStatutoryMaximum)}
                </div>
                <div className="mt-1 text-zinc-500">
                  DOEE deadline: {exemptionReport.data.doeeSubmissionGuidance.deadline}
                </div>
              </div>
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <div>
                  <h4 className="text-sm font-medium text-zinc-900">Checklist</h4>
                  <div className="mt-2 space-y-2">
                    {exemptionReport.data.filingChecklist.map((item) => (
                      <div
                        key={item.item}
                        className="rounded border border-zinc-200 px-3 py-2 text-sm"
                      >
                        <div className="font-medium text-zinc-900">{item.item}</div>
                        <div className="text-xs text-zinc-500">{item.status}</div>
                        <div className="mt-1 text-xs text-zinc-600">{item.notes}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-zinc-900">Benchmark Submissions</h4>
                  <div className="mt-2 space-y-2">
                    {submissions.data && submissions.data.length > 0 ? (
                      submissions.data
                        .filter((submission) => submission.reportingYear === reportingYear)
                        .map((submission) => (
                          <div
                            key={submission.id}
                            className="rounded border border-zinc-200 px-3 py-2 text-sm"
                          >
                            <div className="font-medium text-zinc-900">
                              Reporting year {submission.reportingYear}
                            </div>
                            <div className="text-xs text-zinc-500">{submission.status}</div>
                          </div>
                        ))
                    ) : (
                      <EmptyState message="No benchmark submissions are available for this building yet." />
                    )}
                  </div>
                </div>
              </div>
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
