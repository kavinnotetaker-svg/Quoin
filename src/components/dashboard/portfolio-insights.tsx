"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  MetricGrid,
  Panel,
  formatMoney,
} from "@/components/internal/admin-primitives";

interface BuildingRef {
  id: string;
  name: string;
}

function urgencyClasses(level: string) {
  if (level === "CRITICAL") return "bg-red-100 text-red-800";
  if (level === "HIGH") return "bg-orange-100 text-orange-800";
  if (level === "MEDIUM") return "bg-amber-100 text-amber-800";
  return "bg-gray-100 text-gray-700";
}

export function PortfolioInsights({
  buildings,
}: {
  buildings: BuildingRef[];
}) {
  const buildingNameById = new Map(buildings.map((building) => [building.id, building.name]));
  const risk = trpc.portfolioRisk.list.useQuery({ limit: 25 });
  const actions = trpc.portfolioRisk.priorityActions.useQuery({ limit: 8 });
  const readiness = trpc.benchmarking.listPortfolioReadiness.useQuery({ limit: 8 });
  const anomalies = trpc.operations.listPortfolioAnomalies.useQuery({ limit: 8 });
  const retrofit = trpc.retrofit.rankPortfolio.useQuery({ limit: 8 });

  if (
    risk.isLoading ||
    actions.isLoading ||
    readiness.isLoading ||
    anomalies.isLoading ||
    retrofit.isLoading
  ) {
    return <LoadingState />;
  }

  if (risk.error || actions.error || readiness.error || anomalies.error || retrofit.error) {
    const error =
      risk.error ?? actions.error ?? readiness.error ?? anomalies.error ?? retrofit.error;
    return (
      <ErrorState
        message="Portfolio insights are unavailable right now."
        detail={error?.message}
      />
    );
  }

  const aggregate = risk.data?.aggregate;

  return (
    <div className="space-y-6">
      {aggregate ? (
        <MetricGrid
          items={[
            { label: "Buildings Ready", value: aggregate.totals.buildingsReady, tone: "success" },
            { label: "Buildings Blocked", value: aggregate.totals.buildingsBlocked, tone: "danger" },
            { label: "High Risk Buildings", value: aggregate.totals.buildingsAtHighRisk, tone: "warning" },
            {
              label: "Estimated Exposure",
              value: formatMoney(aggregate.totals.totalEstimatedExposure),
              tone: "danger",
            },
          ]}
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Priority Actions"
          subtitle="Deterministic portfolio risk actions derived from governed records."
        >
          {!actions.data || actions.data.length === 0 ? (
            <EmptyState message="No portfolio actions need immediate attention." />
          ) : (
            <div className="space-y-3">
              {actions.data.map((item) => (
                <div key={`${item.buildingId}-${item.reasonCode}`} className="rounded-md border border-gray-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <Link href={`/buildings/${item.buildingId}`} className="font-medium text-gray-900 hover:underline">
                      {buildingNameById.get(item.buildingId) ?? item.buildingId}
                    </Link>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${urgencyClasses(item.urgencyLevel)}`}>
                      {item.urgencyLevel}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-700">{item.message}</p>
                  <p className="mt-1 text-xs text-gray-500">{item.recommendedNextAction}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Benchmarking Readiness"
          subtitle="Portfolio Manager sync and benchmarking autopilot status by building."
        >
          {!readiness.data || readiness.data.length === 0 ? (
            <EmptyState message="No benchmarking readiness records are available yet." />
          ) : (
            <div className="space-y-3">
              {readiness.data.map((entry) => {
                const readinessStatus =
                  entry.readiness &&
                  typeof entry.readiness === "object" &&
                  !Array.isArray(entry.readiness)
                    ? String(
                        (entry.readiness as Record<string, unknown>).status ??
                          entry.syncState?.status ??
                          "PENDING",
                      )
                    : String(entry.syncState?.status ?? "PENDING");

                return (
                  <div key={entry.building.id} className="rounded-md border border-gray-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <Link href={`/buildings/${entry.building.id}`} className="font-medium text-gray-900 hover:underline">
                        {entry.building.name}
                      </Link>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${readinessStatus === "READY" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                        {readinessStatus}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Reporting year {entry.reportingYear} • PM sync {entry.syncState?.status ?? "NOT_STARTED"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel
          title="Operational Anomalies"
          subtitle="Deterministic operations anomalies affecting compliance and energy use."
        >
          {!anomalies.data || anomalies.data.length === 0 ? (
            <EmptyState message="No active operational anomalies were found." />
          ) : (
            <div className="space-y-3">
              {anomalies.data.map((anomaly) => (
                <div key={anomaly.id} className="rounded-md border border-gray-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <Link href={`/buildings/${anomaly.buildingId}`} className="font-medium text-gray-900 hover:underline">
                      {buildingNameById.get(anomaly.buildingId) ?? anomaly.buildingId}
                    </Link>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${urgencyClasses(anomaly.severity)}`}>
                      {anomaly.severity}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-700">{anomaly.title}</p>
                  <p className="mt-1 text-xs text-gray-500">{anomaly.anomalyType}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Retrofit Priorities"
          subtitle="Ranked retrofit candidates using avoided penalty, savings, timing, and confidence."
        >
          {!retrofit.data || retrofit.data.length === 0 ? (
            <EmptyState message="No retrofit candidates have been ranked yet." />
          ) : (
            <div className="space-y-3">
              {retrofit.data.map((candidate) => (
                <div key={candidate.candidateId} className="rounded-md border border-gray-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <Link href={`/buildings/${candidate.buildingId}`} className="font-medium text-gray-900 hover:underline">
                      {candidate.name}
                    </Link>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${urgencyClasses(candidate.priorityBand)}`}>
                      {candidate.priorityBand}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {buildingNameById.get(candidate.buildingId) ?? candidate.buildingId}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-600">
                    <span>Priority {candidate.priorityScore}</span>
                    <span>Avoided penalty {formatMoney(candidate.estimatedAvoidedPenalty)}</span>
                    <span>Net cost {formatMoney(candidate.netProjectCost)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
