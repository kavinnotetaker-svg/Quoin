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
  GRANT: "#10b981", // emerald-500
  TAX_CREDIT: "#3b82f6", // blue-500
  LOAN: "#f59e0b", // amber-500
  CPACE: "#8b5cf6", // violet-500
  EQUITY: "#71717a", // slate-500
};

const PRIORITY_BADGE: Record<string, { bg: string; text: string }> = {
  QUICK_WIN: { bg: "bg-emerald-100", text: "text-emerald-800" },
  DEEP_RETROFIT: { bg: "bg-orange-100", text: "text-orange-800" },
};

export function CapitalTab({ buildingId }: { buildingId: string }) {
  const { data, isLoading, error } = trpc.capital.getAnalysis.useQuery({
    buildingId,
  });

  if (isLoading) {
    return (
      <div className="overflow-hidden">
        <div className="loading-bar h-0.5 w-1/3 bg-slate-300" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
        <svg className="mx-auto h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="py-4 text-sm text-slate-500 font-medium tracking-tight">
          Capital analysis unavailable. Ensure compliance data has been uploaded.
        </p>
      </div>
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
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md">
        <h3 className="text-lg font-semibold tracking-tight text-slate-900 mb-6">
          Capital Stack
        </h3>
        {waterfallData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={waterfallData} layout="vertical" margin={{ left: 80 }}>
              <XAxis
                type="number"
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`}
                stroke="#a1a1aa"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                type="category" 
                dataKey="name" 
                width={70} 
                stroke="#71717a" 
                fontSize={12} 
                tickLine={false} 
                axisLine={false} 
              />
              <Tooltip
                formatter={(value) => `$${Number(value ?? 0).toLocaleString()}`}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e4e4e7', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                {waterfallData.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={FUNDING_COLORS[entry.fundingType] ?? "#a1a1aa"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="py-8 text-center text-sm font-medium text-slate-500 bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
            No funding layers available.
          </div>
        )}

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-4 text-xs font-medium text-slate-600 justify-center">
          {Object.entries(FUNDING_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: color }}
              />
              {type}
            </div>
          ))}
        </div>
      </div>

      {/* Funding Programs */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md">
        <h3 className="text-lg font-semibold tracking-tight text-slate-900 mb-6">
          Program Eligibility
        </h3>
        <div className="space-y-3">
          {data.eligibility.map((prog) => (
            <div
              key={prog.programCode}
              className="flex items-start justify-between rounded-lg border border-slate-100 bg-slate-50 p-4 transition-colors hover:bg-slate-100/50"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block h-2 w-2 rounded-full shadow-sm ring-1 ring-white/50 ${prog.eligible ? "bg-emerald-500" : "bg-red-400"}`}
                  />
                  <span className="text-sm font-semibold text-slate-900 tracking-tight">
                    {prog.programName}
                  </span>
                </div>
                {prog.eligible && prog.maxFundingAmount !== null && (
                  <p className="mt-1.5 text-xs text-slate-600 ml-4 font-medium">
                    Up to <span className="text-slate-900">${prog.maxFundingAmount.toLocaleString()}</span>
                    {prog.interestRate !== null && ` at ${prog.interestRate}%`}
                    {prog.termYears !== null && ` / ${prog.termYears}yr`}
                  </p>
                )}
                {!prog.eligible && prog.disqualifiers.length > 0 && (
                  <ul className="mt-2 ml-4 text-[13px] text-red-600 leading-relaxed font-medium">
                    {prog.disqualifiers.map((d, i) => (
                      <li key={i} className="flex gap-1.5 items-start">
                        <span className="mt-1 text-red-400 text-[10px]">●</span>
                        {d}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <span
                className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md shadow-sm ring-1 ring-inset ring-current/20 ${
                  prog.eligible
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {prog.eligible ? "Eligible" : "Not Eligible"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ECM Table */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md">
        <div className="flex flex-wrap items-baseline justify-between gap-4 mb-6">
          <h3 className="text-lg font-semibold tracking-tight text-slate-900">
            Recommended ECMs
          </h3>
          <p className="text-[13px] font-medium text-slate-500 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
            Pathway: <span className="text-slate-900">{data.pathway.replace("_", " ")}</span> | Projected EUI:{" "}
            <span className="text-slate-900">{data.projectedSiteEui.toFixed(1)} kBtu/ft²</span>
          </p>
        </div>

        {data.ecms.length === 0 ? (
          <div className="py-10 text-center text-sm font-medium text-slate-500 bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
            No ECMs recommended for this building.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[12px] font-semibold text-slate-500 uppercase tracking-wider bg-slate-50/50">
                  <th className="py-3 px-4 rounded-tl-lg">Measure</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4 text-right">Est. Cost</th>
                  <th className="py-3 px-4 text-right">Savings</th>
                  <th className="py-3 px-4 text-right">Payback</th>
                  <th className="py-3 px-4 text-right rounded-tr-lg">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.ecms.map((ecm) => {
                  const badge = PRIORITY_BADGE[ecm.priority] ?? {
                    bg: "bg-slate-100",
                    text: "text-slate-800",
                  };
                  return (
                    <tr
                      key={ecm.id}
                      className="transition-colors hover:bg-slate-50/80"
                    >
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {ecm.name}
                      </td>
                      <td className="py-3 px-4 text-[13px] text-slate-600">
                        {ecm.category}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md ring-1 ring-inset ring-current/20 shadow-sm ${badge.bg} ${badge.text}`}
                        >
                          {ecm.priority.replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-[13px] font-medium text-slate-700">
                        ${ecm.estimatedCost.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right text-[13px] font-medium text-slate-700">
                        {ecm.estimatedSavingsPct}%
                      </td>
                      <td className="py-3 px-4 text-right text-[13px] font-medium text-slate-700">
                        {ecm.simplePaybackYears}yr
                      </td>
                      <td className="py-3 px-4 text-right text-[13px] font-medium text-slate-700">
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
        <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-6 shadow-sm">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-blue-800 mb-3">
            Executive Summary
          </h3>
          <p className="text-[15px] font-medium leading-relaxed text-blue-900 whitespace-pre-line">
            {data.narrativeSummary}
          </p>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <p className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}
