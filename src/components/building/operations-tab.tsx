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
  return "bg-gray-100 text-gray-700";
}

export function OperationsTab({ buildingId }: { buildingId: string }) {
  const utils = trpc.useUtils();
  const anomalies = trpc.operations.listBuildingAnomalies.useQuery({ buildingId, limit: 50 });
  const refresh = trpc.operations.refreshAnomalies.useMutation({
    onSuccess: () => {
      utils.operations.listBuildingAnomalies.invalidate({ buildingId, limit: 50 });
    },
  });
  const acknowledge = trpc.operations.acknowledge.useMutation({
    onSuccess: () => {
      utils.operations.listBuildingAnomalies.invalidate({ buildingId, limit: 50 });
    },
  });
  const dismiss = trpc.operations.dismiss.useMutation({
    onSuccess: () => {
      utils.operations.listBuildingAnomalies.invalidate({ buildingId, limit: 50 });
    },
  });

  if (anomalies.isLoading) {
    return <LoadingState />;
  }

  if (anomalies.error) {
    return <ErrorState message="Operational anomalies are unavailable." detail={anomalies.error.message} />;
  }

  return (
    <Panel
      title="Operations Anomalies"
      subtitle="Deterministic anomaly detection and compliance-impact attribution for this building."
      actions={
        <button
          onClick={() => refresh.mutate({ buildingId })}
          disabled={refresh.isPending}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {refresh.isPending ? "Refreshing..." : "Refresh Anomalies"}
        </button>
      }
    >
      {!anomalies.data || anomalies.data.length === 0 ? (
        <EmptyState message="No active anomalies were found for this building." />
      ) : (
        <div className="space-y-3">
          {anomalies.data.map((anomaly) => {
            const attribution =
              anomaly.attributionJson &&
              typeof anomaly.attributionJson === "object" &&
              !Array.isArray(anomaly.attributionJson)
                ? (anomaly.attributionJson as Record<string, unknown>)
                : {};

            return (
              <div key={anomaly.id} className="rounded border border-gray-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${severityClasses(anomaly.severity)}`}>
                        {anomaly.severity}
                      </span>
                      <span className="text-xs text-gray-500">{anomaly.status}</span>
                      <span className="text-xs text-gray-500">{anomaly.anomalyType}</span>
                    </div>
                    <h4 className="mt-2 text-sm font-medium text-gray-900">{anomaly.title}</h4>
                    <p className="mt-1 text-sm text-gray-700">{anomaly.summary}</p>
                    <div className="mt-2 grid gap-2 text-xs text-gray-500 sm:grid-cols-2">
                      <div>Detected {formatDate(anomaly.detectionWindowEnd)}</div>
                      <div>Estimated impact {formatNumber(anomaly.estimatedEnergyImpactKbtu, 0)} kBtu</div>
                      <div>Likely BEPS impact {String(attribution.likelyBepsImpact ?? "—")}</div>
                      <div>Likely benchmarking impact {String(attribution.likelyBenchmarkingImpact ?? "—")}</div>
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    {anomaly.status === "ACTIVE" ? (
                      <>
                        <button
                          onClick={() => acknowledge.mutate({ anomalyId: anomaly.id })}
                          disabled={acknowledge.isPending}
                          className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Acknowledge
                        </button>
                        <button
                          onClick={() => dismiss.mutate({ anomalyId: anomaly.id })}
                          disabled={dismiss.isPending}
                          className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
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
