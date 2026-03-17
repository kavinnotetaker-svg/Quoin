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
  formatMoney,
} from "@/components/internal/admin-primitives";

function currentReportingYear() {
  return new Date().getUTCFullYear() - 1;
}

export function ReportsPage() {
  const [buildingId, setBuildingId] = useState("");
  const [reportingYear, setReportingYear] = useState(currentReportingYear());
  const buildings = trpc.building.list.useQuery({ pageSize: 100 });
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

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" />

      <Panel
        title="Report Scope"
        subtitle="Choose a building to inspect the generated compliance and exemption report data."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-700">
            <span className="mb-1 block text-xs text-slate-500">Building</span>
            <select
              value={buildingId}
              onChange={(event) => setBuildingId(event.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2"
            >
              <option value="">Select a building</option>
              {buildings.data?.buildings.map((building) => (
                <option key={building.id} value={building.id}>
                  {building.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-700">
            <span className="mb-1 block text-xs text-slate-500">Reporting year</span>
            <input
              type="number"
              value={reportingYear}
              onChange={(event) => setReportingYear(Number(event.target.value))}
              className="w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
        </div>
      </Panel>

      {!buildingId ? (
        <EmptyState message="Select a building to load report surfaces." />
      ) : (
        <>
          {complianceReport.isLoading || exemptionReport.isLoading ? <LoadingState /> : null}
          {complianceReport.error ? (
            <ErrorState message="Compliance report failed to load." detail={complianceReport.error.message} />
          ) : null}
          {exemptionReport.error ? (
            <ErrorState message="Exemption report failed to load." detail={exemptionReport.error.message} />
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
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Download JSON
                </button>
              }
            >
              <MetricGrid
                items={[
                  { label: "Compliance Status", value: complianceReport.data.complianceData.complianceStatus },
                  { label: "ENERGY STAR Score", value: complianceReport.data.complianceData.energyStarScore ?? "—" },
                  { label: "Site EUI", value: complianceReport.data.complianceData.siteEui ?? "—" },
                  {
                    label: "Estimated Penalty",
                    value: formatMoney(complianceReport.data.complianceData.estimatedPenalty),
                    tone: "danger",
                  },
                ]}
              />
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <div>
                  <h4 className="text-sm font-medium text-slate-900">Energy History</h4>
                  <div className="mt-2 space-y-2 text-sm text-slate-700">
                    {complianceReport.data.energyHistory.slice(0, 8).map((reading) => (
                      <div
                        key={`${reading.periodStart}-${reading.periodEnd}-${reading.meterType}-${reading.source}`}
                        className="rounded border border-slate-200 px-3 py-2"
                      >
                        <div className="font-medium">{reading.meterType}</div>
                        <div className="text-xs text-slate-500">
                          {new Date(reading.periodStart).toLocaleDateString()} - {new Date(reading.periodEnd).toLocaleDateString()}
                        </div>
                        <div className="mt-1 text-xs text-slate-600">
                          {reading.consumptionKbtu.toLocaleString()} kBtu • {reading.source}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-slate-900">Recent Pipeline Runs</h4>
                  <div className="mt-2 space-y-2 text-sm text-slate-700">
                    {complianceReport.data.pipelineRuns.length === 0 ? (
                      <EmptyState message="No pipeline runs were included in the report payload." />
                    ) : (
                      complianceReport.data.pipelineRuns.map((run) => (
                        <div key={run.id} className="rounded border border-slate-200 px-3 py-2">
                          <div className="font-medium">{run.pipelineType}</div>
                          <div className="text-xs text-slate-500">{run.status}</div>
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
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Download JSON
                </button>
              }
            >
              <MetricGrid
                items={[
                  { label: "Eligible", value: exemptionReport.data.exemptionScreening.eligible ? "Yes" : "No" },
                  { label: "Qualified Exemptions", value: exemptionReport.data.exemptionScreening.qualifiedExemptions.length || 0 },
                  {
                    label: "Penalty Savings If Exempt",
                    value: formatMoney(exemptionReport.data.penaltyContext.penaltySavingsIfExempt),
                    tone: "success",
                  },
                  { label: "DOEE Deadline", value: exemptionReport.data.doeeSubmissionGuidance.deadline },
                ]}
              />
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <div>
                  <h4 className="text-sm font-medium text-slate-900">Checklist</h4>
                  <div className="mt-2 space-y-2">
                    {exemptionReport.data.filingChecklist.map((item) => (
                      <div key={item.item} className="rounded border border-slate-200 px-3 py-2 text-sm">
                        <div className="font-medium text-slate-900">{item.item}</div>
                        <div className="text-xs text-slate-500">{item.status}</div>
                        <div className="mt-1 text-xs text-slate-600">{item.notes}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-slate-900">Benchmark Submissions</h4>
                  <div className="mt-2 space-y-2">
                    {submissions.data && submissions.data.length > 0 ? (
                      submissions.data
                        .filter((submission) => submission.reportingYear === reportingYear)
                        .map((submission) => (
                          <div key={submission.id} className="rounded border border-slate-200 px-3 py-2 text-sm">
                            <div className="font-medium text-slate-900">Reporting year {submission.reportingYear}</div>
                            <div className="text-xs text-slate-500">{submission.status}</div>
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
