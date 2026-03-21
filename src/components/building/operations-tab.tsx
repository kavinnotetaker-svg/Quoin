"use client";

import { trpc } from "@/lib/trpc";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  formatDate,
  formatNumber,
} from "@/components/internal/admin-primitives";

function severityClasses(severity: string) {
  if (severity === "CRITICAL") return "bg-red-100 text-red-800";
  if (severity === "HIGH") return "bg-orange-100 text-orange-800";
  if (severity === "MEDIUM") return "bg-amber-100 text-amber-800";
  return "bg-zinc-100 text-zinc-700";
}

export function OperationsTab({ buildingId }: { buildingId: string }) {
  const utils = trpc.useUtils();
  const anomalies = trpc.operations.listBuildingAnomalies.useQuery({ buildingId, limit: 50 });
  const refresh = trpc.operations.refreshAnomalies.useMutation({
    onSuccess: () => {
      utils.operations.listBuildingAnomalies.invalidate({ buildingId, limit: 50 });
      utils.building.get.invalidate({ id: buildingId });
    },
  });
  const acknowledge = trpc.operations.acknowledge.useMutation({
    onSuccess: () => {
      utils.operations.listBuildingAnomalies.invalidate({ buildingId, limit: 50 });
      utils.building.get.invalidate({ id: buildingId });
    },
  });
  const dismiss = trpc.operations.dismiss.useMutation({
    onSuccess: () => {
      utils.operations.listBuildingAnomalies.invalidate({ buildingId, limit: 50 });
      utils.building.get.invalidate({ id: buildingId });
    },
  });

  if (anomalies.isLoading) {
    return <LoadingState />;
  }

  if (anomalies.error) {
    return <ErrorState message="Operational anomalies are unavailable." detail={anomalies.error.message} />;
  }

  const btnClass = "rounded-md border border-zinc-200 bg-white px-4 py-2 text-[13px] font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 hover:text-zinc-900 transition-colors disabled:opacity-50";
  const smallBtnClass = "rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 hover:text-zinc-900 transition-colors disabled:opacity-50";

  return (
    <Panel
      title="Operational Review"
      subtitle="Review deterministic operating issues that may be increasing energy use or worsening compliance outcomes."
      actions={
        <button
          onClick={() => refresh.mutate({ buildingId })}
          disabled={refresh.isPending}
          className={btnClass}
        >
          {refresh.isPending ? "Refreshing..." : "Refresh Operational Review"}
        </button>
      }
    >
      {!anomalies.data || anomalies.data.length === 0 ? (
        <EmptyState message="No active operational issues are currently flagged for this building." />
      ) : (
        <div className="space-y-4">
          {anomalies.data.map((anomaly) => {
            const attribution = anomaly.attribution;

            return (
              <div key={anomaly.id} className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ring-1 ring-inset ring-current/20 shadow-sm ${severityClasses(anomaly.severity)}`}>
                        {anomaly.severity}
                      </span>
                      <span className="text-zinc-300">—</span>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-md shadow-sm">{anomaly.status}</span>
                      <span className="text-zinc-300">—</span>
                      <span className="text-xs font-semibold text-zinc-600">{anomaly.anomalyType}</span>
                    </div>
                    <h4 className="mt-3 text-[15px] font-semibold tracking-tight text-zinc-900">{anomaly.title}</h4>
                    <p className="mt-1.5 text-sm text-zinc-700 leading-relaxed">{anomaly.summary}</p>
                    <div className="mt-4 grid gap-3 text-[13px] text-zinc-600 font-medium sm:grid-cols-2 bg-zinc-50/80 rounded-lg p-4 border border-zinc-100">
                      <div>Detected <span className="text-zinc-900">{formatDate(anomaly.detectionWindowEnd)}</span></div>
                      <div>Estimated impact <span className="text-zinc-900">{formatNumber(anomaly.estimatedEnergyImpactKbtu, 0)} kBtu</span></div>
                      <div>Likely BEPS impact <span className="text-zinc-900">{String(attribution.likelyBepsImpact ?? "—")}</span></div>
                      <div>Likely benchmarking impact <span className="text-zinc-900">{String(attribution.likelyBenchmarkingImpact ?? "—")}</span></div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-row sm:flex-col gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                    {anomaly.status === "ACTIVE" ? (
                      <>
                        <button
                          onClick={() => acknowledge.mutate({ anomalyId: anomaly.id })}
                          disabled={acknowledge.isPending}
                          className={`flex-1 sm:flex-none ${smallBtnClass}`}
                        >
                          Acknowledge
                        </button>
                        <button
                          onClick={() => dismiss.mutate({ anomalyId: anomaly.id })}
                          disabled={dismiss.isPending}
                          className={`flex-1 sm:flex-none ${smallBtnClass}`}
                        >
                          Dismiss
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
