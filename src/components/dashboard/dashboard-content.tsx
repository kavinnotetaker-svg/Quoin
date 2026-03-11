"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/layout/page-header";
import { KPIRow } from "./kpi-row";
import { BuildingTable } from "./building-table";
import { BuildingMap } from "./building-map";
import { PortfolioInsights } from "./portfolio-insights";

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
    const err = stats.error ?? buildings.error;
    const code = err?.data?.code;
    const msg = err?.message;

    if (code === "FORBIDDEN" || msg?.includes("No organization")) {
      return (
        <div className="py-12 text-center">
          <p className="text-sm font-medium text-gray-900">No organization selected</p>
          <p className="mt-1 text-sm text-gray-500">
            Create or select an organization to view your portfolio.
          </p>
          <a
            href="/onboarding"
            className="mt-4 inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Get started
          </a>
        </div>
      );
    }

    if (code === "NOT_FOUND" || msg?.includes("Organization not found")) {
      return (
        <div className="py-12 text-center">
          <p className="text-sm font-medium text-gray-900">Organization syncing</p>
          <p className="mt-1 text-sm text-gray-500">
            Your organization is being set up. This usually takes a few seconds.
          </p>
          <button
            onClick={() => {
              stats.refetch();
              buildings.refetch();
            }}
            className="mt-4 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Retry
          </button>
        </div>
      );
    }

    return (
      <div className="py-12 text-center">
        <p className="text-sm text-gray-500">Something went wrong.</p>
        <p className="mt-1 text-xs text-gray-400">{msg}</p>
        <button
          onClick={() => {
            stats.refetch();
            buildings.refetch();
          }}
          className="mt-4 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Retry
        </button>
      </div>
    );
  }

  const s = stats.data!;
  const b = buildings.data!;

  const scoredCount = s.compliant + s.atRisk + s.nonCompliant;

  // Client-side status filter
  const filtered = statusFilter
    ? b.buildings.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      <hr className="border-gray-200" />

      <PortfolioInsights
        buildings={b.buildings.map((building) => ({
          id: building.id,
          name: building.name,
        }))}
      />
    </div>
  );
}
