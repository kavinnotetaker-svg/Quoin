"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/layout/page-header";
import { KPIRow } from "./kpi-row";
import { BuildingTable } from "./building-table";
import { PortfolioInsights } from "./portfolio-insights";
import { Skeleton } from "@/components/ui/skeleton";

const BuildingMap = dynamic(
 () => import("./building-map").then((mod) => mod.BuildingMap),
 {
 ssr: false,
 loading: () => (
 <Skeleton className="h-[600px] w-full border border-zinc-200" />
 ),
 },
);

const STATUS_FILTERS = [
 { label: "All", value: undefined },
 { label: "Data incomplete", value: "DATA_INCOMPLETE" },
 { label: "Ready", value: "READY" },
 { label: "Compliant", value: "COMPLIANT" },
 { label: "Non-compliant", value: "NON_COMPLIANT" },
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
 <div className="space-y-8 animate-in fade-in duration-500">
 <div className="flex items-center justify-between pt-2">
 <div className="space-y-2">
 <Skeleton className="h-8 w-64 rounded-md" />
 <Skeleton className="h-4 w-96 rounded-md" />
 </div>
 <Skeleton className="hidden h-10 w-32 sm:block" />
 </div>

 <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:gap-6">
 {[1, 2, 3, 4].map((i) => (
 <div
 key={i}
 className="border border-zinc-200 p-6"
 >
 <Skeleton className="h-4 w-28 rounded-md" />
 <Skeleton className="mt-4 h-8 w-24 rounded-md" />
 <Skeleton className="mt-3 h-3 w-32 rounded-md" />
 </div>
 ))}
 </div>

 <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
 <Skeleton className="h-10 w-full sm:w-[400px]" />
 <div className="flex items-center gap-3">
 <Skeleton className="h-10 w-32" />
 <Skeleton className="h-10 w-full sm:w-64" />
 </div>
 </div>

 <div className="overflow-hidden border border-zinc-200">
 <div className="border-b border-zinc-200 bg-zinc-50 px-6 py-4">
 <div className="flex items-center justify-between">
 <Skeleton className="h-4 w-full rounded-md" />
 </div>
 </div>
 <div className="divide-y divide-zinc-100">
 {[1, 2, 3, 4, 5].map((i) => (
 <div
 key={i}
 className="flex items-center justify-between px-6 py-4"
 >
 <Skeleton className="h-4 w-48 rounded-md" />
 <Skeleton className="h-4 w-24 rounded-md" />
 <Skeleton className="h-4 w-16 rounded-md" />
 <Skeleton className="h-5 w-24 rounded-full" />
 <Skeleton className="h-4 w-20 rounded-md" />
 <Skeleton className="h-4 w-20 rounded-md" />
 </div>
 ))}
 </div>
 </div>
 </div>
 );
 }

 if (stats.error || buildings.error) {
 const err = stats.error ?? buildings.error;
 const code = err?.data?.code;
 const msg = err?.message;

 if (code === "FORBIDDEN" || msg?.includes("No organization")) {
 return (
 <div className="flex min-h-[500px] flex-col items-center justify-center border border-dashed border-zinc-200 bg-white p-12 text-center">
 <p className="text-lg font-semibold text-zinc-900">
 No organization selected
 </p>
 <p className="mt-2 max-w-sm text-sm text-zinc-500">
 You need to create or select an organization to view your portfolio
 and workflow data.
 </p>
 <a
 href="/onboarding"
 className="mt-6 rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow transition-colors hover:bg-zinc-800"
 >
 Get started
 </a>
 </div>
 );
 }

 if (code === "NOT_FOUND" || msg?.includes("Organization not found")) {
 return (
 <div className="flex min-h-[500px] flex-col items-center justify-center border border-dashed border-zinc-200 bg-white p-12 text-center">
 <p className="text-lg font-semibold text-zinc-900">
 Organization syncing
 </p>
 <p className="mt-2 max-w-sm text-sm text-zinc-500">
 Your organization is still being set up. This usually takes only a
 few seconds.
 </p>
 <button
 onClick={() => {
 stats.refetch();
 buildings.refetch();
 }}
 className="mt-6 rounded-md border border-zinc-200 bg-white px-5 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
 >
 Refresh
 </button>
 </div>
 );
 }

 return (
 <div className="flex min-h-[500px] flex-col items-center justify-center border border-dashed border-zinc-200 bg-white p-12 text-center">
 <p className="text-lg font-semibold text-zinc-900">
 Portfolio data could not load
 </p>
 <p className="mt-2 max-w-sm text-sm text-zinc-500">{msg}</p>
 <button
 onClick={() => {
 stats.refetch();
 buildings.refetch();
 }}
 className="mt-6 rounded-md border border-zinc-200 bg-white px-5 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
 >
 Try again
 </button>
 </div>
 );
 }

 const s = stats.data!;
 const b = buildings.data!;

 const scoredCount = s.compliant + s.atRisk + s.nonCompliant;
 const filtered = statusFilter
 ? b.buildings.filter(
 (building) =>
 building.governedSummary.complianceSummary.primaryStatus === statusFilter,
 )
 : b.buildings;

 return (
 <div className="space-y-8">
 <PageHeader
 title="Portfolio Overview"
 subtitle="Review which buildings need consultant attention first, then drill into the building workflow."
 />

 <KPIRow
 items={[
 {
 label: "Buildings in portfolio",
 value: s.totalBuildings,
 subtitle:
 s.nonCompliant > 0
 ? `${s.nonCompliant} need immediate BEPS follow-up`
 : "No buildings currently non-compliant",
 subtitleColor:
 s.nonCompliant > 0 ? "danger" : undefined,
 },
 {
 label: "Current penalty exposure",
 value: `$${s.totalPenaltyExposure.toLocaleString()}`,
 subtitle: "From current governed penalty runs",
 },
 {
 label: "Average latest score",
 value: s.averageScore || "Not available",
 subtitle:
 scoredCount > 0
 ? `Across ${scoredCount} scored buildings`
 : "No score data yet",
 },
 {
 label: "Buildings needing fresh data",
 value: s.pendingData,
 subtitle:
 s.pendingData > 0
 ? "Refresh data before relying on status"
 : "All buildings have recent data",
 },
 ]}
 />

 <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
 <div className="flex gap-1.5 bg-zinc-100 p-1 text-sm font-medium text-zinc-600">
 {STATUS_FILTERS.map((filter) => (
 <button
 key={filter.label}
 onClick={() => setStatusFilter(filter.value)}
 className={`rounded-md px-3 py-1.5 transition-all duration-200 ${
 statusFilter === filter.value
 ? "bg-white text-zinc-950 ring-1 ring-zinc-200/50"
 : "hover:bg-zinc-200/50 hover:text-zinc-900"
 }`}
 >
 {filter.label}
 </button>
 ))}
 </div>
 <div className="flex items-center gap-3">
 <div className="flex items-center bg-zinc-100 p-1 text-sm font-medium text-zinc-600">
 <button
 onClick={() => setView("table")}
 className={`rounded-md px-3 py-1.5 transition-all duration-200 ${
 view === "table"
 ? "bg-white text-zinc-950 ring-1 ring-zinc-200/50"
 : "hover:bg-zinc-200/50 hover:text-zinc-900"
 }`}
 >
 Table
 </button>
 <button
 onClick={() => setView("map")}
 className={`rounded-md px-3 py-1.5 transition-all duration-200 ${
 view === "map"
 ? "bg-white text-zinc-950 ring-1 ring-zinc-200/50"
 : "hover:bg-zinc-200/50 hover:text-zinc-900"
 }`}
 >
 Map
 </button>
 </div>
 <div className="relative">
 <input
 type="text"
 placeholder="Search by building name..."
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 className="peer w-full border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 transition-all focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950/10 sm:w-64"
 />
 </div>
 </div>
 </div>

 <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
 {view === "table" ? (
 <BuildingTable buildings={filtered} />
 ) : (
 <BuildingMap buildings={filtered} />
 )}
 </div>

 {b.pagination.totalPages > 1 && (
 <p className="text-center text-xs font-medium text-zinc-500">
 Page {b.pagination.page} of {b.pagination.totalPages} (
 {b.pagination.total} total)
 </p>
 )}

 <hr className="my-8 border-zinc-200" />

 <PortfolioInsights
 buildings={b.buildings.map((building) => ({
 id: building.id,
 name: building.name,
 }))}
 />
 </div>
 );
}
