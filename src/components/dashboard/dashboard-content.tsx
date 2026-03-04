"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/layout/page-header";
import { KPIRow } from "./kpi-row";
import { BuildingTable } from "./building-table";
import { BuildingMap } from "./building-map";

const STATUS_FILTERS = [
  { label: "All", value: undefined },
  { label: "Compliant", value: "COMPLIANT" },
  { label: "At Risk", value: "AT_RISK" },
  { label: "Non-Compliant", value: "NON_COMPLIANT" },
  { label: "Pending", value: "PENDING_DATA" },
] as const;

export function DashboardContent() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [view, setView] = useState<"table" | "map">("table");

  const stats = trpc.building.portfolioStats.useQuery();
  const buildings = trpc.building.list.useQuery({
    search: search || undefined,
  });

  if (stats.isLoading || buildings.isLoading) {
    return (
      <div className="overflow-hidden">
        <div className="loading-bar h-0.5 w-1/3 bg-gray-300" />
      </div>
    );
  }

  if (stats.error || buildings.error) {
    return (
      <p className="py-12 text-center text-sm text-gray-500">
        Something went wrong. Try refreshing.
      </p>
    );
  }

  const s = stats.data!;
  const b = buildings.data!;

  const scoredCount = s.compliant + s.atRisk + s.nonCompliant;

  // Client-side status filter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filtered = statusFilter
    ? b.buildings.filter(
        (bld: any) =>
          bld.latestSnapshot?.complianceStatus === statusFilter ||
          (!bld.latestSnapshot && statusFilter === "PENDING_DATA"),
      )
    : b.buildings;

  return (
    <div className="space-y-6">
      <PageHeader title="Portfolio Overview" />

      <KPIRow
        items={[
          {
            label: "Buildings",
            value: s.totalBuildings,
            subtitle:
              s.nonCompliant > 0
                ? `${s.nonCompliant} non-compliant`
                : undefined,
            subtitleColor: s.nonCompliant > 0 ? "#dc2626" : undefined,
          },
          {
            label: "Penalty Exposure",
            value: `$${s.totalPenaltyExposure.toLocaleString()}`,
          },
          {
            label: "Avg Score",
            value: s.averageScore || "—",
            subtitle:
              scoredCount > 0
                ? `across ${scoredCount} scored`
                : undefined,
          },
          {
            label: "Pending Data",
            value: s.pendingData,
            subtitle:
              s.pendingData > 0 ? "need fresh data" : "all up to date",
          },
        ]}
      />

      <hr className="border-gray-200" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-4 text-[13px]">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => setStatusFilter(f.value)}
              className={`border-b-2 pb-0.5 ${
                statusFilter === f.value
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <button
              onClick={() => setView("table")}
              className={
                view === "table"
                  ? "border-b border-gray-900 pb-0.5 text-gray-900"
                  : ""
              }
            >
              Table
            </button>
            <button
              onClick={() => setView("map")}
              className={
                view === "map"
                  ? "border-b border-gray-900 pb-0.5 text-gray-900"
                  : ""
              }
            >
              Map
            </button>
          </div>
          <input
            type="text"
            placeholder="Search buildings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded border border-gray-200 px-2.5 py-1.5 text-[13px] text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 sm:w-56"
          />
        </div>
      </div>

      {view === "table" ? (
        <BuildingTable buildings={filtered} />
      ) : (
        <BuildingMap buildings={filtered} />
      )}

      {b.pagination.totalPages > 1 && (
        <p className="text-xs text-gray-400">
          Page {b.pagination.page} of {b.pagination.totalPages} (
          {b.pagination.total} total)
        </p>
      )}
    </div>
  );
}
