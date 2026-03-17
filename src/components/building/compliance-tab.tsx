"use client";

import { trpc } from "@/lib/trpc";
import { StatusDot } from "@/components/dashboard/status-dot";
import {
  screenForExemptions,
  type FinancialDistressIndicators,
} from "@/server/pipelines/pathway-analysis/exemption-screener";
import { determineApplicablePathway } from "@/server/pipelines/pathway-analysis/penalty-calculator";

const TRIGGER_LABELS: Record<string, string> = {
  PIPELINE_RUN: "Pipeline",
  ESPM_SYNC: "ESPM Sync",
  MANUAL: "Manual",
  SCORE_CHANGE: "Score Change",
};

export function ComplianceTab({ buildingId }: { buildingId: string }) {
  const { data: history, isLoading: historyLoading } =
    trpc.building.complianceHistory.useQuery({ buildingId, limit: 20 });
  const { data: building, isLoading: buildingLoading } =
    trpc.building.get.useQuery({ id: buildingId });

  if (historyLoading || buildingLoading) {
    return (
      <div className="overflow-hidden rounded-md">
        <div className="loading-bar h-1 w-1/3 bg-slate-300" />
      </div>
    );
  }

  if (!building) return null;

  const latestSnap = building.latestSnapshot;

  // Evaluate exemptions
  const financialDistressIndicators: FinancialDistressIndicators = {
    inForeclosure: building.hasFinancialDistress,
    inBankruptcy: building.hasFinancialDistress,
    negativeNetOperatingIncome: building.hasFinancialDistress,
    taxDelinquent: building.hasFinancialDistress,
  };

  const exemptionResult = screenForExemptions({
    baselineOccupancyPct: building.occupancyRate ? building.occupancyRate * 100 : null,
    financialDistressIndicators,
    grossSquareFeet: building.grossSquareFeet,
    propertyType: building.propertyType,
    yearBuilt: building.yearBuilt,
  });

  const pathway = determineApplicablePathway(
    latestSnap?.energyStarScore ?? null,
    building.bepsTargetScore
  );
  const maxPenaltyExposure = Math.min(building.grossSquareFeet * 10, 7_500_000);

  return (
    <div className="space-y-6">
      {/* 2024 Exemption Banner */}
      {exemptionResult.eligible && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-semibold text-emerald-800 tracking-tight">
                Qualifies for 2024 Whole-Cycle Exemption
              </h3>
              <div className="mt-2 text-[13px] text-emerald-700">
                <ul className="list-disc space-y-1 pl-5">
                  {exemptionResult.details.map((detail, idx) => (
                    <li key={idx}>{detail}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pathway & Penalty Gauge */}
      {latestSnap && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Pathway Metrics */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md hover:border-slate-300">
            <h3 className="text-lg font-semibold tracking-tight text-slate-900 mb-6">
              Pathway: {pathway.replace("_", " ")}
            </h3>

            {pathway === "STANDARD_TARGET" && (
              <div className="space-y-5">
                <div>
                  <div className="flex justify-between text-sm mb-1.5 font-medium">
                    <span className="text-slate-500">Current Score</span>
                    <span className="text-slate-900">{latestSnap.energyStarScore}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden shadow-inner">
                    <div className="bg-blue-600 h-2 rounded-full transition-all duration-1000 ease-out" style={{ width: `${latestSnap.energyStarScore}%` }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1.5 font-medium">
                    <span className="text-slate-500">Target Score</span>
                    <span className="text-slate-900">{building.bepsTargetScore}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden shadow-inner">
                    <div className="bg-slate-400 h-2 rounded-full transition-all duration-1000 ease-out" style={{ width: `${building.bepsTargetScore}%` }}></div>
                  </div>
                </div>
              </div>
            )}

            {pathway === "PERFORMANCE" && (
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1 font-medium">
                    <span className="text-slate-500">Current Adjusted Site EUI</span>
                    <span className="text-slate-900">{latestSnap.weatherNormalizedSiteEui?.toFixed(1) || 'N/A'}</span>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1 font-medium">
                    <span className="text-slate-500">Target Reduction (20%)</span>
                    <span className="text-slate-900">Required</span>
                  </div>
                  <p className="text-[13px] text-slate-500 mt-2 leading-relaxed">
                    This building scored {latestSnap.energyStarScore}, falling below the 55 threshold, so the 1-100 score gap is ignored.
                  </p>
                </div>
              </div>
            )}

            {pathway === "COMPLIANT" && (
              <p className="text-[13px] text-slate-600 leading-relaxed font-medium">
                This building has exceeded its target score. No further action needed.
              </p>
            )}
          </div>

          {/* Penalty Risk Gauge */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md hover:border-slate-300">
            <h3 className="text-lg font-semibold tracking-tight text-slate-900 mb-6">Penalty Risk Exposure</h3>
            <div className="relative pt-1">
              <div className="flex mb-3 items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold tracking-wider inline-block py-1 uppercase rounded-md text-red-600 bg-red-100/50 px-2.5">
                    Reduced Penalty
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold tracking-tight text-red-600">
                    ${(latestSnap.estimatedPenalty ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="overflow-hidden h-3 mb-4 text-xs flex rounded-full bg-red-100 shadow-inner">
                <div
                  style={{ width: `${Math.min(((latestSnap.estimatedPenalty ?? 0) / Math.max(maxPenaltyExposure, 1)) * 100, 100)}%` }}
                  className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-red-500 transition-all duration-1000 ease-out"
                ></div>
              </div>
              <div className="flex justify-between text-xs font-medium text-slate-500">
                <span>$0</span>
                <span>Max: ${maxPenaltyExposure.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History Timeline */}
      <div className="mt-10 rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
        <h3 className="text-lg font-semibold tracking-tight text-slate-900 mb-6">Compliance History</h3>

        {!history || history.length === 0 ? (
          <p className="py-10 text-center text-sm font-medium text-slate-500 bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
            No compliance snapshots yet. Upload data to generate one.
          </p>
        ) : (
          <div className="relative pl-6">
            <div className="absolute bottom-0 left-[9px] top-2 w-[2px] rounded-full bg-slate-100" />
            <div className="space-y-6">
              {history.map((snap) => {
                const date = new Date(snap.snapshotDate);
                return (
                  <div key={snap.id} className="relative">
                    <div className="absolute -left-6 top-1.5 h-3 w-3 rounded-full border-[3px] border-white bg-slate-300 shadow-sm" />
                    <div className="text-[13px] font-medium flex flex-wrap items-center gap-2">
                      <span className="text-slate-500 min-w-24">
                        {date.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      <span className="text-slate-300 hidden sm:inline">—</span>
                      <span className="text-slate-700 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-md">
                        Score: {snap.energyStarScore ?? "—"}
                      </span>
                      {snap.weatherNormalizedSiteEui != null && (
                        <>
                          <span className="text-slate-300 hidden sm:inline">|</span>
                          <span className="text-slate-700 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-md">
                            Adj. Site EUI: {snap.weatherNormalizedSiteEui.toFixed(1)}
                          </span>
                        </>
                      )}
                      <span className="text-slate-300 hidden sm:inline">|</span>
                      <StatusDot status={snap.complianceStatus} />
                      <span className="text-slate-300 hidden sm:inline">|</span>
                      <span className="text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
                        {TRIGGER_LABELS[snap.triggerType] ?? snap.triggerType}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
