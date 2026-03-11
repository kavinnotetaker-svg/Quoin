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
      <div className="overflow-hidden">
        <div className="loading-bar h-0.5 w-1/3 bg-gray-300" />
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
        <div className="rounded-md border border-green-200 bg-green-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-800">
                Qualifies for 2024 Whole-Cycle Exemption
              </h3>
              <div className="mt-2 text-sm text-green-700">
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
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Pathway: {pathway.replace("_", " ")}
            </h3>

            {pathway === "STANDARD_TARGET" && (
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-500">Current Score</span>
                    <span className="font-medium text-gray-900">{latestSnap.energyStarScore}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${latestSnap.energyStarScore}%` }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-500">Target Score</span>
                    <span className="font-medium text-gray-900">{building.bepsTargetScore}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-gray-400 h-2 rounded-full" style={{ width: `${building.bepsTargetScore}%` }}></div>
                  </div>
                </div>
              </div>
            )}

            {pathway === "PERFORMANCE" && (
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-500">Current Adjusted Site EUI</span>
                    <span className="font-medium text-gray-900">{latestSnap.weatherNormalizedSiteEui?.toFixed(1) || 'N/A'}</span>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-500">Target Reduction (20%)</span>
                    <span className="font-medium text-gray-900">Required</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    This building scored {latestSnap.energyStarScore}, falling below the 55 threshold, so the 1-100 score gap is ignored.
                  </p>
                </div>
              </div>
            )}

            {pathway === "COMPLIANT" && (
              <p className="text-sm text-gray-600">
                This building has exceeded its target score. No further action needed.
              </p>
            )}
          </div>

          {/* Penalty Risk Gauge */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Penalty Risk Exposure</h3>
            <div className="relative pt-1">
              <div className="flex mb-2 items-center justify-between">
                <div>
                  <span className="text-xs font-semibold inline-block py-1 uppercase rounded-full text-red-600 bg-red-200 px-2">
                    Reduced Penalty
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold inline-block text-red-600">
                    ${(latestSnap.estimatedPenalty ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="overflow-hidden h-4 mb-4 text-xs flex rounded bg-red-100">
                <div
                  style={{ width: `${Math.min(((latestSnap.estimatedPenalty ?? 0) / Math.max(maxPenaltyExposure, 1)) * 100, 100)}%` }}
                  className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-red-500"
                ></div>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>$0</span>
                <span>Max: ${maxPenaltyExposure.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History Timeline */}
      <div className="mt-8">
        <h3 className="text-md font-medium text-gray-900 mb-4">Compliance History</h3>

        {!history || history.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">
            No compliance snapshots yet. Upload data to generate one.
          </p>
        ) : (
          <div className="relative pl-5">
            <div className="absolute bottom-0 left-[5px] top-0 w-px bg-gray-200" />
            <div className="space-y-4">
              {history.map((snap) => {
                const date = new Date(snap.snapshotDate);
                return (
                  <div key={snap.id} className="relative">
                    <div className="absolute -left-5 top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-gray-300" />
                    <div className="text-[13px]">
                      <span className="text-gray-500">
                        {date.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      <span className="mx-2 text-gray-300">—</span>
                      <span className="text-gray-700">
                        Score: {snap.energyStarScore ?? "—"}
                      </span>
                      {snap.weatherNormalizedSiteEui != null && (
                        <>
                          <span className="mx-1.5 text-gray-300">|</span>
                          <span className="text-gray-700">
                            Adj. Site EUI: {snap.weatherNormalizedSiteEui.toFixed(1)}
                          </span>
                        </>
                      )}
                      <span className="mx-1.5 text-gray-300">|</span>
                      <StatusDot status={snap.complianceStatus} />
                      <span className="mx-1.5 text-gray-300">|</span>
                      <span className="text-gray-400">
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
