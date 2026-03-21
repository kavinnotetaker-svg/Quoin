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
import {
  getWorklistTriageDisplay,
  humanizeToken,
} from "@/components/internal/status-helpers";

interface BuildingRef {
  id: string;
  name: string;
}

function urgencyClasses(level: string) {
  if (level === "NOW") return "bg-red-50 text-red-700 ring-1 ring-red-600/20";
  if (level === "NEXT") return "bg-orange-50 text-orange-700 ring-1 ring-orange-600/20";
  if (level === "CRITICAL") return "bg-red-50 text-red-700 ring-1 ring-red-600/20";
  if (level === "HIGH") return "bg-orange-50 text-orange-700 ring-1 ring-orange-600/20";
  if (level === "MEDIUM") return "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20";
  return "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-500/20";
}

export function PortfolioInsights({
  buildings,
}: {
  buildings: BuildingRef[];
}) {
  const buildingNameById = new Map(buildings.map((building) => [building.id, building.name]));
  const worklist = trpc.building.portfolioWorklist.useQuery({});
  const anomalies = trpc.operations.listPortfolioAnomalies.useQuery({ limit: 8 });
  const retrofit = trpc.retrofit.rankPortfolio.useQuery({ limit: 8 });

  if (worklist.isLoading || anomalies.isLoading || retrofit.isLoading) {
    return <LoadingState />;
  }

  if (worklist.error || anomalies.error || retrofit.error) {
    const error = worklist.error ?? anomalies.error ?? retrofit.error;
    return (
      <ErrorState
        message="Portfolio insights are unavailable right now."
        detail={error?.message}
      />
    );
  }

  const aggregate = worklist.data?.aggregate;
  const priorityItems = worklist.data?.items.slice(0, 8) ?? [];
  const backlogItems = worklist.data?.items
    .filter((item) => item.triage.bucket !== "MONITORING")
    .slice(0, 8) ?? [];

  return (
    <div className="space-y-6">
      {aggregate ? (
        <MetricGrid
          items={[
            {
              label: "Needs attention now",
              value: aggregate.needsAttentionNow,
              tone: aggregate.needsAttentionNow > 0 ? "danger" : "default",
            },
            {
              label: "Compliance blockers",
              value: aggregate.blocked,
              tone: aggregate.blocked > 0 ? "danger" : "default",
            },
            {
              label: "Submission queue",
              value: aggregate.submissionQueue,
              tone: aggregate.submissionQueue > 0 ? "warning" : "default",
            },
            {
              label: "Penalty exposure",
              value: aggregate.withPenaltyExposure,
              tone: aggregate.withPenaltyExposure > 0 ? "warning" : "default",
            },
          ]}
        />
      ) : null}

      {aggregate ? (
        <MetricGrid
          items={[
            {
              label: "Review queue",
              value: aggregate.reviewQueue,
              tone: aggregate.reviewQueue > 0 ? "warning" : "default",
            },
            {
              label: "Sync attention",
              value: aggregate.syncQueue,
              tone: aggregate.syncQueue > 0 ? "warning" : "default",
            },
            {
              label: "Operational risk",
              value: aggregate.anomalyQueue,
              tone: aggregate.anomalyQueue > 0 ? "warning" : "default",
            },
            {
              label: "Retrofit queue",
              value: aggregate.retrofitQueue,
              tone: aggregate.retrofitQueue > 0 ? "warning" : "default",
            },
          ]}
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Priority Actions"
          subtitle="Governed next actions pulled directly from the current portfolio worklist."
        >
          {priorityItems.length === 0 ? (
            <EmptyState message="No portfolio actions need immediate attention." />
          ) : (
            <div className="space-y-3">
              {priorityItems.map((item) => {
                const triageDisplay = getWorklistTriageDisplay(item.triage.bucket);

                return (
                  <div
                    key={`${item.buildingId}-${item.nextAction.code}`}
                    className="card-machined p-4 transition-all hover:shadow-md hover:border-zinc-300"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <Link
                        href={`/buildings/${item.buildingId}`}
                        className="font-semibold text-zinc-900 hover:text-amber-600 transition-colors"
                      >
                        {item.buildingName}
                      </Link>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-mono font-medium tracking-tight uppercase ${urgencyClasses(item.triage.urgency)}`}
                      >
                        {item.triage.urgency}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wide">
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600 ring-1 ring-zinc-200">
                        {triageDisplay.label}
                      </span>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600 ring-1 ring-zinc-200">
                        {humanizeToken(item.readinessState)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-zinc-700 font-medium">
                      {item.nextAction.title}
                    </p>
                    <p className="mt-1.5 text-xs text-zinc-500">{item.triage.cue}</p>
                    <p className="mt-1 text-xs text-zinc-500">{item.nextAction.reason}</p>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel
          title="Governed Queue"
          subtitle="Buildings currently surfacing in the governed portfolio queue, grouped by server-authored triage state."
        >
          {backlogItems.length === 0 ? (
            <EmptyState message="No governed queue items are available yet." />
          ) : (
            <div className="space-y-3">
              {backlogItems.map((entry) => {
                const triageDisplay = getWorklistTriageDisplay(entry.triage.bucket);
                return (
                  <div key={entry.buildingId} className="card-machined p-4 transition-all hover:shadow-md hover:border-zinc-300">
                    <div className="flex items-center justify-between gap-3">
                      <Link href={`/buildings/${entry.buildingId}`} className="font-semibold text-zinc-900 hover:text-amber-600 transition-colors">
                        {entry.buildingName}
                      </Link>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${urgencyClasses(entry.triage.urgency)}`}>
                        {triageDisplay.label}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-zinc-700 font-medium">{entry.triage.cue}</p>
                    <p className="mt-1 text-[13px] text-zinc-500">{entry.nextAction.title}</p>
                    <p className="mt-1 text-[13px] text-zinc-500">{entry.nextAction.reason}</p>
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
                <div key={anomaly.id} className="card-machined p-4 transition-all hover:shadow-md hover:border-zinc-300">
                  <div className="flex items-center justify-between gap-3">
                    <Link href={`/buildings/${anomaly.buildingId}`} className="font-semibold text-zinc-900 hover:text-amber-600 transition-colors">
                      {buildingNameById.get(anomaly.buildingId) ?? anomaly.buildingId}
                    </Link>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${urgencyClasses(anomaly.severity)}`}>
                      {anomaly.severity}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-700 font-medium">{anomaly.title}</p>
                  <p className="mt-1 text-[13px] text-zinc-500">{anomaly.anomalyType}</p>
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
                <div key={candidate.candidateId} className="card-machined p-4 transition-all hover:shadow-md hover:border-zinc-300">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link href={`/buildings/${candidate.buildingId}`} className="font-semibold text-zinc-900 hover:text-amber-600 transition-colors line-clamp-1">
                        {candidate.name}
                      </Link>
                      <p className="mt-1 max-w-[200px] truncate text-xs text-zinc-500">
                        {buildingNameById.get(candidate.buildingId) ?? candidate.buildingId}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-mono font-medium tracking-tight uppercase ${urgencyClasses(candidate.priorityBand)}`}>
                      {candidate.priorityBand}
                    </span>
                  </div>
                  
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
                    <div className="flex flex-col">
                      <span className="text-zinc-500 font-medium mb-0.5">Priority</span>
                      <span className="text-zinc-900 font-mono font-semibold">{candidate.priorityScore}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-zinc-500 font-medium mb-0.5">Avoided penalty</span>
                      <span className="text-emerald-700 font-mono font-semibold">{formatMoney(candidate.estimatedAvoidedPenalty)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-zinc-500 font-medium mb-0.5">Net cost</span>
                      <span className="text-zinc-900 font-mono font-semibold">{formatMoney(candidate.netProjectCost)}</span>
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
