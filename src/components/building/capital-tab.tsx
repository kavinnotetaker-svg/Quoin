"use client";

import { trpc } from "@/lib/trpc";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const FUNDING_COLORS: Record<string, string> = {
  GRANT: "#22c55e",
  TAX_CREDIT: "#3b82f6",
  LOAN: "#f59e0b",
  CPACE: "#8b5cf6",
  EQUITY: "#6b7280",
};

const PRIORITY_BADGE: Record<string, { bg: string; text: string }> = {
  QUICK_WIN: { bg: "bg-green-100", text: "text-green-800" },
  DEEP_RETROFIT: { bg: "bg-orange-100", text: "text-orange-800" },
};

export function CapitalTab({ buildingId }: { buildingId: string }) {
  const { data, isLoading, error } = trpc.capital.getAnalysis.useQuery({
    buildingId,
  });

  if (isLoading) {
    return (
      <div className="overflow-hidden">
        <div className="loading-bar h-0.5 w-1/3 bg-gray-300" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="py-8 text-center text-sm text-gray-500">
        Capital analysis unavailable. Ensure compliance data has been uploaded.
      </p>
    );
  }

  if (!data) return null;

  const waterfallData = data.capitalStack.layers.map((layer) => ({
    name: layer.programCode,
    amount: layer.amount,
    fundingType: layer.fundingType,
  }));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard
          label="Total Project Cost"
          value={`$${data.totalEstimatedCost.toLocaleString()}`}
        />
        <SummaryCard
          label="Equity Required"
          value={`$${data.capitalStack.equityRequired.toLocaleString()}`}
        />
        <SummaryCard
          label="Est. Savings"
          value={`${data.totalEstimatedSavingsPct.toFixed(0)}%`}
        />
        <SummaryCard
          label="Simple Payback"
          value={
            data.capitalStack.simplePaybackYears !== null
              ? `${data.capitalStack.simplePaybackYears} yrs`
              : "N/A"
          }
        />
      </div>

      {/* Capital Stack Waterfall */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Capital Stack
        </h3>
        {waterfallData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={waterfallData} layout="vertical" margin={{ left: 80 }}>
              <XAxis
                type="number"
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`}
              />
              <YAxis type="category" dataKey="name" width={70} />
              <Tooltip
                formatter={(value) => `$${Number(value ?? 0).toLocaleString()}`}
              />
              <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                {waterfallData.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={FUNDING_COLORS[entry.fundingType] ?? "#9ca3af"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-4 text-sm text-gray-500">No funding layers available.</p>
        )}

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-600">
          {Object.entries(FUNDING_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded"
                style={{ backgroundColor: color }}
              />
              {type}
            </div>
          ))}
        </div>
      </div>

      {/* Funding Programs */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Program Eligibility
        </h3>
        <div className="space-y-3">
          {data.eligibility.map((prog) => (
            <div
              key={prog.programCode}
              className="flex items-start justify-between rounded-md border border-gray-100 bg-gray-50 p-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${prog.eligible ? "bg-green-500" : "bg-red-400"}`}
                  />
                  <span className="text-sm font-medium text-gray-900">
                    {prog.programName}
                  </span>
                </div>
                {prog.eligible && prog.maxFundingAmount !== null && (
                  <p className="mt-1 text-xs text-gray-600 ml-4">
                    Up to ${prog.maxFundingAmount.toLocaleString()}
                    {prog.interestRate !== null && ` at ${prog.interestRate}%`}
                    {prog.termYears !== null && ` / ${prog.termYears}yr`}
                  </p>
                )}
                {!prog.eligible && prog.disqualifiers.length > 0 && (
                  <ul className="mt-1 ml-4 text-xs text-red-600">
                    {prog.disqualifiers.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                )}
              </div>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  prog.eligible
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {prog.eligible ? "Eligible" : "Not Eligible"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ECM Table */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-medium text-gray-900 mb-1">
          Recommended ECMs
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Pathway: {data.pathway.replace("_", " ")} | Projected EUI:{" "}
          {data.projectedSiteEui.toFixed(1)} kBtu/ft²
        </p>

        {data.ecms.length === 0 ? (
          <p className="py-4 text-sm text-gray-500">
            No ECMs recommended for this building.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                  <th className="pb-2 pr-4">Measure</th>
                  <th className="pb-2 pr-4">Category</th>
                  <th className="pb-2 pr-4">Priority</th>
                  <th className="pb-2 pr-4 text-right">Est. Cost</th>
                  <th className="pb-2 pr-4 text-right">Savings</th>
                  <th className="pb-2 pr-4 text-right">Payback</th>
                  <th className="pb-2 text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {data.ecms.map((ecm) => {
                  const badge = PRIORITY_BADGE[ecm.priority] ?? {
                    bg: "bg-gray-100",
                    text: "text-gray-800",
                  };
                  return (
                    <tr
                      key={ecm.id}
                      className="border-b border-gray-50 last:border-0"
                    >
                      <td className="py-2 pr-4 font-medium text-gray-900">
                        {ecm.name}
                      </td>
                      <td className="py-2 pr-4 text-gray-600">
                        {ecm.category}
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={`inline-block px-2 py-0.5 text-[10px] font-medium rounded-full ${badge.bg} ${badge.text}`}
                        >
                          {ecm.priority.replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right text-gray-700">
                        ${ecm.estimatedCost.toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 text-right text-gray-700">
                        {ecm.estimatedSavingsPct}%
                      </td>
                      <td className="py-2 pr-4 text-right text-gray-700">
                        {ecm.simplePaybackYears}yr
                      </td>
                      <td className="py-2 text-right text-gray-700">
                        {ecm.relevanceScore}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* AI Narrative */}
      {data.narrativeSummary && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
          <h3 className="text-sm font-medium text-blue-900 mb-2">
            Executive Summary
          </h3>
          <p className="text-sm text-blue-800 whitespace-pre-line">
            {data.narrativeSummary}
          </p>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}
