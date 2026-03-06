"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  CRITICAL: { color: "text-red-700", bg: "bg-red-50", border: "border-red-200", label: "Critical" },
  HIGH: { color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", label: "High" },
  MEDIUM: { color: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200", label: "Medium" },
  LOW: { color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", label: "Low" },
};

const RULE_LABELS: Record<string, string> = {
  EUI_SPIKE: "EUI Spike",
  SCORE_DROP: "Score Drop",
  CONSUMPTION_ANOMALY: "Consumption Anomaly",
  SEASONAL_DEVIATION: "Seasonal Deviation",
  SUSTAINED_DRIFT: "Sustained Drift",
};

const STATUS_LABELS: Record<string, { text: string; dot: string }> = {
  ACTIVE: { text: "Active", dot: "bg-red-500" },
  ACKNOWLEDGED: { text: "Acknowledged", dot: "bg-yellow-500" },
  RESOLVED: { text: "Resolved", dot: "bg-green-500" },
};

type AlertFilter = "ALL" | "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED";

export function AlertsTab({ buildingId }: { buildingId: string }) {
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<AlertFilter>("ALL");

  const { data: alerts, isLoading } = trpc.drift.listAlerts.useQuery({
    buildingId,
    status: filter === "ALL" ? undefined : filter,
    limit: 50,
  });

  const { data: summary } = trpc.drift.alertSummary.useQuery({ buildingId });

  const acknowledgeMutation = trpc.drift.acknowledge.useMutation({
    onSuccess: () => {
      utils.drift.listAlerts.invalidate({ buildingId });
      utils.drift.alertSummary.invalidate({ buildingId });
    },
  });

  const resolveMutation = trpc.drift.resolve.useMutation({
    onSuccess: () => {
      utils.drift.listAlerts.invalidate({ buildingId });
      utils.drift.alertSummary.invalidate({ buildingId });
    },
  });

  if (isLoading) {
    return (
      <div className="overflow-hidden">
        <div className="loading-bar h-0.5 w-1/3 bg-gray-300" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <SummaryCard label="Active Alerts" value={summary.active} accent="text-gray-900" />
          <SummaryCard label="Critical" value={summary.critical} accent="text-red-600" />
          <SummaryCard label="High" value={summary.high} accent="text-orange-600" />
          <SummaryCard label="Medium" value={summary.medium} accent="text-yellow-600" />
          <SummaryCard label="Low" value={summary.low} accent="text-blue-600" />
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 text-[13px]">
        {(["ALL", "ACTIVE", "ACKNOWLEDGED", "RESOLVED"] as AlertFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1.5 ${
              filter === f
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Alert List */}
      {!alerts || alerts.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="mt-3 text-sm text-gray-500">
            {filter === "ALL"
              ? "No drift alerts detected. Your building is performing within expected ranges."
              : `No ${filter.toLowerCase()} alerts.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const sev = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.LOW;
            const statusInfo = STATUS_LABELS[alert.status] ?? STATUS_LABELS.ACTIVE;
            const detectedDate = new Date(alert.detectedAt);

            return (
              <div
                key={alert.id}
                className={`rounded-lg border ${sev.border} ${sev.bg} p-4`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${sev.color} ${sev.bg} ring-1 ring-inset ring-current/20`}>
                        {sev.label}
                      </span>
                      <span className="text-xs text-gray-500">
                        {RULE_LABELS[alert.ruleId] ?? alert.ruleId}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusInfo.dot}`} />
                        {statusInfo.text}
                      </span>
                    </div>

                    <h4 className="mt-1 text-sm font-medium text-gray-900">
                      {alert.title}
                    </h4>
                    <p className="mt-1 text-sm text-gray-700">
                      {alert.description}
                    </p>

                    {alert.aiRootCause && (
                      <div className="mt-2 rounded-md bg-blue-50 border border-blue-100 p-2">
                        <p className="text-xs font-medium text-blue-800">AI Root Cause Analysis</p>
                        <p className="mt-0.5 text-xs text-blue-700">{alert.aiRootCause}</p>
                      </div>
                    )}

                    <p className="mt-2 text-xs text-gray-400">
                      Detected {detectedDate.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>

                  {/* Action Buttons */}
                  {alert.status === "ACTIVE" && (
                    <div className="ml-4 flex flex-col gap-1">
                      <button
                        onClick={() => acknowledgeMutation.mutate({ alertId: alert.id })}
                        disabled={acknowledgeMutation.isPending}
                        className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50"
                      >
                        Acknowledge
                      </button>
                      <button
                        onClick={() => resolveMutation.mutate({ alertId: alert.id })}
                        disabled={resolveMutation.isPending}
                        className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-green-700 shadow-sm ring-1 ring-green-300 hover:bg-green-50"
                      >
                        Resolve
                      </button>
                    </div>
                  )}
                  {alert.status === "ACKNOWLEDGED" && (
                    <div className="ml-4">
                      <button
                        onClick={() => resolveMutation.mutate({ alertId: alert.id })}
                        disabled={resolveMutation.isPending}
                        className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-green-700 shadow-sm ring-1 ring-green-300 hover:bg-green-50"
                      >
                        Resolve
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accent}`}>{value}</p>
    </div>
  );
}
