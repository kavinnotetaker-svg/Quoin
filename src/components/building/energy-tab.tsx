"use client";

import { trpc } from "@/lib/trpc";
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
  if (days <= 30) return { text: `${days}d ago`, color: "#16a34a" };
  if (days <= 60) return { text: `${days}d ago`, color: "#ca8a04" };
  return { text: `${days}d ago`, color: "#dc2626" };
}

export function EnergyTab({ buildingId }: EnergyTabProps) {
  const { data, isLoading } = trpc.building.energyReadings.useQuery({
    buildingId,
    months: 24,
  });

  if (isLoading) {
    return (
      <div className="overflow-hidden">
        <div className="loading-bar h-0.5 w-1/3 bg-gray-300" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-500">
        No energy data yet. Upload a CSV to get started.
      </p>
    );
  }

  // Aggregate readings by month for chart
  const monthMap = new Map<string, ChartPoint>();
  let latestDate: Date | null = null;

  for (const r of data) {
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

  return (
    <div className="space-y-6">
      {/* Chart */}
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barCategoryGap="20%">
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              axisLine={{ stroke: "#e5e7eb" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#6b7280" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) =>
                v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
              }
            />
            <Tooltip
              contentStyle={{
                border: "1px solid #e5e7eb",
                borderRadius: "4px",
                fontSize: "12px",
                boxShadow: "none",
              }}
              formatter={(value) => [
                `${Number(value).toLocaleString()} kBtu`,
              ]}
            />
            {hasFuel("ELECTRIC") && (
              <Bar
                dataKey="ELECTRIC"
                stackId="a"
                fill="#3b82f6"
                fillOpacity={0.4}
                name="Electric"
              />
            )}
            {hasFuel("GAS") && (
              <Bar
                dataKey="GAS"
                stackId="a"
                fill="#f97316"
                fillOpacity={0.4}
                name="Gas"
              />
            )}
            {hasFuel("STEAM") && (
              <Bar
                dataKey="STEAM"
                stackId="a"
                fill="#8b5cf6"
                fillOpacity={0.4}
                name="Steam"
              />
            )}
            {hasFuel("OTHER") && (
              <Bar
                dataKey="OTHER"
                stackId="a"
                fill="#6b7280"
                fillOpacity={0.4}
                name="Other"
              />
            )}
            <Legend
              wrapperStyle={{ fontSize: "11px", color: "#6b7280" }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Data freshness */}
      {freshness && (
        <p className="text-xs text-gray-500">
          <span
            className="mr-1 inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: freshness.color }}
          />
          {freshnessText} ({freshness.text})
        </p>
      )}

      {/* Readings table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-500">
              <th className="pb-2 pr-4 font-normal">Period</th>
              <th className="pb-2 pr-4 font-normal">Fuel</th>
              <th className="pb-2 pr-4 font-normal text-right">
                Consumption
              </th>
              <th className="pb-2 pr-4 font-normal text-right">kBtu</th>
              <th className="pb-2 pr-4 font-normal text-right">Cost</th>
              <th className="pb-2 font-normal">Source</th>
            </tr>
          </thead>
          <tbody>
            {[...data].reverse().slice(0, 50).map((r) => (
              <tr
                key={r.id}
                className="border-b border-gray-100 last:border-0"
              >
                <td className="py-2 pr-4 text-gray-700">
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
                <td className="py-2 pr-4 text-xs text-gray-500">
                  {r.meterType}
                </td>
                <td className="py-2 pr-4 text-right text-gray-900">
                  {r.consumption.toLocaleString()} {r.unit}
                </td>
                <td className="py-2 pr-4 text-right text-gray-900">
                  {Math.round(r.consumptionKbtu).toLocaleString()}
                </td>
                <td className="py-2 pr-4 text-right text-gray-500">
                  {r.cost != null ? `$${r.cost.toLocaleString()}` : "—"}
                </td>
                <td className="py-2 text-xs text-gray-400">{r.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
