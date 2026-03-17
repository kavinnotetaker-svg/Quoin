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
  if (level === "CRITICAL") return "bg-red-50 text-red-700 ring-1 ring-red-600/20";
  if (level === "HIGH") return "bg-orange-50 text-orange-700 ring-1 ring-orange-600/20";
  if (level === "MEDIUM") return "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20";
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-500/20";
}

export function PortfolioInsights({
  buildings,
}: {
  buildings: BuildingRef[];
}) {
  const buildingNameById = new Map(buildings.map((building) => [building.id, building.name]));
  const workflow = trpc.building.portfolioWorkflow.useQuery({ limit: 25 });
  const risk = trpc.portfolioRisk.list.useQuery({ limit: 25 });
  const actions = trpc.portfolioRisk.priorityActions.useQuery({ limit: 8 });
  const anomalies = trpc.operations.listPortfolioAnomalies.useQuery({ limit: 8 });
  const retrofit = trpc.retrofit.rankPortfolio.useQuery({ limit: 8 });

  if (
    workflow.isLoading ||
    risk.isLoading ||
    actions.isLoading ||
    anomalies.isLoading ||
    retrofit.isLoading
  ) {
    return <LoadingState />;
  }

  if (workflow.error || risk.error || actions.error || anomalies.error || retrofit.error) {
    const error =
      workflow.error ??
      risk.error ??
      actions.error ??
      anomalies.error ??
      retrofit.error;
    return (
      <ErrorState
        message="Portfolio insights are unavailable right now."
        detail={error?.message}
      />
    );
  }

  const aggregate = risk.data?.aggregate;
  const workflowAggregate = workflow.data?.aggregate;

  return (
    <div className="space-y-6">
      {aggregate ? (
        <MetricGrid
          items={[
            { label: "Buildings ready to work", value: aggregate.totals.buildingsReady, tone: "success" },
            { label: "Buildings blocked", value: aggregate.totals.buildingsBlocked, tone: "danger" },
            { label: "High-risk buildings", value: aggregate.totals.buildingsAtHighRisk, tone: "warning" },
            {
              label: "Estimated exposure",
              value: formatMoney(aggregate.totals.totalEstimatedExposure),
              tone: "danger",
            },
          ]}
        />
      ) : null}

      {workflowAggregate ? (
        <MetricGrid
          items={[
            {
              label: "Benchmarking blocked",
              value: workflowAggregate.benchmarkingBlocked,
              tone: workflowAggregate.benchmarkingBlocked > 0 ? "danger" : "default",
            },
            {
              label: "BEPS needs review",
              value: workflowAggregate.needsBepsEvaluation,
              tone: workflowAggregate.needsBepsEvaluation > 0 ? "warning" : "default",
            },
            {
              label: "Filing follow-up",
              value: workflowAggregate.filingAttention,
              tone: workflowAggregate.filingAttention > 0 ? "warning" : "default",
            },
            {
              label: "Operational review",
              value: workflowAggregate.operationalAttention,
              tone: workflowAggregate.operationalAttention > 0 ? "warning" : "default",
            },
            {
              label: "Retrofit planned",
              value: workflowAggregate.retrofitReady,
              tone: workflowAggregate.retrofitReady > 0 ? "success" : "default",
            },
            {
              label: "Financing ready",
              value: workflowAggregate.financingReady,
              tone: workflowAggregate.financingReady > 0 ? "success" : "default",
            },
          ]}
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Priority Actions"
          subtitle="Plain-language workflow actions derived from governed records and current building state."
        >
          {!actions.data || actions.data.length === 0 ? (
            <EmptyState message="No portfolio actions need immediate attention." />
          ) : (
            <div className="space-y-3">
              {actions.data.map((item) => (
                <div key={`${item.buildingId}-${item.reasonCode}`} className="card-machined p-4 transition-all hover:shadow-md hover:border-slate-300">
                  <div className="flex items-center justify-between gap-3">
                    <Link href={`/buildings/${item.buildingId}`} className="font-semibold text-slate-900 hover:text-amber-600 transition-colors">
                      {buildingNameById.get(item.buildingId) ?? item.buildingId}
                    </Link>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-mono font-medium tracking-tight uppercase ${urgencyClasses(item.urgencyLevel)}`}>
                      {item.urgencyLevel}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700 font-medium">{item.message}</p>
                  <p className="mt-1.5 text-xs text-slate-500">{item.recommendedNextAction}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Workflow Backlog"
          subtitle="Buildings blocked in the current workflow, with the next concrete step called out."
        >
          {!workflow.data || workflow.data.items.length === 0 ? (
            <EmptyState message="No workflow summaries are available yet." />
          ) : (
            <div className="space-y-3">
              {workflow.data.items
                .filter((entry) =>
                  entry.stages.some((stage) => stage.status === "BLOCKED" || stage.status === "NEEDS_ATTENTION"),
                )
                .slice(0, 8)
                .map((entry) => {
                  const blockedStage = entry.stages.find(
                    (stage) => stage.status === "BLOCKED" || stage.status === "NEEDS_ATTENTION",
                  );

                return (
                  <div key={entry.buildingId} className="card-machined p-4 transition-all hover:shadow-md hover:border-slate-300">
                    <div className="flex items-center justify-between gap-3">
                      <Link href={`/buildings/${entry.buildingId}`} className="font-semibold text-slate-900 hover:text-amber-600 transition-colors">
                        {entry.buildingName}
                      </Link>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${blockedStage?.status === "BLOCKED" ? "bg-red-50 text-red-700 ring-1 ring-red-600/20" : "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20"}`}>
                        {blockedStage?.status?.replace("_", " ") ?? "NEEDS ATTENTION"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-700 font-medium">{blockedStage?.label ?? entry.nextAction.title}</p>
                    <p className="mt-1 text-[13px] text-slate-500">{entry.nextAction.reason}</p>
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
                <div key={anomaly.id} className="card-machined p-4 transition-all hover:shadow-md hover:border-slate-300">
                  <div className="flex items-center justify-between gap-3">
                    <Link href={`/buildings/${anomaly.buildingId}`} className="font-semibold text-slate-900 hover:text-amber-600 transition-colors">
                      {buildingNameById.get(anomaly.buildingId) ?? anomaly.buildingId}
                    </Link>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${urgencyClasses(anomaly.severity)}`}>
                      {anomaly.severity}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700 font-medium">{anomaly.title}</p>
                  <p className="mt-1 text-[13px] text-slate-500">{anomaly.anomalyType}</p>
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
                <div key={candidate.candidateId} className="card-machined p-4 transition-all hover:shadow-md hover:border-slate-300">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link href={`/buildings/${candidate.buildingId}`} className="font-semibold text-slate-900 hover:text-amber-600 transition-colors line-clamp-1">
                        {candidate.name}
                      </Link>
                      <p className="mt-1 max-w-[200px] truncate text-xs text-slate-500">
                        {buildingNameById.get(candidate.buildingId) ?? candidate.buildingId}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-mono font-medium tracking-tight uppercase ${urgencyClasses(candidate.priorityBand)}`}>
                      {candidate.priorityBand}
                    </span>
                  </div>
                  
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
                    <div className="flex flex-col">
                      <span className="text-slate-500 font-medium mb-0.5">Priority</span>
                      <span className="text-slate-900 font-mono font-semibold">{candidate.priorityScore}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-slate-500 font-medium mb-0.5">Avoided penalty</span>
                      <span className="text-emerald-700 font-mono font-semibold">{formatMoney(candidate.estimatedAvoidedPenalty)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-slate-500 font-medium mb-0.5">Net cost</span>
                      <span className="text-slate-900 font-mono font-semibold">{formatMoney(candidate.netProjectCost)}</span>
                    </div>
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
