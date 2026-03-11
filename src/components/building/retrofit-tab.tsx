"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  formatMoney,
  formatNumber,
} from "@/components/internal/admin-primitives";

const PROJECT_TYPES = [
  "LED_LIGHTING_RETROFIT",
  "RETRO_COMMISSIONING",
  "BMS_UPGRADE",
  "VARIABLE_FREQUENCY_DRIVES",
  "LOW_FLOW_FIXTURES",
  "HEAT_PUMP_CONVERSION",
  "ENVELOPE_AIR_SEALING",
  "WINDOW_REPLACEMENT",
  "ROOF_INSULATION_UPGRADE",
  "ROOFTOP_SOLAR_PV",
  "CUSTOM",
] as const;

export function RetrofitTab({ buildingId }: { buildingId: string }) {
  const [projectType, setProjectType] = useState<(typeof PROJECT_TYPES)[number]>("LED_LIGHTING_RETROFIT");
  const [name, setName] = useState("");
  const [estimatedCapex, setEstimatedCapex] = useState("");
  const [estimatedAnnualSavingsUsd, setEstimatedAnnualSavingsUsd] = useState("");
  const [estimatedAnnualSavingsKbtu, setEstimatedAnnualSavingsKbtu] = useState("");
  const [estimatedBepsImprovementPct, setEstimatedBepsImprovementPct] = useState("");
  const [estimatedImplementationMonths, setEstimatedImplementationMonths] = useState("");

  const utils = trpc.useUtils();
  const candidates = trpc.retrofit.listCandidates.useQuery({ buildingId, limit: 50 });
  const rankings = trpc.retrofit.rankBuilding.useQuery({ buildingId, limit: 50 });
  const createCandidate = trpc.retrofit.upsertCandidate.useMutation({
    onSuccess: () => {
      setName("");
      setEstimatedCapex("");
      setEstimatedAnnualSavingsUsd("");
      setEstimatedAnnualSavingsKbtu("");
      setEstimatedBepsImprovementPct("");
      setEstimatedImplementationMonths("");
      utils.retrofit.listCandidates.invalidate({ buildingId, limit: 50 });
      utils.retrofit.rankBuilding.invalidate({ buildingId, limit: 50 });
    },
  });

  if (candidates.isLoading || rankings.isLoading) {
    return <LoadingState />;
  }

  if (candidates.error || rankings.error) {
    const error = candidates.error ?? rankings.error;
    return <ErrorState message="Retrofit ranking is unavailable." detail={error?.message} />;
  }

  return (
    <div className="space-y-6">
      <Panel title="Create Retrofit Candidate" subtitle="Manual/internal candidate creation for deterministic retrofit ranking.">
        <div className="grid gap-4 xl:grid-cols-3">
          <label className="text-sm text-gray-700">
            <span className="mb-1 block text-xs text-gray-500">Project type</span>
            <select value={projectType} onChange={(event) => setProjectType(event.target.value as (typeof PROJECT_TYPES)[number])} className="w-full rounded border border-gray-300 px-3 py-2">
              {PROJECT_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-gray-700">
            <span className="mb-1 block text-xs text-gray-500">Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm text-gray-700">
            <span className="mb-1 block text-xs text-gray-500">Capex</span>
            <input value={estimatedCapex} onChange={(event) => setEstimatedCapex(event.target.value)} className="w-full rounded border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm text-gray-700">
            <span className="mb-1 block text-xs text-gray-500">Annual savings (USD)</span>
            <input value={estimatedAnnualSavingsUsd} onChange={(event) => setEstimatedAnnualSavingsUsd(event.target.value)} className="w-full rounded border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm text-gray-700">
            <span className="mb-1 block text-xs text-gray-500">Annual savings (kBtu)</span>
            <input value={estimatedAnnualSavingsKbtu} onChange={(event) => setEstimatedAnnualSavingsKbtu(event.target.value)} className="w-full rounded border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm text-gray-700">
            <span className="mb-1 block text-xs text-gray-500">BEPS improvement (%)</span>
            <input value={estimatedBepsImprovementPct} onChange={(event) => setEstimatedBepsImprovementPct(event.target.value)} className="w-full rounded border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm text-gray-700">
            <span className="mb-1 block text-xs text-gray-500">Implementation months</span>
            <input value={estimatedImplementationMonths} onChange={(event) => setEstimatedImplementationMonths(event.target.value)} className="w-full rounded border border-gray-300 px-3 py-2" />
          </label>
        </div>
        <div className="mt-4">
          <button
            onClick={() =>
              createCandidate.mutate({
                buildingId,
                projectType,
                name: name || undefined,
                estimatedCapex: estimatedCapex ? Number(estimatedCapex) : undefined,
                estimatedAnnualSavingsUsd: estimatedAnnualSavingsUsd ? Number(estimatedAnnualSavingsUsd) : undefined,
                estimatedAnnualSavingsKbtu: estimatedAnnualSavingsKbtu ? Number(estimatedAnnualSavingsKbtu) : undefined,
                estimatedBepsImprovementPct: estimatedBepsImprovementPct ? Number(estimatedBepsImprovementPct) : undefined,
                estimatedImplementationMonths: estimatedImplementationMonths ? Number(estimatedImplementationMonths) : undefined,
                status: "ACTIVE",
              })
            }
            disabled={createCandidate.isPending}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {createCandidate.isPending ? "Saving..." : "Save Candidate"}
          </button>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Candidate Registry" subtitle="Canonical retrofit candidates for this building.">
          {!candidates.data || candidates.data.length === 0 ? (
            <EmptyState message="No retrofit candidates exist for this building yet." />
          ) : (
            <div className="space-y-3">
              {candidates.data.map((candidate) => (
                <div key={candidate.id} className="rounded border border-gray-200 px-3 py-3">
                  <div className="font-medium text-gray-900">{candidate.name}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {candidate.projectType} • {candidate.status} • {candidate.confidenceBand}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-600">
                    <span>Capex {formatMoney(candidate.estimatedCapex)}</span>
                    <span>Savings {formatMoney(candidate.estimatedAnnualSavingsUsd)}</span>
                    <span>BEPS {formatNumber(candidate.estimatedBepsImprovementPct)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Ranking Output" subtitle="Deterministic retrofit ranking by avoided penalty, savings, timing, and confidence.">
          {!rankings.data || rankings.data.length === 0 ? (
            <EmptyState message="No retrofit rankings are available yet." />
          ) : (
            <div className="space-y-3">
              {rankings.data.map((ranking) => (
                <div key={ranking.candidateId} className="rounded border border-gray-200 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-gray-900">{ranking.name}</div>
                    <div className="text-xs text-gray-500">{ranking.priorityBand}</div>
                  </div>
                  <div className="mt-2 grid gap-2 text-xs text-gray-600 sm:grid-cols-2">
                    <div>Priority score {ranking.priorityScore}</div>
                    <div>Avoided penalty {formatMoney(ranking.estimatedAvoidedPenalty)}</div>
                    <div>Net cost {formatMoney(ranking.netProjectCost)}</div>
                    <div>Payback {ranking.paybackProxyYears ?? "—"} years</div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {ranking.reasonCodes.map((reasonCode) => (
                      <span key={reasonCode} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700">
                        {reasonCode}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
