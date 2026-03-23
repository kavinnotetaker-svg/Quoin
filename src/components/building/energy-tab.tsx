"use client";

import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";
import {
 BarChart,
 Bar,
 XAxis,
 YAxis,
 Tooltip,
 ResponsiveContainer,
 Legend,
} from "recharts";

interface EnergyTabProps {
 buildingId: string;
}

interface EnergyReadingRow {
 id: string;
 meterType: "ELECTRIC" | "GAS" | "STEAM" | "OTHER";
 consumption: number;
 unit: string;
 consumptionKbtu: number;
 cost: number | null;
 source: string;
 periodStart: string | Date;
 periodEnd: string | Date;
}

interface ChartPoint {
 month: string;
 ELECTRIC: number;
 GAS: number;
 STEAM: number;
 OTHER: number;
}

function relativeTime(date: string | Date): { text: string; color: string } {
 const d = new Date(date);
 const now = new Date();
 const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
 if (days <= 30) return { text: `${days}d ago`, color: "#10b981" }; // emerald-500
 if (days <= 60) return { text: `${days}d ago`, color: "#f59e0b" }; // amber-500
 return { text: `${days}d ago`, color: "#ef4444" }; // red-500
}

export function EnergyTab({ buildingId }: EnergyTabProps) {
 const [editingReading, setEditingReading] = useState<EnergyReadingRow | null>(null);
 const [consumptionInput, setConsumptionInput] = useState("");
 const [costInput, setCostInput] = useState("");
 const [pushAfterSave, setPushAfterSave] = useState(false);
 const utils = trpc.useUtils();
 const { data, isLoading } = trpc.building.energyReadings.useQuery({
 buildingId,
 months: 24,
 });
 const createOverride = trpc.building.createEnergyReadingOverride.useMutation();
 const pushLocalData = trpc.benchmarking.pushLocalEnergyToPortfolioManager.useMutation();

 const rows = useMemo(() => (data ?? []) as EnergyReadingRow[], [data]);

 async function handleSaveOverride() {
 if (!editingReading) {
 return;
 }

 const consumption = Number(consumptionInput);
 if (!Number.isFinite(consumption) || consumption <= 0) {
 alert("Enter a valid positive consumption value.");
 return;
 }

 const cost =
 costInput.trim() === ""
 ? null
 : Number.isFinite(Number(costInput))
 ? Number(costInput)
 : Number.NaN;

 if (typeof cost === "number" && Number.isNaN(cost)) {
 alert("Enter a valid cost or leave it blank.");
 return;
 }

 try {
 await createOverride.mutateAsync({
 buildingId,
 readingId: editingReading.id,
 consumption,
 cost,
 });

 if (pushAfterSave) {
 await pushLocalData.mutateAsync({
 buildingId,
 });
 }

 await Promise.all([
 utils.building.energyReadings.invalidate({ buildingId, months: 24 }),
 utils.building.get.invalidate({ id: buildingId }),
 utils.building.list.invalidate(),
 utils.building.complianceHistory.invalidate({ buildingId, limit: 20 }),
 utils.report.getComplianceReport.invalidate({ buildingId }),
 utils.benchmarking.getPortfolioManagerSyncStatus.invalidate({ buildingId }),
 utils.benchmarking.getQaFindings.invalidate({ buildingId }),
 utils.benchmarking.listSubmissions.invalidate({ buildingId, limit: 10 }),
 ]);

 setEditingReading(null);
 setConsumptionInput("");
 setCostInput("");
 setPushAfterSave(false);
 } catch (error) {
 alert(error instanceof Error ? error.message : "Save failed");
 }
 }

 if (isLoading) {
 return (
 <div className="overflow-hidden">
 <div className="loading-bar h-0.5 w-1/3 bg-zinc-300" />
 </div>
 );
 }

 if (!rows || rows.length === 0) {
 return (
 <div className="border border-zinc-200 p-12 text-center">
 <svg className="mx-auto h-12 w-12 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
 </svg>
 <p className="mt-3 text-sm text-zinc-500">
 No energy data yet. Upload a CSV to get started.
 </p>
 </div>
 );
 }

 // Aggregate readings by month for chart
 const monthMap = new Map<string, ChartPoint>();
 let latestDate: Date | null = null;

 for (const r of rows) {
 const d = new Date(r.periodStart);
 const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
 const label = `${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" })} '${String(d.getUTCFullYear()).slice(2)}`;

 if (!monthMap.has(key)) {
 monthMap.set(key, {
 month: label,
 ELECTRIC: 0,
 GAS: 0,
 STEAM: 0,
 OTHER: 0,
 });
 }
 const point = monthMap.get(key)!;
 const mt = r.meterType as keyof Omit<ChartPoint, "month">;
 if (mt in point) {
 point[mt] += r.consumptionKbtu;
 }

 const pd = new Date(r.periodStart);
 if (!latestDate || pd > latestDate) latestDate = pd;
 }

 const chartData = Array.from(monthMap.entries())
 .sort(([a], [b]) => a.localeCompare(b))
 .map(([, v]) => v);

 const hasFuel = (fuel: keyof Omit<ChartPoint, "month">) =>
 chartData.some((d) => d[fuel] > 0);

 const freshnessText = latestDate
 ? `Last data received: ${latestDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}`
 : "";
 const freshness = latestDate ? relativeTime(latestDate) : null;

 const inputClass = "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 transition-colors";

 return (
 <div className="space-y-6">
 {/* Chart */}
 <div className="h-[260px] border border-zinc-200 p-6">
 <ResponsiveContainer width="100%" height="100%">
 <BarChart data={chartData} barCategoryGap="25%">
 <XAxis
 dataKey="month"
 tick={{ fontSize: 11, fill: "#71717a", fontWeight: 500 }}
 axisLine={{ stroke: "#e4e4e7" }}
 tickLine={false}
 dy={10}
 />
 <YAxis
 tick={{ fontSize: 11, fill: "#71717a", fontWeight: 500 }}
 axisLine={false}
 tickLine={false}
 tickFormatter={(v: number) =>
 v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
 }
 dx={-10}
 />
 <Tooltip
 contentStyle={{
 border: "1px solid #e4e4e7",
 borderRadius: "8px",
 fontSize: "12px",
 boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
 }}
 formatter={(value) => [
 `${Number(value).toLocaleString()} kBtu`,
 ]}
 cursor={{ fill: "#f4f4f5" }}
 />
 {hasFuel("ELECTRIC") && (
 <Bar
 dataKey="ELECTRIC"
 stackId="a"
 fill="#3b82f6"
 name="Electric"
 radius={[hasFuel("GAS") || hasFuel("STEAM") || hasFuel("OTHER") ? 0 : 4, hasFuel("GAS") || hasFuel("STEAM") || hasFuel("OTHER") ? 0 : 4, 0, 0]}
 />
 )}
 {hasFuel("GAS") && (
 <Bar
 dataKey="GAS"
 stackId="a"
 fill="#f59e0b"
 name="Gas"
 radius={[hasFuel("STEAM") || hasFuel("OTHER") ? 0 : 4, hasFuel("STEAM") || hasFuel("OTHER") ? 0 : 4, 0, 0]}
 />
 )}
 {hasFuel("STEAM") && (
 <Bar
 dataKey="STEAM"
 stackId="a"
 fill="#8b5cf6"
 name="Steam"
 radius={[hasFuel("OTHER") ? 0 : 4, hasFuel("OTHER") ? 0 : 4, 0, 0]}
 />
 )}
 {hasFuel("OTHER") && (
 <Bar
 dataKey="OTHER"
 stackId="a"
 fill="#71717a"
 name="Other"
 radius={[4, 4, 0, 0]}
 />
 )}
 <Legend
 wrapperStyle={{ fontSize: "12px", color: "#52525b", fontWeight: 500, paddingTop: "12px" }}
 iconType="circle"
 iconSize={8}
 />
 </BarChart>
 </ResponsiveContainer>
 </div>

 {/* Data freshness */}
 {freshness && (
 <p className="text-xs font-medium text-zinc-500">
 <span
 className="mr-1.5 inline-block h-2 w-2 rounded-full ring-1 ring-white/50"
 style={{ backgroundColor: freshness.color }}
 />
 {freshnessText} <span className="text-zinc-400 font-normal">({freshness.text})</span>
 </p>
 )}

 {/* Readings table */}
 <div className="overflow-hidden border border-zinc-200">
 <div className="overflow-x-auto">
 <table className="w-full text-left text-sm">
 <thead>
 <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wider text-zinc-500">
 <th className="py-3 px-4">Period</th>
 <th className="py-3 px-4">Fuel</th>
 <th className="py-3 px-4 text-right">Consumption</th>
 <th className="py-3 px-4 text-right">kBtu</th>
 <th className="py-3 px-4 text-right">Cost</th>
 <th className="py-3 px-4">Source</th>
 <th className="py-3 px-4 text-right">Action</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-zinc-100">
 {[...rows].reverse().slice(0, 50).map((r) => (
 <tr
 key={r.id}
 className="group hover:bg-zinc-50 transition-colors"
 >
 <td className="py-3 px-4 font-medium text-zinc-700 whitespace-nowrap">
 {new Date(r.periodStart).toLocaleDateString("en-US", {
 month: "short",
 day: "numeric",
 timeZone: "UTC",
 })}{" "}
 –{" "}
 {new Date(r.periodEnd).toLocaleDateString("en-US", {
 month: "short",
 day: "numeric",
 year: "numeric",
 timeZone: "UTC",
 })}
 </td>
 <td className="py-3 px-4 text-xs font-medium text-zinc-500">
 <span className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600 ring-1 ring-inset ring-zinc-500/10">
 {r.meterType}
 </span>
 </td>
 <td className="py-3 px-4 text-right text-zinc-900 font-mono text-[12px]">
 {r.consumption.toLocaleString()} {r.unit}
 </td>
 <td className="py-3 px-4 text-right text-zinc-900 font-mono text-[12px]">
 {Math.round(r.consumptionKbtu).toLocaleString()}
 </td>
 <td className="py-3 px-4 text-right text-zinc-500 font-mono text-[12px]">
 {r.cost != null ? `$${r.cost.toLocaleString()}` : "—"}
 </td>
 <td className="py-3 px-4 text-xs text-zinc-400 truncate max-w-[120px]">{r.source}</td>
 <td className="py-3 px-4 text-right">
 <button
 onClick={() => {
 setEditingReading(r);
 setConsumptionInput(String(r.consumption));
 setCostInput(r.cost != null ? String(r.cost) : "");
 setPushAfterSave(false);
 }}
 className="text-sm font-medium text-zinc-600 hover:text-zinc-900 opacity-0 group-hover:opacity-100 transition-opacity"
 >
 Edit
 </button>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>

 {editingReading ? (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 animate-in fade-in duration-200">
 <div className="w-full max-w-md bg-white p-6 ring-1 ring-black/5 animate-in zoom-in-95 duration-200">
 <div className="flex items-start justify-between gap-4">
 <div>
 <h3 className="text-lg font-semibold tracking-tight text-zinc-900">
 Edit Energy Reading
 </h3>
 <p className="mt-1.5 text-sm text-zinc-500">
 Save a manual override for{" "}
 <strong className="font-medium text-zinc-700">
 {new Date(editingReading.periodStart).toLocaleDateString("en-US", {
 month: "short",
 day: "numeric",
 year: "numeric",
 timeZone: "UTC",
 })}{" "}
 -{" "}
 {new Date(editingReading.periodEnd).toLocaleDateString("en-US", {
 month: "short",
 day: "numeric",
 year: "numeric",
 timeZone: "UTC",
 })}
 </strong>{" "}
 ({editingReading.meterType})
 </p>
 </div>
 <button
 onClick={() => setEditingReading(null)}
 className="text-zinc-400 hover:text-zinc-600 transition-colors"
 aria-label="Close"
 >
 <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
 </button>
 </div>

 <div className="mt-6 space-y-4">
 <label className="block text-sm">
 <span className="mb-1.5 block text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">Consumption ({editingReading.unit})</span>
 <input
 type="number"
 min="0"
 step="any"
 value={consumptionInput}
 onChange={(event) => setConsumptionInput(event.target.value)}
 className={inputClass}
 />
 </label>

 <label className="block text-sm">
 <span className="mb-1.5 block text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">Cost (optional)</span>
 <input
 type="number"
 min="0"
 step="any"
 value={costInput}
 onChange={(event) => setCostInput(event.target.value)}
 className={inputClass}
 />
 </label>

 <label className="flex items-start gap-3 text-sm text-zinc-700 mt-2 bg-zinc-50 p-3 border border-zinc-100">
 <input
 type="checkbox"
 checked={pushAfterSave}
 onChange={(event) => setPushAfterSave(event.target.checked)}
 className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
 />
 <span className="leading-snug">
 Push updated local <strong className="font-medium text-zinc-900">electricity/gas data</strong> to Portfolio Manager after save
 </span>
 </label>
 </div>

 <div className="mt-8 flex justify-end gap-3">
 <button
 onClick={() => setEditingReading(null)}
 className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
 >
 Cancel
 </button>
 <button
 onClick={() => void handleSaveOverride()}
 disabled={createOverride.isPending || pushLocalData.isPending}
 className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors"
 >
 {createOverride.isPending || pushLocalData.isPending
 ? "Saving..."
 : pushAfterSave
 ? "Save & Push"
 : "Save Override"}
 </button>
 </div>
 </div>
 </div>
 ) : null}
 </div>
 );
}
